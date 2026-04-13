import { NextRequest, NextResponse } from "next/server";
import { getCachedGitHubRepos } from "@/lib/github/cached-api";
import { getRepoToken } from "@/lib/github/get-repo-token";
import { getCachedInstallationRepositories } from "@/lib/github/installation-repos";
import { withNoStoreHeaders } from "@/lib/no-store";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET(request: NextRequest) {
  const session = await getServerSession();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "GitHub not connected" },
      withNoStoreHeaders({ status: 401 }),
    );
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const limitParam = searchParams.get("limit");
  const queryParam = searchParams.get("query");

  if (!owner) {
    return NextResponse.json(
      { error: "Owner parameter is required" },
      withNoStoreHeaders({ status: 400 }),
    );
  }

  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  const limit =
    typeof parsedLimit === "number" && Number.isFinite(parsedLimit)
      ? parsedLimit
      : undefined;
  const query = queryParam?.trim() || undefined;

  let tokenResult: Awaited<ReturnType<typeof getRepoToken>>;
  try {
    tokenResult = await getRepoToken(session.user.id, owner);
  } catch {
    return NextResponse.json(
      { error: "GitHub not connected" },
      withNoStoreHeaders({ status: 401 }),
    );
  }

  try {
    if (tokenResult.type === "installation") {
      const repos = await getCachedInstallationRepositories({
        installationId: tokenResult.installationId,
        owner,
        limit,
        query,
      });

      return NextResponse.json(repos, withNoStoreHeaders());
    }

    const repos = await getCachedGitHubRepos(
      session.user.id,
      tokenResult.token,
      owner,
      {
        limit,
        query,
      },
    );

    if (!repos) {
      return NextResponse.json(
        { error: "Failed to fetch repositories" },
        withNoStoreHeaders({ status: 500 }),
      );
    }

    return NextResponse.json(repos, withNoStoreHeaders());
  } catch (error) {
    console.error("Error fetching repositories:", error);
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      withNoStoreHeaders({ status: 500 }),
    );
  }
}
