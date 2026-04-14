import { sleep } from "workflow";
import { getAutomationNextRunAt } from "@/lib/automations/definitions";

const MIN_AUTOMATION_SLEEP_MS = 1_000;

async function loadAutomation(automationId: string) {
  "use step";
  const { getAutomationById } = await import("@/lib/db/automations");
  return getAutomationById(automationId);
}

async function runScheduledAutomation(automationId: string) {
  "use step";
  const [{ getAutomationById }, { runAutomation }] = await Promise.all([
    import("@/lib/db/automations"),
    import("@/lib/automations/run-automation"),
  ]);
  const automation = await getAutomationById(automationId);
  if (!automation) {
    throw new Error(`Automation ${automationId} not found`);
  }

  return runAutomation({
    automation,
    userId: automation.userId,
    username: automation.userId,
    name: null,
    trigger: "cron",
  });
}

async function clearOwnedSchedulerRunId(
  automationId: string,
  runId: string,
  schedulerState: "idle" | "paused" | "scheduled" = "idle",
) {
  "use step";
  const { clearAutomationSchedulerRunIdIfOwned } = await import(
    "@/lib/db/automations"
  );
  await clearAutomationSchedulerRunIdIfOwned({
    automationId,
    runId,
    schedulerState,
  });
}

async function updateSchedulerState(params: {
  automationId: string;
  schedulerRunId: string;
  schedulerState: "running" | "scheduled";
  nextRunAt: Date;
}) {
  "use step";
  const { setAutomationSchedulerState } = await import("@/lib/db/automations");
  await setAutomationSchedulerState(params);
}

export async function automationSchedulerWorkflow(
  automationId: string,
  runId: string,
) {
  "use workflow";

  while (true) {
    const automation = await loadAutomation(automationId);
    if (!automation) {
      await clearOwnedSchedulerRunId(automationId, runId, "idle");
      return { skipped: true, reason: "automation-not-found" };
    }

    if (automation.schedulerRunId !== runId) {
      return { skipped: true, reason: "run-replaced" };
    }

    if (!automation.enabled) {
      await clearOwnedSchedulerRunId(automationId, runId, "paused");
      return { skipped: true, reason: "automation-paused" };
    }

    const nextRunAt =
      automation.nextRunAt ??
      getAutomationNextRunAt(
        automation.triggers.map((trigger) => trigger.config),
      );

    if (!nextRunAt) {
      await clearOwnedSchedulerRunId(automationId, runId, "idle");
      return { skipped: true, reason: "no-cron-trigger" };
    }

    if (
      !automation.nextRunAt ||
      automation.nextRunAt.getTime() !== nextRunAt.getTime()
    ) {
      await updateSchedulerState({
        automationId,
        schedulerRunId: runId,
        schedulerState: "scheduled",
        nextRunAt,
      });
    }

    const wakeAtMs = Math.max(
      nextRunAt.getTime(),
      Date.now() + MIN_AUTOMATION_SLEEP_MS,
    );
    await sleep(new Date(wakeAtMs));

    const currentAutomation = await loadAutomation(automationId);
    if (!currentAutomation) {
      await clearOwnedSchedulerRunId(automationId, runId, "idle");
      return { skipped: true, reason: "automation-not-found" };
    }

    if (currentAutomation.schedulerRunId !== runId) {
      return { skipped: true, reason: "run-replaced" };
    }

    if (!currentAutomation.enabled) {
      await clearOwnedSchedulerRunId(automationId, runId, "paused");
      return { skipped: true, reason: "automation-paused" };
    }

    const dueAt =
      currentAutomation.nextRunAt ??
      getAutomationNextRunAt(
        currentAutomation.triggers.map((trigger) => trigger.config),
      );

    if (!dueAt) {
      await clearOwnedSchedulerRunId(automationId, runId, "idle");
      return { skipped: true, reason: "no-cron-trigger" };
    }

    if (dueAt.getTime() > Date.now()) {
      continue;
    }

    await updateSchedulerState({
      automationId,
      schedulerRunId: runId,
      schedulerState: "running",
      nextRunAt: dueAt,
    });

    try {
      await runScheduledAutomation(automationId);
    } catch (error) {
      console.error(
        `[automation-scheduler] Failed to run automation ${automationId}:`,
        error,
      );
    }

    const refreshedAutomation = await loadAutomation(automationId);
    if (!refreshedAutomation) {
      await clearOwnedSchedulerRunId(automationId, runId, "idle");
      return { skipped: true, reason: "automation-not-found" };
    }

    if (refreshedAutomation.schedulerRunId !== runId) {
      return { skipped: true, reason: "run-replaced" };
    }

    const followingRunAt = getAutomationNextRunAt(
      refreshedAutomation.triggers.map((trigger) => trigger.config),
      dueAt,
    );

    if (!followingRunAt) {
      await clearOwnedSchedulerRunId(automationId, runId, "idle");
      return { skipped: true, reason: "no-following-run" };
    }

    await updateSchedulerState({
      automationId,
      schedulerRunId: runId,
      schedulerState: "scheduled",
      nextRunAt: followingRunAt,
    });
  }
}
