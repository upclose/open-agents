import { describe, expect, test } from "bun:test";
import {
  computeStallRecoveryDelay,
  isChatInFlight,
  shouldAttemptStreamRecovery,
  shouldRefreshAfterReadyTransition,
  shouldShowThinkingIndicator,
  STREAM_RECOVERY_MIN_INTERVAL_MS,
  STREAM_RECOVERY_STALL_MS,
} from "./chat-streaming-state";

describe("chat streaming state", () => {
  test("treats submitted and streaming as in-flight", () => {
    expect(isChatInFlight("submitted")).toBe(true);
    expect(isChatInFlight("streaming")).toBe(true);
    expect(isChatInFlight("ready")).toBe(false);
    expect(isChatInFlight("error")).toBe(false);
  });

  test("does not show thinking when submitted already has assistant output", () => {
    expect(
      shouldShowThinkingIndicator({
        status: "submitted",
        hasAssistantRenderableContent: true,
        lastMessageRole: "assistant",
      }),
    ).toBe(false);
  });

  test("shows thinking while in-flight without assistant output", () => {
    expect(
      shouldShowThinkingIndicator({
        status: "submitted",
        hasAssistantRenderableContent: false,
        lastMessageRole: "user",
      }),
    ).toBe(true);

    expect(
      shouldShowThinkingIndicator({
        status: "streaming",
        hasAssistantRenderableContent: false,
        lastMessageRole: "assistant",
      }),
    ).toBe(true);
  });

  test("refreshes route only for submitted to ready transition", () => {
    expect(
      shouldRefreshAfterReadyTransition({
        prevStatus: "submitted",
        status: "ready",
        hasAssistantRenderableContent: true,
      }),
    ).toBe(true);

    expect(
      shouldRefreshAfterReadyTransition({
        prevStatus: "streaming",
        status: "ready",
        hasAssistantRenderableContent: true,
      }),
    ).toBe(false);

    expect(
      shouldRefreshAfterReadyTransition({
        prevStatus: "ready",
        status: "ready",
        hasAssistantRenderableContent: true,
      }),
    ).toBe(false);

    expect(
      shouldRefreshAfterReadyTransition({
        prevStatus: "submitted",
        status: "ready",
        hasAssistantRenderableContent: false,
      }),
    ).toBe(false);
  });
});

