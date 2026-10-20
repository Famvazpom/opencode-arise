/** Minimal shape of the V2 projected session messages we read. */
interface SessionMessageLike {
  type?: string;
  content?: ReadonlyArray<{ type?: string; text?: string }>;
}

function assistantText(message: SessionMessageLike): string {
  if (message.type !== "assistant") return "";
  return (message.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
}

/** Last assistant text response in a session transcript. */
export function extractLastAssistantText(messages: readonly SessionMessageLike[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = assistantText(messages[i]);
    if (text) return text;
  }
  return "";
}

/** Recent assistant text, newest last, used by the todo enforcer. */
export function recentAssistantText(
  messages: readonly SessionMessageLike[],
  limit = 5,
): Array<{ content: string }> {
  return messages
    .map(assistantText)
    .filter((text) => text.length > 0)
    .slice(-limit)
    .map((content) => ({ content }));
}
