import {
  requireAuthenticatedUser,
  requireOwnedSessionWithSandboxGuard,
} from "@/app/api/sessions/_lib/session-context";
import {
  bootstrapSessionTerminal,
  type SessionTerminalLaunchResult,
} from "@/lib/sandbox/terminal/bootstrap";
import { isSandboxActive } from "@/lib/sandbox/utils";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export type SessionTerminalLaunchResponse = SessionTerminalLaunchResult;

export async function POST(_req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId } = await context.params;
  const sessionContext = await requireOwnedSessionWithSandboxGuard({
    userId: authResult.userId,
    sessionId,
    sandboxGuard: isSandboxActive,
    sandboxErrorMessage: "Sandbox not initialized",
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  try {
    const result = await bootstrapSessionTerminal(sessionContext.sessionRecord);
    return Response.json(result satisfies SessionTerminalLaunchResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Failed to launch terminal: ${message}` },
      { status: 500 },
    );
  }
}
