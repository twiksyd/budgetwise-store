"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ThreadAction } from "@/lib/chat/thread-state.mjs";
import type { ChatMessageDto } from "@/lib/chat/dto.mjs";
import {
  createConversationCache,
  type ConversationCache,
  type PendingAlbumImage,
} from "@/lib/chat/conversation-cache.mjs";
import { ALBUM_MAX_IMAGES, UPLOAD_CONCURRENCY } from "@/lib/chat/album.mjs";
import { runUploadQueue } from "@/lib/chat/upload-queue.mjs";
import { prepareAlbumImage, type PreparedAlbumImage } from "@/lib/prepare-chat-image";
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
    const item = getThread().pending.find((pending) => pending.clientMessageId === clientMessageId);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    for (const url of item?.previews ?? []) URL.revokeObjectURL(url);
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
      files.set(clientMessageId, { kind: "image", file, caption });
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

  // ---- albums: up to 10 images as ONE message. Each image (+ thumbnail) is
  // uploaded on its own request, two at a time; then one message is posted.
  // A retry re-uploads only the images that failed, with the same id.
  const uploadImage = useCallback(
    (
      clientMessageId: string,
      position: number,
      prepared: PreparedAlbumImage,
      onProgress: (fraction: number) => void,
      requests: Set<XMLHttpRequest>,
    ) =>
      new Promise<void>((resolve, reject) => {
        const form = new FormData();
        form.set("clientMessageId", clientMessageId);
        form.set("position", String(position));
        form.set("file", prepared.file);
        form.set("thumb", new File([prepared.thumb], `${position}.thumb`, { type: prepared.thumb.type }));
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${base}/uploads?${actingAs}`);
        xhr.responseType = "json";
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(event.loaded / event.total);
        };
        requests.add(xhr);
        const done = () => requests.delete(xhr);
        xhr.onload = () => {
          done();
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error((xhr.response as { error?: string } | null)?.error ?? "Upload failed."));
        };
        xhr.onerror = () => {
          done();
          reject(new Error("No connection."));
        };
        xhr.onabort = () => {
          done();
          reject(new Error("Cancelled."));
        };
        xhr.send(form);
      }),
    [base, actingAs],
  );

  const postAlbumMessage = useCallback(
    async (clientMessageId: string) => {
      const entry = files.get(clientMessageId);
      if (entry?.kind !== "album" || entry.cancelled || inFlight.has(clientMessageId)) return;
      inFlight.add(clientMessageId);
      const requests = (entry.requests ??= new Set());
      const total = entry.images.length;
      try {
        const todo = entry.images
          .map((image, position) => ({ image, position }))
          .filter(({ image }) => !image.uploaded);
        const alreadyUploaded = total - todo.length;
        const results = await runUploadQueue(
          todo,
          async ({ image, position }, _index, onProgress) => {
            if (entry.cancelled) throw new Error("Cancelled.");
            if (!image.prepared) {
              if (!image.file) throw new Error("Image no longer available.");
              image.prepared = await prepareAlbumImage(image.file);
              image.width = image.prepared.width;
              image.height = image.prepared.height;
            }
            await uploadImage(clientMessageId, position, image.prepared, onProgress, requests);
            image.uploaded = true;
            // Release the big buffers as soon as each image is safely up.
            image.prepared = null;
            image.file = null;
          },
          {
            concurrency: UPLOAD_CONCURRENCY,
            onProgress: ({ completed, total: count, fraction }) =>
              dispatch({
                type: "progress",
                clientMessageId,
                progress: (alreadyUploaded + fraction * count) / total,
                uploaded: alreadyUploaded + completed,
              }),
          },
        );
        // Cancelled meanwhile: the bubble is gone and the files are being deleted.
        if (entry.cancelled) return;
        const failedFiles = results.flatMap((result, index) =>
          result.ok ? [] : [{ position: todo[index].position, name: todo[index].image.name, error: result.error }],
        );
        if (failedFiles.length) {
          dispatch({
            type: "failed",
            clientMessageId,
            error: failedFiles.length === 1 ? "1 image did not upload." : `${failedFiles.length} images did not upload.`,
            failedFiles,
          });
          return;
        }
        entry.posting = true;
        const body = await fetchJson<{ message: ChatMessageDto }>(
          `${base}/messages?${actingAs}`,
          jsonInit("POST", {
            kind: "album",
            clientMessageId,
            body: entry.caption,
            label: entry.label,
            items: entry.images.map((image, position) => ({ position, width: image.width, height: image.height })),
          }),
        );
        files.delete(clientMessageId);
        revokePreview(clientMessageId);
        dispatch({ type: "confirmed", clientMessageId, message: body.message });
      } catch (error) {
        if (!entry.cancelled) {
          dispatch({
            type: "failed",
            clientMessageId,
            error: error instanceof RequestError ? error.message : "Not sent.",
          });
        }
      } finally {
        entry.posting = false;
        inFlight.delete(clientMessageId);
      }
    },
    [base, actingAs, dispatch, files, inFlight, revokePreview, uploadImage],
  );

  const sendAlbum = useCallback(
    (picked: File[], caption: string, label: "proof_of_delivery" | null = null) => {
      const chosen = picked.slice(0, ALBUM_MAX_IMAGES);
      if (chosen.length === 0) return null;
      const clientMessageId = newClientId();
      const images: PendingAlbumImage[] = chosen.map((file) => ({
        name: file.name,
        file,
        prepared: null,
        width: null,
        height: null,
        uploaded: false,
      }));
      files.set(clientMessageId, { kind: "album", images, caption, label });
      dispatch({
        type: "send",
        item: {
          clientMessageId,
          kind: "album",
          body: caption,
          previews: chosen.map((file) => URL.createObjectURL(file)),
          label,
          createdAt: new Date().toISOString(),
        },
      });
      void postAlbumMessage(clientMessageId);
      return clientMessageId;
    },
    [dispatch, files, postAlbumMessage],
  );

  /** Retries with the SAME client id, so a lost-response retry cannot duplicate. */
  const retry = useCallback(
    (clientMessageId: string) => {
      const item = getThread().pending.find((pending) => pending.clientMessageId === clientMessageId);
      if (!item || item.status !== "failed") return;
      dispatch({ type: "retry", clientMessageId });
      const entry = files.get(clientMessageId);
      if (item.kind === "album") {
        void postAlbumMessage(clientMessageId);
      } else if (item.kind === "image") {
        if (entry?.kind === "image") postImage(clientMessageId, entry.file, entry.caption);
      } else {
        void postText(clientMessageId, item.body);
      }
    },
    [postImage, postText, postAlbumMessage, getThread, dispatch, files],
  );

  /**
   * Removes an unsent message. For an album this is also Cancel while it
   * uploads: running uploads are aborted and whatever already reached the
   * server is deleted (best-effort; the cleanup job catches the rest).
   * Once the album message itself is on its way it can no longer be cancelled.
   */
  const discard = useCallback((clientMessageId: string) => {
    const entry = files.get(clientMessageId);
    if (entry?.kind === "album") {
      if (entry.posting) return;
      entry.cancelled = true;
      for (const xhr of entry.requests ?? []) xhr.abort();
      for (const image of entry.images) {
        image.file = null;
        image.prepared = null;
      }
      const params = new URLSearchParams({ as: viewer, clientMessageId });
      void fetch(`${base}/uploads?${params}`, { method: "DELETE" }).catch(() => undefined);
    }
    files.delete(clientMessageId);
    revokePreview(clientMessageId);
    dispatch({ type: "discard", clientMessageId });
  }, [revokePreview, dispatch, files, base, viewer]);

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

  return { state, loadError, reload, loadOlder, fetchNewer, sendText, sendImage, sendAlbum, retry, discard, addConfirmed, markRead };
}
