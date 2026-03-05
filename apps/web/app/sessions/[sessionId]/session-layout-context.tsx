"use client";

import { createContext, useContext } from "react";
import type { FileUIPart } from "ai";
import type { SessionChatListItem } from "@/hooks/use-session-chats";
import type { Chat } from "@/lib/db/schema";

type CreateChatResult = {
  chat: Chat;
  persisted: Promise<Chat>;
};

export type QueuedComposerMessage = {
  id: string;
  text: string;
  files?: FileUIPart[];
};

type SessionLayoutContextValue = {
  session: {
    title: string;
    repoName: string | null;
    repoOwner: string | null;
    cloneUrl: string | null;
    branch: string | null;
    status: string;
    prNumber: number | null;
    linesAdded: number | null;
    linesRemoved: number | null;
  };
  chats: SessionChatListItem[];
  chatsLoading: boolean;
  createChat: () => CreateChatResult;
  switchChat: (chatId: string) => void;
  queuedMessagesByChatId: Record<string, QueuedComposerMessage[]>;
  setQueuedMessagesForChat: (
    chatId: string,
    updater: (
      previousMessages: QueuedComposerMessage[],
    ) => QueuedComposerMessage[],
  ) => void;
};

export const SessionLayoutContext = createContext<
  SessionLayoutContextValue | undefined
>(undefined);

export function useSessionLayout() {
  const context = useContext(SessionLayoutContext);
  if (!context) {
    throw new Error(
      "useSessionLayout must be used within a SessionLayoutShell",
    );
  }
  return context;
}
