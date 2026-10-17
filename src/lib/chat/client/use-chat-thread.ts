"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ThreadAction } from "@/lib/chat/thread-state.mjs";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import { createConversationCache, type ConversationCache } from "@/lib/chat/conversation-cache.mjs";
import { createConversationLoader, type ConversationLoader } from "@/lib/chat/conversation-loader.mjs";
import { fetchJson, jsonInit, newClientId, RequestError } from "@/lib/chat/client/fetch-json";

type Viewer = "admin" | "customer";

interface Options {
  orderNumber: string;
  viewer: Viewer;
  initialMessages?: ChatMessageDto[];
  initialHasOlder?: boolean;
  /** Admin inbox: the shared conversation cache + loader (data survives switching). */
  cache?: ConversationCache<unknown>;
  loader?: ConversationLoader;
}

/**
 * Data side of one chat thread: first page, older pages, delta fetches
 * after realtime pings, and sends with optimistic bubbles, upload progress,
 * retry and a client message id that makes retries idempotent end to end.
 *
 * All state lives in a conversation cache keyed by order number — the
 * inbox's shared cache, or a private one-conversation cache (customer
 * page). Every update names its conversation, so a response for another
 * chat can never land in this one.
 */
export function useChatThread({ orderNumber, viewer, initialMessages, initialHasOlder, cache: sharedCache, loader: sharedLoader }: Options) {
  const [own] = useState(() => {
    if (sharedCache && sharedLoader) return null;
    const cache = createConversationCache({ limit: 1 });
    cache.pin(orderNumber);
    if (initialMessages) {
      cache.dispatch(orderNumber, { type: "loaded", messages: initialMessages, hasOlder: Boolean(initialHasOlder) });
    }
    return { cache, loader: createConversationLoader({ cache, fetchJson, viewer }) };
  });
  const cache = sharedCache ?? own!.cache;
  const loader = sharedLoader ?? own!.loader;

  const getThread = useCallback(() => cache.getThread(orderNumber), [cache, orderNumber]);
  const state = useSyncExternalStore(cache.subscribe, getThread, getThread);
  const loadError = useSyncExternalStore(
    cache.subscribe,
    () => Boolean(cache.get(orderNumber)?.threadError),
    () => false,
  );
  const dispatch = useCallback(
    (action: ThreadAction) => {
      cache.dispatch(orderNumber, action);
    },
    [cache, orderNumber],
  );
  const base = `/api/order-chat/${encodeURIComponent(orderNumber)}`;
  const actingAs = `as=${viewer}`;

  // Local preview URLs are released once the server copy replaces them.
  const revokePreview = useCallback((clientMessageId: string) => {
    const url = getThread().pending.find((item) => item.clientMessageId === clientMessageId)?.previewUrl;
    if (url) URL.revokeObjectURL(url);
  }, [getThread]);

  // Files for pending image sends, kept for retry (in the cache, so a retry
  // still works after switching away and back).
  const files = cache.files;
  const inFlight = cache.inFlight;

  // ---- loading (the inbox starts these itself when a chat is opened)
  useEffect(() => {
    if (sharedLoader) return;
    void loader.ensureThread(orderNumber);
  }, [sharedLoader, loader, orderNumber]);

  const loadOlder = useCallback(() => loader.loadOlder(orderNumber), [loader, orderNumber]);
  const fetchNewer = useCallback(() => loader.fetchNewer(orderNumber), [loader, orderNumber]);
  const reload = useCallback(() => loader.ensureThread(orderNumber, { maxAgeMs: 0 }), [loader, orderNumber]);

  // ---- sending
  const postText = useCallback(
    async (clientMessageId: string, text: string) => {
      if (inFlight.has(clientMessageId)) return;
      inFlight.add(clientMessageId);
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
        inFlight.delete(clientMessageId);
      }
    },
    [base, actingAs, dispatch, inFlight],
  );

  const postImage = useCallback(
    (clientMessageId: string, file: File, caption: string) => {
      if (inFlight.has(clientMessageId)) return;
      inFlight.add(clientMessageId);
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
        inFlight.delete(clientMessageId);
        const body = xhr.response as { message?: ChatMessageDto; error?: string } | null;
        if (xhr.status >= 200 && xhr.status < 300 && body?.message) {
          files.delete(clientMessageId);
          revokePreview(clientMessageId);
          dispatch({ type: "confirmed", clientMessageId, message: body.message });
        } else {
          dispatch({ type: "failed", clientMessageId, error: body?.error ?? "Upload failed." });
        }
      };
      xhr.onerror = () => {
        inFlight.delete(clientMessageId);
        dispatch({ type: "failed", clientMessageId, error: "No connection. Tap to retry." });
      };
      xhr.send(form);
    },
    [base, actingAs, revokePreview, dispatch, files, inFlight],
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
    [postText, dispatch],
  );

  const sendImage = useCallback(
    (file: File, caption: string) => {
      const clientMessageId = newClientId();
      files.set(clientMessageId, { file, caption });
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
    [postImage, dispatch, files],
  );

  /** Retries with the SAME client id, so a lost-response retry cannot duplicate. */
  const retry = useCallback(
    (clientMessageId: string) => {
      const item = getThread().pending.find((pending) => pending.clientMessageId === clientMessageId);
      if (!item || item.status !== "failed") return;
      dispatch({ type: "retry", clientMessageId });
      if (item.kind === "image") {
        const entry = files.get(clientMessageId);
        if (entry) postImage(clientMessageId, entry.file, entry.caption);
      } else {
        void postText(clientMessageId, item.body);
      }
    },
    [postImage, postText, getThread, dispatch, files],
  );

  const discard = useCallback((clientMessageId: string) => {
    files.delete(clientMessageId);
    revokePreview(clientMessageId);
    dispatch({ type: "discard", clientMessageId });
  }, [revokePreview, dispatch, files]);

  /** Adds a message the server already created (e.g. payment details). */
  const addConfirmed = useCallback((message: ChatMessageDto) => {
    dispatch({ type: "received", messages: [message] });
  }, [dispatch]);

  // ---- read position (fire-and-forget; never blocks the thread)
  const lastMarked = useRef<string | null>(null);
  /** "skipped" = already reported; "failed" = the server did not record it. */
  const markRead = useCallback(
    async (messageId: string): Promise<"ok" | "skipped" | "failed"> => {
      if (lastMarked.current === messageId) return "skipped";
      lastMarked.current = messageId;
      try {
        await fetchJson<{ cursor: unknown }>(`${base}/read?${actingAs}`, jsonInit("POST", { messageId }));
        return "ok";
      } catch {
        lastMarked.current = null;
        return "failed";
      }
    },
    [base, actingAs],
  );

  return { state, loadError, reload, loadOlder, fetchNewer, sendText, sendImage, retry, discard, addConfirmed, markRead };
}
