import { notFound, redirect } from "next/navigation";
import { getChatsBySessionId, getSessionByIdForUser } from "@/lib/db/sessions";
import { getServerSession } from "@/lib/session/get-server-session";

interface SessionPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
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

  const chats = await getChatsBySessionId(sessionId);
  const targetChat = chats[0];

  if (!targetChat) {
    notFound();
  }

  redirect(`/sessions/${sessionId}/chats/${targetChat.id}`);
}
