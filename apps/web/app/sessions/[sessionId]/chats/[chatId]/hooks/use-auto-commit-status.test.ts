import { describe, expect, test } from "bun:test";
import { reconcileOptimisticPostTurnPhase } from "./use-auto-commit-status";

describe("reconcileOptimisticPostTurnPhase", () => {
  test("clears optimistic auto-commit once git work is done", () => {
    expect(
      reconcileOptimisticPostTurnPhase({
        sessionPostTurnPhase: null,
        optimisticPhase: "auto_commit",
        hasExistingPr: false,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
      }),
    ).toBeNull();
  });

  test("keeps optimistic auto-commit while git work is still pending", () => {
    expect(
      reconcileOptimisticPostTurnPhase({
        sessionPostTurnPhase: null,
        optimisticPhase: "auto_commit",
        hasExistingPr: false,
        hasUncommittedChanges: true,
        hasUnpushedCommits: false,
      }),
    ).toBe("auto_commit");
  });

  test("adopts the durable auto-pr phase for optimistic handoff", () => {
    expect(
      reconcileOptimisticPostTurnPhase({
        sessionPostTurnPhase: "auto_pr",
        optimisticPhase: "auto_commit",
        hasExistingPr: false,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
      }),
    ).toBe("auto_pr");
  });

  test("keeps optimistic auto-pr until PR metadata catches up", () => {
    expect(
      reconcileOptimisticPostTurnPhase({
        sessionPostTurnPhase: null,
        optimisticPhase: "auto_pr",
        hasExistingPr: false,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
      }),
    ).toBe("auto_pr");
  });

  test("clears optimistic auto-pr once the PR appears", () => {
    expect(
      reconcileOptimisticPostTurnPhase({
        sessionPostTurnPhase: null,
        optimisticPhase: "auto_pr",
        hasExistingPr: true,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
      }),
    ).toBeNull();
  });
});
