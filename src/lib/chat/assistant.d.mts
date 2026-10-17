export interface CustomerAssistant {
  /** The admin's public username; null when they have none yet. */
  name: string | null;
  /** Assigned to the conversation (vs. just the last admin who replied). */
  assigned: boolean;
}
export function pickAssistant(input: {
  assignedAdminId: string | null | undefined;
  lastAdminId: string | null | undefined;
  publicNames: Map<string, string> | undefined;
}): CustomerAssistant | null;
export function currentAssistant(
  serverAssistant: CustomerAssistant | null | undefined,
  messages: ReadonlyArray<{ senderRole: "customer" | "admin"; senderName?: string | null }> | undefined,
): CustomerAssistant | null;
export function assistantLine(assistant: CustomerAssistant | null | undefined): string;