describe("shouldAttemptStreamRecovery", () => {
  const base = {
    status: "streaming" as const,
    hasAssistantRenderableContent: false,
    now: 10_000,
    lastRecoveryAt: 0,
    streamingStartedAt: 10_000 - STREAM_RECOVERY_STALL_MS - 1,
  };

  test("recovers when streaming stalls past the threshold", () => {
    expect(shouldAttemptStreamRecovery(base)).toBe("recover");
  });

  test("skips during 'submitted' — POST is still in flight", () => {
    expect(shouldAttemptStreamRecovery({ ...base, status: "submitted" })).toBe(
      "skip",
    );
  });

  test("skips during 'ready' — nothing to recover", () => {
    expect(shouldAttemptStreamRecovery({ ...base, status: "ready" })).toBe(
      "skip",
    );
  });

  test("recovers on 'error' regardless of timing", () => {
    expect(
      shouldAttemptStreamRecovery({
        ...base,
        status: "error",
        streamingStartedAt: null,
      }),
    ).toBe("recover");
  });

  test("skips when content is already visible", () => {
    expect(
      shouldAttemptStreamRecovery({
        ...base,
        hasAssistantRenderableContent: true,
      }),
    ).toBe("skip");
  });

  test("skips when streaming started recently (within stall window)", () => {
    expect(
      shouldAttemptStreamRecovery({
        ...base,
        streamingStartedAt: base.now - 1_000, // only 1s ago
      }),
    ).toBe("skip");
  });

  test("skips when streamingStartedAt is null (just transitioned)", () => {
    expect(
      shouldAttemptStreamRecovery({
        ...base,
        streamingStartedAt: null,
      }),
    ).toBe("skip");
  });

  test("rate-limits: skips if last recovery was too recent", () => {
    expect(
      shouldAttemptStreamRecovery({
        ...base,
        lastRecoveryAt: base.now - 1_000, // only 1s ago, min is 8s
      }),
    ).toBe("skip");
  });

  test("allows recovery after min interval has passed", () => {
    expect(
      shouldAttemptStreamRecovery({
        ...base,
        lastRecoveryAt: base.now - STREAM_RECOVERY_MIN_INTERVAL_MS - 1,
      }),
    ).toBe("recover");
  });

  test("uses custom stallMs and minIntervalMs", () => {
    // With a very short stall threshold, even recent streaming should trigger
    expect(
      shouldAttemptStreamRecovery({
        ...base,
        streamingStartedAt: base.now - 100,
        stallMs: 50,
        minIntervalMs: 0,
      }),
    ).toBe("recover");
  });

  // --- The key regression scenarios ---

  test("does NOT abort a slow first request during server setup (submitted)", () => {
    // Simulates: POST sent 15 seconds ago, server still doing setup
    // (connecting sandbox, discovering skills). Status is still "submitted".
    expect(
      shouldAttemptStreamRecovery({
        status: "submitted",
        hasAssistantRenderableContent: false,
        now: 15_000,
        lastRecoveryAt: 0,
        streamingStartedAt: null,
      }),
    ).toBe("skip");
  });

  test("does NOT abort when streaming just started on a subsequent message", () => {
    // Simulates: subsequent message where server setup was fast (~0.5s),
    // streaming just started, model is thinking but no visible tokens yet.
    // The stall window should measure from streaming start, not POST start.
    const postSentAt = 0;
    const streamingStarted = 500; // 0.5s after POST
    const now = postSentAt + STREAM_RECOVERY_STALL_MS + 100; // 4.1s after POST

    expect(
      shouldAttemptStreamRecovery({
        status: "streaming",
        hasAssistantRenderableContent: false,
        now,
        lastRecoveryAt: 0,
        streamingStartedAt: streamingStarted,
      }),
    ).toBe("skip"); // only 3.6s since streaming started, not yet 4s
  });

  test("DOES recover when streaming has stalled for the full threshold", () => {
    // Simulates: streaming started 5 seconds ago, no content appeared.
    // This is a genuine stall (connection drop, etc).
    const streamingStarted = 5_000;
    const now = streamingStarted + STREAM_RECOVERY_STALL_MS + 100;

    expect(
      shouldAttemptStreamRecovery({
        status: "streaming",
        hasAssistantRenderableContent: false,
        now,
        lastRecoveryAt: 0,
        streamingStartedAt: streamingStarted,
      }),
    ).toBe("recover");
  });
});

describe("computeStallRecoveryDelay", () => {
  const now = 10_000;

  test("returns null when status is not streaming", () => {
    expect(
      computeStallRecoveryDelay({
        status: "submitted",
        hasAssistantRenderableContent: false,
        streamingStartedAt: now - 1_000,
        now,
      }),
    ).toBeNull();

    expect(
      computeStallRecoveryDelay({
        status: "ready",
        hasAssistantRenderableContent: false,
        streamingStartedAt: null,
        now,
      }),
    ).toBeNull();
  });

  test("returns null when content is already visible", () => {
    expect(
      computeStallRecoveryDelay({
        status: "streaming",
        hasAssistantRenderableContent: true,
        streamingStartedAt: now - 1_000,
        now,
      }),
    ).toBeNull();
  });

  test("returns remaining time until stall threshold", () => {
    const delay = computeStallRecoveryDelay({
      status: "streaming",
      hasAssistantRenderableContent: false,
      streamingStartedAt: now - 1_000, // started 1s ago
      now,
    });
    expect(delay).toBe(STREAM_RECOVERY_STALL_MS - 1_000); // 3s remaining
  });

  test("returns 0 when already past the threshold", () => {
    const delay = computeStallRecoveryDelay({
      status: "streaming",
      hasAssistantRenderableContent: false,
      streamingStartedAt: now - STREAM_RECOVERY_STALL_MS - 500,
      now,
    });
    expect(delay).toBe(0);
  });

  test("returns full stall duration when streamingStartedAt is null", () => {
    const delay = computeStallRecoveryDelay({
      status: "streaming",
      hasAssistantRenderableContent: false,
      streamingStartedAt: null,
      now,
    });
    expect(delay).toBe(STREAM_RECOVERY_STALL_MS);
  });

  test("uses custom stallMs", () => {
    const delay = computeStallRecoveryDelay({
      status: "streaming",
      hasAssistantRenderableContent: false,
      streamingStartedAt: now - 500,
      now,
      stallMs: 2_000,
    });
    expect(delay).toBe(1_500);
  });
});
