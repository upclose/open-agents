import {
  createAutomationDefinition,
  getAutomationById,
  listAutomationsByUserId,
} from "@/lib/db/automations";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { getAutomationNextRunAt } from "@/lib/automations/definitions";
import { kickAutomationSchedulerWorkflow } from "@/lib/automations/scheduler-kick";
import { automationUpsertInputSchema } from "@/lib/automations/types";
import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";
import {
  serializeAutomation,
  serializeAutomationListItem,
} from "./_lib/serialize";

export async function GET() {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const automations = await listAutomationsByUserId(authResult.userId);
  return Response.json({
    automations: automations.map(serializeAutomationListItem),
  });
}

export async function POST(req: Request) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = automationUpsertInputSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json(
      { error: "Invalid automation payload" },
      { status: 400 },
    );
  }

  const preferences = await getUserPreferences(authResult.userId);
  const normalizedInput = {
    ...parsedBody.data,
    modelId: parsedBody.data.modelId ?? preferences.defaultModelId,
  };
  let nextRunAt: Date | null = null;
  try {
    nextRunAt = normalizedInput.enabled
      ? getAutomationNextRunAt(normalizedInput.triggers)
      : null;
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid automation schedule",
      },
      { status: 400 },
    );
  }

  const automationId = await createAutomationDefinition({
    userId: authResult.userId,
    input: normalizedInput,
    globalSkillRefs: preferences.globalSkillRefs,
    nextRunAt,
  });

  const automation = await getAutomationById(automationId);
  if (!automation) {
    return Response.json(
      { error: "Failed to create automation" },
      { status: 500 },
    );
  }

  kickAutomationSchedulerWorkflow({
    automationId: automation.id,
    replaceExisting: true,
  });

  return Response.json({ automation: serializeAutomation(automation) });
}
