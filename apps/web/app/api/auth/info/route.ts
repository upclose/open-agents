import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getGitHubAccount } from "@/lib/db/accounts";
import { getInstallationsByUserId } from "@/lib/db/installations";
import { userExists } from "@/lib/db/users";
import { withNoStoreHeaders } from "@/lib/no-store";
import { SESSION_COOKIE_NAME } from "@/lib/session/constants";
import { getSessionFromReq } from "@/lib/session/server";
import type { SessionUserInfo } from "@/lib/session/types";

const UNAUTHENTICATED: SessionUserInfo = { user: undefined };

export async function GET(req: NextRequest) {
  const session = await getSessionFromReq(req);

  if (!session?.user?.id) {
    return Response.json(UNAUTHENTICATED, withNoStoreHeaders());
  }

  const [exists, ghAccount, installations] = await Promise.all([
    userExists(session.user.id),
    getGitHubAccount(session.user.id),
    getInstallationsByUserId(session.user.id),
  ]);

  if (!exists) {
    const store = await cookies();
    store.delete(SESSION_COOKIE_NAME);
    return Response.json(UNAUTHENTICATED, withNoStoreHeaders());
  }

  const hasGitHubAccount = ghAccount !== null;
  const hasGitHubInstallations = installations.length > 0;
  const hasGitHub = hasGitHubAccount || hasGitHubInstallations;

  const data: SessionUserInfo = {
    user: session.user,
    authProvider: session.authProvider,
    hasGitHub,
    hasGitHubAccount,
    hasGitHubInstallations,
  };

  return Response.json(data, withNoStoreHeaders());
}
