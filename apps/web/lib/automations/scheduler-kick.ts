import "server-only";

import { start } from "workflow/api";
import { automationSchedulerWorkflow } from "@/app/workflows/automation-scheduler";
import {
  getAutomationById,
  setAutomationSchedulerState,
} from "@/lib/db/automations";
import { getAutomationNextRunAt } from "./definitions";

function createSchedulerRunId() {
  return `automation-scheduler:${Date.now()}:${crypto.randomUUID()}`;
}

export function kickAutomationSchedulerWorkflow(params: {
  automationId: string;
  replaceExisting?: boolean;
  scheduleBackgroundWork?: (callback: () => Promise<void>) => void;
}) {
  const run = async () => {
    const automation = await getAutomationById(params.automationId);
    if (!automation) {
      return;
    }

    const nextRunAt = getAutomationNextRunAt(
      automation.triggers.map((trigger) => trigger.config),
    );

    if (!automation.enabled || !nextRunAt) {
      await setAutomationSchedulerState({
        automationId: automation.id,
        schedulerRunId: null,
        schedulerState: automation.enabled ? "idle" : "paused",
        nextRunAt: null,
      });
      return;
    }

    if (automation.schedulerRunId && !params.replaceExisting) {
      return;
    }

    const runId = createSchedulerRunId();
    await setAutomationSchedulerState({
      automationId: automation.id,
      schedulerRunId: runId,
      schedulerState: "scheduled",
      nextRunAt,
    });

    try {
      await start(automationSchedulerWorkflow, [automation.id, runId]);
    } catch (error) {
      console.error(
        `[automation-scheduler] Failed to start scheduler for automation ${automation.id}:`,
        error,
      );
      await setAutomationSchedulerState({
        automationId: automation.id,
        schedulerRunId: null,
        schedulerState: "idle",
        nextRunAt,
      });
    }
  };

  if (params.scheduleBackgroundWork) {
    params.scheduleBackgroundWork(run);
    return;
  }

  void run();
}
