export const ORPHAN_RETENTION_HOURS: number;

export function cleanupOrphanUploads(input: {
  list: (olderThanHours: number, limit: number) => Promise<{ name: string; created_at?: string }[]>;
  remove: (names: string[]) => Promise<void>;
  olderThanHours?: number;
  batchSize?: number;
  maxBatches?: number;
  dryRun?: boolean;
}): Promise<{ listed: number; removed: number; batches: number; dryRun: boolean }>;
