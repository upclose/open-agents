import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getLatestAutomationRunBySessionId } from "@/lib/db/automations";
import { getChatSummariesBySessionId } from "@/lib/db/sessions";
import { getSessionByIdCached } from "@/lib/db/sessions-cache";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { getServerSession } from "@/lib/session/get-server-session";
import { SessionLayoutShell } from "./session-layout-shell";

interface SessionLayoutProps {
  params: Promise<{ sessionId: string }>;
  children: ReactNode;
}

export default async function SessionLayout({
  params,
  children,
}: SessionLayoutProps) {
  const { sessionId } = await params;

  const sessionPromise = getServerSession();
  const sessionRecordPromise = getSessionByIdCached(sessionId);

  const session = await sessionPromise;
  if (!session?.user) {
    redirect("/");
  }

  const sessionRecord = await sessionRecordPromise;
  if (!sessionRecord) {
    notFound();
  }

  if (sessionRecord.userId !== session.user.id) {
    redirect("/");
  }

  let initialChatsData:
    | {
        chats: Awaited<ReturnType<typeof getChatSummariesBySessionId>>;
        defaultModelId: string | null;
      }
    | undefined;
  let automationRun: {
    status: string | null;
    needsAttentionReason: string | null;
  } | null = null;

  try {
    const [chats, preferences, latestAutomationRun] = await Promise.all([
      getChatSummariesBySessionId(sessionId, session.user.id),
      getUserPreferences(session.user.id),
      sessionRecord.runSource === "automation"
        ? getLatestAutomationRunBySessionId(sessionId)
        : Promise.resolve(null),
    ]);
    initialChatsData = {
      chats,
      defaultModelId: preferences.defaultModelId,
    };
    automationRun = latestAutomationRun
      ? {
          status: latestAutomationRun.status,
          needsAttentionReason: latestAutomationRun.needsAttentionReason,
        }
      : null;
  } catch (error) {
    console.error("Failed to prefetch session chat data:", error);
  }

  return (
    <SessionLayoutShell
      automationRun={automationRun}
      session={sessionRecord}
      initialChatsData={initialChatsData}
    >
      {children}
    </SessionLayoutShell>
  );
}
