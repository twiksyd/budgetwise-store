// Who the customer is talking to, as customers see it. Pure, so the API and
// the chat header share one rule and it can be tested without a database.
//
// The assistant is the assigned admin, else the last admin who replied.
// Customers only ever get { name: <public username>, assigned } — never an
// admin id, real name or email. name is null when that admin has no public
// username yet.

/** null = nobody is assisting yet ("Waiting for an assistant"). */
export function pickAssistant({ assignedAdminId, lastAdminId, publicNames }) {
  const adminId = assignedAdminId || lastAdminId || null;
  if (!adminId) return null;
  return { name: publicNames?.get(adminId) ?? null, assigned: Boolean(assignedAdminId) };
}

/**
 * What the open chat shows: an assignment from the server wins; otherwise
 * the newest admin reply already on screen (so the header follows a reply
 * the moment it arrives), else what the server said.
 */
export function currentAssistant(serverAssistant, messages) {
  if (serverAssistant?.assigned) return serverAssistant;
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.senderRole === "admin") {
      return message.senderName ? { name: message.senderName, assigned: false } : (serverAssistant ?? { name: null, assigned: false });
    }
  }
  return serverAssistant ?? null;
}

/** The header's second line. */
export function assistantLine(assistant) {
  if (!assistant) return "Waiting for an assistant";
  return assistant.name ? `Assisted by ${assistant.name}` : "Assisted by the BudgetWise team";
}
