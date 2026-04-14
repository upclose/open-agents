import type {
  AutomationListItem,
  AutomationRecord,
} from "@/lib/db/automations";
import { getAutomationScheduleSummary } from "@/lib/automations/definitions";
import { getEnabledAutomationToolTypes } from "@/lib/automations/tool-policy";
import type { AutomationRun } from "@/lib/db/schema";

function scheduleSummaryFor(automation: AutomationRecord) {
  return getAutomationScheduleSummary(
    automation.triggers.map((trigger) => trigger.config),
  );
}

export function serializeAutomation(automation: AutomationRecord) {
  return {
    ...automation,
    scheduleSummary: scheduleSummaryFor(automation),
    enabledToolTypes: getEnabledAutomationToolTypes(automation),
  };
}

export function serializeAutomationListItem(automation: AutomationListItem) {
  return {
    ...serializeAutomation(automation),
    latestRun: automation.latestRun,
  };
}

export function serializeAutomationDetail(params: {
  automation: AutomationRecord;
  runs: AutomationRun[];
}) {
  return {
    automation: serializeAutomation(params.automation),
    runs: params.runs,
  };
}
