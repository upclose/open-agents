import { getOwnedAutomationById } from "@/lib/db/automations";
import { runAutomation } from "@/lib/automations/run-automation";
import { automationRunNowInputSchema } from "@/lib/automations/types";
import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";
import { getServerSession } from "@/lib/session/get-server-session";

export async function POST(
  req: Request,
  context: { params: Promise<{ automationId: string }> },
) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsedBody = automationRunNowInputSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json({ error: "Invalid run payload" }, { status: 400 });
  }

  const automationId = (await context.params).automationId;
  const automation = await getOwnedAutomationById({
    automationId,
    userId: authResult.userId,
  });

  if (!automation) {
    return Response.json({ error: "Automation not found" }, { status: 404 });
  }

  const result = await runAutomation({
    automation,
    userId: authResult.userId,
    username: session.user.username,
    name: session.user.name,
    trigger: parsedBody.data.trigger,
  });

  return Response.json(result);
}
