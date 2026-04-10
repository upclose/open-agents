import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";
import { getLongestRepoAssistantTurnDurationMs } from "@/lib/db/sessions";

type RouteContext = {
  params: Promise<{ username: string; repo: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { username, repo } = await context.params;
  const longestAssistantTurnMs = await getLongestRepoAssistantTurnDurationMs({
    userId: authResult.userId,
    repoOwner: username,
    repoName: repo,
  });

  return Response.json({ longestAssistantTurnMs });
}
