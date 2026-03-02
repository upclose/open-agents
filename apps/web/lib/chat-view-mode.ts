export type ChatViewMode = "condensed" | "full";

export const CHAT_VIEW_MODE_STORAGE_KEY = "open-harness-chat-view-mode";
export const DEFAULT_CHAT_VIEW_MODE: ChatViewMode = "condensed";

export function isChatViewMode(value: string | null): value is ChatViewMode {
  return value === "condensed" || value === "full";
}

export function loadChatViewModeFromStorage(): ChatViewMode {
  if (typeof window === "undefined") {
    return DEFAULT_CHAT_VIEW_MODE;
  }

  const storedValue = window.localStorage.getItem(CHAT_VIEW_MODE_STORAGE_KEY);
  return isChatViewMode(storedValue) ? storedValue : DEFAULT_CHAT_VIEW_MODE;
}

export function saveChatViewModeToStorage(mode: ChatViewMode): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CHAT_VIEW_MODE_STORAGE_KEY, mode);
}
