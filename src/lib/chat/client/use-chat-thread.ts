"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  initialThread,
  newestMessageId,
  oldestMessageId,
  threadReducer,
} from "@/lib/chat/thread-state.mjs";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import { fetchJson, jsonInit, newClientId, RequestError } from "@/lib/chat/client/fetch-json";

type Viewer = "admin" | "customer";

interface Options {
  orderNumber: string;
  viewer: Viewer;
  initialMessages?: ChatMessageDto[];
  initialHasOlder?: boolean;
}

/**
 * Data side of one chat thread: first page, older pages, delta fetches
 * after realtime pings, and sends with optimistic bubbles, upload progress,
 * retry and a client message id that makes retries idempotent end to end.
 */
export function useChatThread({ orderNumber, viewer, initialMessages, initialHasOlder }: Options) {
  const [state, dispatch] = useReducer(
    threadReducer,
    initialThread,
    (base) =>
      initialMessages
        ? threadReducer(base, { type: "loaded", messages: initialMessages, hasOlder: Boolean(initialHasOlder) })
        : base,
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const base = `/api/order-chat/${encodeURIComponent(orderNumber)}`;
  const actingAs = `as=${viewer}`;

  // Local preview URLs are released once the server copy replaces them.
  const revokePreview = useCallback((clientMessageId: string) => {
    const url = stateRef.current.pending.find((item) => item.clientMessageId === clientMessageId)?.previewUrl;
    if (url) URL.revokeObjectURL(url);
  }, []);

  // Files for pending image sends, kept for retry.
  const files = useRef(new Map<string, { file: File; caption: string }>());
  const inFlight = useRef(new Set<string>());

  // ---- loading
  useEffect(() => {
    if (initialMessages) return;
    let cancelled = false;
    void fetchJson<{ messages: ChatMessageDto[]; hasOlder?: boolean }>(`${base}/messages?${actingAs}`)
      .then((body) => {
        if (!cancelled) dispatch({ type: "loaded", messages: body.messages, hasOlder: Boolean(body.hasOlder) });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "loaded", messages: [], hasOlder: false });
      });
    return () => {
      cancelled = true;
    };
    // initialMessages is only read on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, actingAs]);

  const loadOlder = useCallback(async () => {
    const current = stateRef.current;
    const oldest = oldestMessageId(current);
    if (!current.hasOlder || current.loadingOlder || !oldest) return;
    dispatch({ type: "loading_older" });
    try {
      const body = await fetchJson<{ messages: ChatMessageDto[]; hasOlder?: boolean }>(
        `${base}/messages?${actingAs}&before=${oldest}`,
      );
      dispatch({ type: "older", messages: body.messages, hasOlder: Boolean(body.hasOlder) });
    } catch {
      dispatch({ type: "older", messages: [], hasOlder: true });
    }
  }, [base, actingAs]);

  // Delta fetch, coalesced: pings that arrive during a fetch trigger one more.
  const fetching = useRef(false);
  const dirty = useRef(false);
  const fetchNewer = useCallback(async () => {
    if (fetching.current) {
      dirty.current = true;
      return;
    }
    fetching.current = true;
    try {
      do {
        dirty.current = false;
        const newest = newestMessageId(stateRef.current);
        const url = newest
          ? `${base}/messages?${actingAs}&after=${newest}`
          : `${base}/messages?${actingAs}`;
        const body = await fetchJson<{ messages: ChatMessageDto[] }>(url);
        dispatch({ type: "received", messages: body.messages });
      } while (dirty.current);
    } catch {
      // Next ping, resync or poll tries again.
    } finally {
      fetching.current = false;
    }
  }, [base, actingAs]);

  // ---- sending
  const postText = useCallback(
    async (clientMessageId: string, text: string) => {
      if (inFlight.current.has(clientMessageId)) return;
      inFlight.current.add(clientMessageId);
      try {
        const body = await fetchJson<{ message: ChatMessageDto }>(
          `${base}/messages?${actingAs}`,
          jsonInit("POST", { body: text, clientMessageId }),
        );
        dispatch({ type: "confirmed", clientMessageId, message: body.message });
      } catch (error) {
        dispatch({
          type: "failed",
          clientMessageId,
          error: error instanceof RequestError ? error.message : "Not sent.",
        });
      } finally {
        inFlight.current.delete(clientMessageId);
      }
    },
    [base, actingAs],
  );

  const postImage = useCallback(
    (clientMessageId: string, file: File, caption: string) => {
      if (inFlight.current.has(clientMessageId)) return;
      inFlight.current.add(clientMessageId);
      const form = new FormData();
      form.set("body", caption);
      form.set("clientMessageId", clientMessageId);
      form.set("file", file);

      // XHR, because fetch cannot report upload progress.
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${base}/messages?${actingAs}`);
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          dispatch({ type: "progress", clientMessageId, progress: event.loaded / event.total });
        }
      };
      xhr.onload = () => {
        inFlight.current.delete(clientMessageId);
        const body = xhr.response as { message?: ChatMessageDto; error?: string } | null;
        if (xhr.status >= 200 && xhr.status < 300 && body?.message) {
          files.current.delete(clientMessageId);
          revokePreview(clientMessageId);
          dispatch({ type: "confirmed", clientMessageId, message: body.message });
        } else {
          dispatch({ type: "failed", clientMessageId, error: body?.error ?? "Upload failed." });
        }
      };
      xhr.onerror = () => {
        inFlight.current.delete(clientMessageId);
        dispatch({ type: "failed", clientMessageId, error: "No connection. Tap to retry." });
      };
      xhr.send(form);
    },
    [base, actingAs, revokePreview],
  );

  const sendText = useCallback(
    (text: string) => {
      const clientMessageId = newClientId();
      dispatch({
        type: "send",
        item: { clientMessageId, kind: "text", body: text, createdAt: new Date().toISOString() },
      });
      void postText(clientMessageId, text);
      return clientMessageId;
    },
    [postText],
  );

  const sendImage = useCallback(
    (file: File, caption: string) => {
      const clientMessageId = newClientId();
      files.current.set(clientMessageId, { file, caption });
      dispatch({
        type: "send",
        item: {
          clientMessageId,
          kind: "image",
          body: caption,
          previewUrl: URL.createObjectURL(file),
          createdAt: new Date().toISOString(),
        },
      });
      postImage(clientMessageId, file, caption);
      return clientMessageId;
    },
    [postImage],
  );

  /** Retries with the SAME client id, so a lost-response retry cannot duplicate. */
  const retry = useCallback(
    (clientMessageId: string) => {
      const item = stateRef.current.pending.find((pending) => pending.clientMessageId === clientMessageId);
      if (!item || item.status !== "failed") return;
      dispatch({ type: "retry", clientMessageId });
      if (item.kind === "image") {
        const entry = files.current.get(clientMessageId);
        if (entry) postImage(clientMessageId, entry.file, entry.caption);
      } else {
        void postText(clientMessageId, item.body);
      }
    },
    [postImage, postText],
  );

  const discard = useCallback((clientMessageId: string) => {
    files.current.delete(clientMessageId);
    revokePreview(clientMessageId);
    dispatch({ type: "discard", clientMessageId });
  }, [revokePreview]);

  /** Adds a message the server already created (e.g. payment details). */
  const addConfirmed = useCallback((message: ChatMessageDto) => {
    dispatch({ type: "received", messages: [message] });
  }, []);

  // ---- read position
  const lastMarked = useRef<string | null>(null);
  const markRead = useCallback(
    async (messageId: string) => {
      if (lastMarked.current === messageId) return null;
      lastMarked.current = messageId;
      try {
        return await fetchJson<{ cursor: unknown }>(
          `${base}/read?${actingAs}`,
          jsonInit("POST", { messageId }),
        );
      } catch {
        lastMarked.current = null;
        return null;
      }
    },
    [base, actingAs],
  );

  return { state, loadOlder, fetchNewer, sendText, sendImage, retry, discard, addConfirmed, markRead };
}
