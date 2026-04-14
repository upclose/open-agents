import type { AutomationRecord } from "@/lib/db/automations";

export function getEnabledAutomationToolTypes(
  automation: AutomationRecord,
): string[] {
  return automation.tools
    .filter((tool) => tool.enabled)
    .map((tool) => tool.toolType);
}

export function automationShouldOpenPullRequest(
  automation: AutomationRecord,
): boolean {
  return automation.tools.some(
    (tool) => tool.enabled && tool.toolType === "open_pull_request",
  );
}
