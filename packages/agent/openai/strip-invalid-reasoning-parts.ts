import type { ModelMessage } from "ai";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stripInvalidOpenAIReasoningParts(
  messages: ModelMessage[],
  modelId: string,
): { messages: ModelMessage[]; strippedBlocks: number } {
  if (!modelId.startsWith("openai/")) {
    return { messages, strippedBlocks: 0 };
  }

  let strippedBlocks = 0;

  const sanitizedMessages = messages.map((message) => {
    if (
      !message ||
      message.role !== "assistant" ||
      typeof message.content === "string"
    ) {
      return message;
    }

    let changed = false;
    const sanitizedContent = message.content.filter((part) => {
      if (!part || part.type !== "reasoning") {
        return true;
      }

      const providerOptions =
        "providerOptions" in part ? part.providerOptions : undefined;
      const openaiOptions =
        isRecord(providerOptions) && isRecord(providerOptions.openai)
          ? providerOptions.openai
          : null;
      if (!openaiOptions) {
        return true;
      }

      const itemId = openaiOptions.itemId;
      if (typeof itemId !== "string" || itemId.length === 0) {
        return true;
      }

      const encryptedContent = openaiOptions.reasoningEncryptedContent;
      if (
        typeof encryptedContent === "string" &&
        encryptedContent.trim().length > 0
      ) {
        return true;
      }

      strippedBlocks += 1;
      changed = true;
      return false;
    });

    return changed ? { ...message, content: sanitizedContent } : message;
  });

  return { messages: sanitizedMessages, strippedBlocks };
}
