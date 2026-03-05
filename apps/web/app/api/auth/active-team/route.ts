import { cookies } from "next/headers";
import { isUserMemberOfTeam, listTeamsForUser } from "@/lib/db/teams";
import { encryptJWE } from "@/lib/jwe/encrypt";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";
import { getServerSession } from "@/lib/session/get-server-session";

interface SetActiveTeamRequest {
  teamId?: string;
}

const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: SetActiveTeamRequest;
  try {
    body = (await req.json()) as SetActiveTeamRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const teamId = body.teamId?.trim();
  if (!teamId) {
    return Response.json({ error: "teamId is required" }, { status: 400 });
  }

  const isMember = await isUserMemberOfTeam(session.user.id, teamId);
  if (!isMember) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionToken = await encryptJWE(
    {
      ...session,
      activeTeamId: teamId,
    },
    "1y",
  );

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, sessionToken, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const teams = await listTeamsForUser(session.user.id);

  return Response.json({
    activeTeamId: teamId,
    teams,
  });
}
