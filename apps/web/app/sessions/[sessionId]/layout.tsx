import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  getArchivedSessionCountByTeamScope,
  getChatSummariesBySessionId,
  getSessionByIdForUser,
  getSessionsWithUnreadByTeamScope,
} from "@/lib/db/sessions";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { resolveActiveTeamIdForSession } from "@/lib/session/active-team";
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

  const session = await getServerSession();
  if (!session?.user) {
    redirect("/");
  }

  const sessionRecord = await getSessionByIdForUser(
    sessionId,
    session.user.id,
    {
      teamId: session.activeTeamId,
    },
  );
  if (!sessionRecord) {
    notFound();
  }

  const activeTeamId = await resolveActiveTeamIdForSession(session);

  let initialChatsData:
    | {
        chats: Awaited<ReturnType<typeof getChatSummariesBySessionId>>;
        defaultModelId: string | null;
      }
    | undefined;
  let initialSessionsData:
    | {
        sessions: Awaited<ReturnType<typeof getSessionsWithUnreadByTeamScope>>;
        archivedCount: number;
      }
    | undefined;

  try {
    const [chats, preferences, sessions, archivedCount] = await Promise.all([
      getChatSummariesBySessionId(sessionId, session.user.id),
      getUserPreferences(session.user.id),
      getSessionsWithUnreadByTeamScope(session.user.id, activeTeamId, {
        status: "active",
        scope: "mine",
      }),
      getArchivedSessionCountByTeamScope({
        userId: session.user.id,
        teamId: activeTeamId,
        scope: "mine",
      }),
    ]);
    initialChatsData = {
      chats,
      defaultModelId: preferences.defaultModelId,
    };
    initialSessionsData = { sessions, archivedCount };
  } catch (error) {
    console.error("Failed to prefetch sidebar data:", error);
  }

  return (
    <SessionLayoutShell
      session={sessionRecord}
      currentUser={session.user}
      initialChatsData={initialChatsData}
      initialSessionsData={initialSessionsData}
    >
      {children}
    </SessionLayoutShell>
  );
}
