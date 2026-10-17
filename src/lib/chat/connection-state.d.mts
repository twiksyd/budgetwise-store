export type ConnectionStatus = "idle" | "connecting" | "live" | "reconnecting" | "offline";
export function deriveConnectionStatus(input: {
  online: boolean;
  channelState: string | null;
  hasTopic?: boolean;
  failedBefore?: boolean;
  wasLive?: boolean;
}): ConnectionStatus;
export function reconnectDelay(attempt: number): number;
export function pollIntervalFor(status: ConnectionStatus): number | null;
export function shouldResync(input: {
  previous: ConnectionStatus;
  next: ConnectionStatus;
  hasConnectedBefore: boolean;
  becameVisible?: boolean;
}): boolean;
