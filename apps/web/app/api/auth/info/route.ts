import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getGitHubAccount } from "@/lib/db/accounts";
import { getInstallationsByUserId } from "@/lib/db/installations";
import { listTeamsForUser, resolveActiveTeamIdForUser } from "@/lib/db/teams";
import { userExists } from "@/lib/db/users";
import { encryptJWE } from "@/lib/jwe/encrypt";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";
import { getSessionFromReq } from "@/lib/session/server";
import type { SessionUserInfo } from "@/lib/session/types";

const UNAUTHENTICATED: SessionUserInfo = { user: undefined };
const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export async function GET(req: NextRequest) {
  const session = await getSessionFromReq(req);

  if (!session?.user?.id) {
    return Response.json(UNAUTHENTICATED);
  }

  // Run the user-existence check in parallel with the GitHub queries
  // so there is zero added latency on the happy path.
  const [exists, ghAccount, installations] = await Promise.all([
    userExists(session.user.id),
    getGitHubAccount(session.user.id),
    getInstallationsByUserId(session.user.id),
  ]);

  // The session cookie (JWE) is self-contained and can outlive the user record.
  // If the user no longer exists, clear the stale cookie.
  if (!exists) {
    const store = await cookies();
    store.delete(SESSION_COOKIE_NAME);
    return Response.json(UNAUTHENTICATED);
  }

  const [activeTeamId, teams] = await Promise.all([
    resolveActiveTeamIdForUser({
      userId: session.user.id,
      username: session.user.username,
      preferredTeamId: session.activeTeamId,
    }),
    listTeamsForUser(session.user.id),
  ]);

  if (activeTeamId !== session.activeTeamId) {
    const sessionToken = await encryptJWE(
      {
        ...session,
        activeTeamId,
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
  }

  const hasGitHubAccount = ghAccount !== null;
  const hasGitHubInstallations = installations.length > 0;
  const hasGitHub = hasGitHubAccount || hasGitHubInstallations;

  const data: SessionUserInfo = {
    user: session.user,
    authProvider: session.authProvider,
    activeTeamId,
    teams,
    hasGitHub,
    hasGitHubAccount,
    hasGitHubInstallations,
  };

  return Response.json(data);
}
