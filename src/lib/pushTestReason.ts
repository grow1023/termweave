/**
 * The cause of a failed test push, short enough to show in Settings. An ApiError's message is
 * "<url> failed (<status>): <detail>"; the URL means nothing to the user, the status and the
 * server's detail do.
 */
export function pushFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const api = /failed \((\d{3})\): ([\s\S]*)$/u.exec(message);
  const reason = api ? `${api[1]} ${api[2]!.trim()}`.trim() : message.trim();
  // a long server text would push the row's controls away: the start says enough
  return reason.length > 160 ? `${reason.slice(0, 159)}…` : reason;
}
