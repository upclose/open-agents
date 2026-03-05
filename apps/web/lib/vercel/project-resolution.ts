import "server-only";

const VERCEL_API_BASE = "https://api.vercel.com";

export interface VercelProjectInfo {
  projectId: string;
  projectName: string;
  orgId: string;
  orgSlug?: string;
}

export type ResolutionFailureReason =
  | "no_vercel_auth"
  | "no_repo_context"
  | "project_unresolved"
  | "project_ambiguous"
  | "api_error";

export type ProjectResolutionResult =
  | { ok: true; project: VercelProjectInfo }
  | { ok: false; reason: ResolutionFailureReason; message?: string };

interface VercelProjectResponse {
  id: string;
  name: string;
  accountId: string;
  link?: {
    type?: string;
    org?: string;
    repo?: string;
    repoId?: number;
  };
}

interface VercelProjectsListResponse {
  projects?: VercelProjectResponse[];
}

interface VercelTeamResponse {
  id: string;
  slug?: string;
}

interface VercelTeamsListResponse {
  teams?: VercelTeamResponse[];
}

type ScopedProjectResult =
  | { ok: true; projects: VercelProjectResponse[] }
  | { ok: false; status: number; message: string };

async function listVercelTeams(
  vercelToken: string,
): Promise<VercelTeamResponse[]> {
  const response = await fetch(`${VERCEL_API_BASE}/v2/teams`, {
    headers: { Authorization: `Bearer ${vercelToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[Vercel] Team list API error (${response.status}): ${text}`);
    return [];
  }

  const data = (await response.json()) as VercelTeamsListResponse;
  return data.teams ?? [];
}

async function fetchProjectsForScope(params: {
  vercelToken: string;
  repoOwner: string;
  repoName: string;
  teamId?: string;
}): Promise<ScopedProjectResult> {
  const { vercelToken, repoOwner, repoName, teamId } = params;

  const url = new URL(`${VERCEL_API_BASE}/v10/projects`);
  url.searchParams.set("repo", `${repoOwner}/${repoName}`);
  url.searchParams.set("repoType", "github");
  if (teamId) {
    url.searchParams.set("teamId", teamId);
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${vercelToken}` },
  });

  if (!response.ok) {
    const message = await response.text();
    return {
      ok: false,
      status: response.status,
      message,
    };
  }

  const data = (await response.json()) as VercelProjectsListResponse;
  return {
    ok: true,
    projects: data.projects ?? [],
  };
}

/**
 * Resolve a Vercel project from a GitHub repository.
 *
 * Searches both personal scope and every accessible team scope so
 * repositories owned by orgs (e.g. vercel-labs/*) are resolvable.
 */
export async function resolveVercelProject(params: {
  vercelToken: string;
  repoOwner: string;
  repoName: string;
}): Promise<ProjectResolutionResult> {
  const { vercelToken, repoOwner, repoName } = params;

  try {
    const teams = await listVercelTeams(vercelToken);
    const scopes: Array<{ teamId?: string; teamSlug?: string }> = [
      {},
      ...teams.map((team) => ({ teamId: team.id, teamSlug: team.slug })),
    ];

    const projectsById = new Map<
      string,
      { project: VercelProjectResponse; teamSlug?: string }
    >();

    let hadSuccessfulQuery = false;
    let lastErrorStatus: number | null = null;

    for (const scope of scopes) {
      const result = await fetchProjectsForScope({
        vercelToken,
        repoOwner,
        repoName,
        teamId: scope.teamId,
      });

      if (!result.ok) {
        lastErrorStatus = result.status;
        const scopeLabel = scope.teamId
          ? `teamId=${scope.teamId}`
          : "personal scope";
        console.error(
          `[Vercel] Project resolution API error (${result.status}) for ${scopeLabel}: ${result.message}`,
        );
        continue;
      }

      hadSuccessfulQuery = true;

      for (const project of result.projects) {
        if (!projectsById.has(project.id)) {
          projectsById.set(project.id, {
            project,
            teamSlug: scope.teamSlug,
          });
        }
      }
    }

    if (projectsById.size === 0) {
      if (!hadSuccessfulQuery && lastErrorStatus !== null) {
        return {
          ok: false,
          reason: "api_error",
          message: `Vercel API returned ${lastErrorStatus}`,
        };
      }

      return {
        ok: false,
        reason: "project_unresolved",
        message: `No Vercel project found for ${repoOwner}/${repoName}`,
      };
    }

    if (projectsById.size > 1) {
      return {
        ok: false,
        reason: "project_ambiguous",
        message: `Found ${projectsById.size} Vercel projects for ${repoOwner}/${repoName}`,
      };
    }

    const resolved = projectsById.values().next().value;
    if (!resolved) {
      return {
        ok: false,
        reason: "project_unresolved",
        message: `No Vercel project found for ${repoOwner}/${repoName}`,
      };
    }

    return {
      ok: true,
      project: {
        projectId: resolved.project.id,
        projectName: resolved.project.name,
        orgId: resolved.project.accountId,
        orgSlug: resolved.project.link?.org ?? resolved.teamSlug,
      },
    };
  } catch (error) {
    console.error("[Vercel] Project resolution failed:", error);
    return {
      ok: false,
      reason: "api_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
