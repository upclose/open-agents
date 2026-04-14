import { describe, expect, test } from "bun:test";
import {
  getAutomationScheduleSummary,
  getOpenPullRequestToolConfig,
  hasOpenPullRequestTool,
} from "./definitions";

describe("automation definitions helpers", () => {
  test("reports manual-only schedules", () => {
    expect(getAutomationScheduleSummary([{ type: "manual" }])).toBe(
      "Manual only",
    );
  });

  test("detects an enabled pull request tool even when it is not draft", () => {
    const tools = [
      {
        enabled: true,
        config: {
          toolType: "open_pull_request" as const,
          draft: false,
        },
      },
    ];

    expect(hasOpenPullRequestTool(tools)).toBe(true);
    expect(getOpenPullRequestToolConfig(tools)).toEqual({
      toolType: "open_pull_request",
      draft: false,
    });
  });
});
