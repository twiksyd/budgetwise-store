export type UploadResult<T> = { ok: true; value: T } | { ok: false; error: string };
export function runUploadQueue<I, T>(
  items: I[],
  worker: (item: I, index: number, onFileProgress: (fraction: number) => void) => Promise<T>,
  options?: {
    concurrency?: number;
    onProgress?: (progress: { completed: number; total: number; fraction: number }) => void;
  },
): Promise<UploadResult<T>[]>;
export function uploadProgressText(progress: { completed: number; total: number }): string;
