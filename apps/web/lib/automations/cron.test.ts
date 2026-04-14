import { describe, expect, test } from "bun:test";
import {
  getNextCronOccurrence,
  parseCronExpression,
  summarizeCronSchedule,
} from "./cron";

describe("automation cron helpers", () => {
  test("parses weekday aliases", () => {
    const parsed = parseCronExpression("0 9 * * mon-fri");

    expect(parsed.minute.has(0)).toBe(true);
    expect(parsed.hour.has(9)).toBe(true);
    expect(parsed.dayOfWeek.has(1)).toBe(true);
    expect(parsed.dayOfWeek.has(5)).toBe(true);
    expect(parsed.dayOfWeek.has(0)).toBe(false);
  });

  test("finds the next scheduled occurrence", () => {
    const next = getNextCronOccurrence({
      cron: "0 9 * * 1-5",
      timezone: "UTC",
      after: new Date("2026-04-13T09:00:00.000Z"),
    });

    expect(next?.toISOString()).toBe("2026-04-14T09:00:00.000Z");
  });

  test("summarizes daily schedules", () => {
    expect(
      summarizeCronSchedule({
        cron: "30 14 * * *",
        timezone: "UTC",
      }),
    ).toBe("Daily at 2:30 PM (UTC)");
  });

  test("rejects malformed cron expressions", () => {
    expect(() => parseCronExpression("0 9 * *")).toThrow(
      "Cron expressions must use 5 fields",
    );
  });
});
