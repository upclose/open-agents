import {
  requireAuthenticatedUser,
  requireOwnedSession,
} from "@/app/api/sessions/_lib/session-context";
import { getRepoToken } from "@/lib/github/get-repo-token";
import { Octokit } from "@octokit/rest";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

/**
 * Fetches GitHub Actions job logs for failed check runs.
 *
 * Query params:
 *   jobIds - comma-separated list of job IDs to fetch logs for
 *
 * Returns:
 *   { logs: Record<string, string> } - map of jobId → log text
 */
export async function GET(req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId } = await context.params;
  const sessionContext = await requireOwnedSession({
    userId: authResult.userId,
    sessionId,
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  const { sessionRecord } = sessionContext;

  if (!sessionRecord.repoOwner || !sessionRecord.repoName) {
    return Response.json(
      { error: "Session is not linked to a GitHub repository" },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const jobIdsParam = url.searchParams.get("jobIds");
  if (!jobIdsParam) {
    return Response.json(
      { error: "Missing jobIds parameter" },
      { status: 400 },
    );
  }

  const jobIds = jobIdsParam.split(",").filter(Boolean);
  if (jobIds.length === 0) {
    return Response.json(
      { error: "No valid job IDs provided" },
      { status: 400 },
    );
  }

  // Cap at 10 to avoid abuse
  if (jobIds.length > 10) {
    return Response.json(
      { error: "Too many job IDs (max 10)" },
      { status: 400 },
    );
  }

  let token: string;
  try {
    const tokenResult = await getRepoToken(
      authResult.userId,
      sessionRecord.repoOwner,
    );
    token = tokenResult.token;
  } catch {
    return Response.json(
      { error: "No GitHub token available for this repository" },
      { status: 403 },
    );
  }

  const octokit = new Octokit({ auth: token });
  const owner = sessionRecord.repoOwner;
  const repo = sessionRecord.repoName;

  const logs: Record<string, string> = {};

  await Promise.all(
    jobIds.map(async (jobId) => {
      try {
        const response =
          await octokit.rest.actions.downloadJobLogsForWorkflowRun({
            owner,
            repo,
            job_id: Number(jobId),
          });
        // Octokit follows the redirect and returns the log as a string
        logs[jobId] =
          typeof response.data === "string"
            ? response.data
            : String(response.data);
      } catch {
        logs[jobId] = "(Unable to fetch logs)";
      }
    }),
  );

  return Response.json({ logs });
}
