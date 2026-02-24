export type ChatUiStatus = "submitted" | "streaming" | "ready" | "error";

/** Default stall threshold: 4 seconds of streaming with no visible content. */
export const STREAM_RECOVERY_STALL_MS = 4_000;
/** Minimum interval between automatic recovery attempts. */
export const STREAM_RECOVERY_MIN_INTERVAL_MS = 8_000;

export function isChatInFlight(status: ChatUiStatus): boolean {
  return status === "submitted" || status === "streaming";
}

export function shouldShowThinkingIndicator(options: {
  status: ChatUiStatus;
  hasAssistantRenderableContent: boolean;
  lastMessageRole: "assistant" | "user" | "system" | undefined;
}): boolean {
  const { status, hasAssistantRenderableContent, lastMessageRole } = options;
  if (!isChatInFlight(status)) {
    return false;
  }

  if (lastMessageRole !== "assistant") {
    return true;
  }

  return !hasAssistantRenderableContent;
}

export function shouldRefreshAfterReadyTransition(options: {
  prevStatus: ChatUiStatus | null;
  status: ChatUiStatus;
  hasAssistantRenderableContent: boolean;
}): boolean {
  const { prevStatus, status, hasAssistantRenderableContent } = options;
  return (
    prevStatus === "submitted" &&
    status === "ready" &&
    hasAssistantRenderableContent
  );
}

/**
 * Decide whether the stall-recovery mechanism should fire right now.
 *
 * Returns `"recover"` when we should abort + resume, `"skip"` otherwise.
 *
 * Key invariants:
 * - Never fire during `"submitted"` — the POST is still waiting for the
 *   server to finish setup; aborting it loses the connection before
 *   `activeStreamId` is set, so the subsequent resume returns 204.
 * - During `"streaming"`, only fire once no renderable content has appeared
 *   for `stallMs` measured from when streaming started (not from when the
 *   POST was sent).
 * - Always fire on `"error"` (transient failures should be retried).
 * - Respect the minimum interval between recovery attempts.
 */
export function shouldAttemptStreamRecovery(options: {
  status: ChatUiStatus;
  hasAssistantRenderableContent: boolean;
  now: number;
  lastRecoveryAt: number;
  streamingStartedAt: number | null;
  stallMs?: number;
  minIntervalMs?: number;
}): "recover" | "skip" {
  const {
    status,
    hasAssistantRenderableContent,
    now,
    lastRecoveryAt,
    streamingStartedAt,
    stallMs = STREAM_RECOVERY_STALL_MS,
    minIntervalMs = STREAM_RECOVERY_MIN_INTERVAL_MS,
  } = options;

  // Rate-limit: don't fire more often than minIntervalMs.
  if (now - lastRecoveryAt < minIntervalMs) {
    return "skip";
  }

  // Transient errors should always trigger a retry.
  if (status === "error") {
    return "recover";
  }

  // During "submitted" the POST is still in flight — the server may be
  // doing expensive setup. Aborting would be premature.
  // During "ready" there's nothing to recover.
  if (status !== "streaming") {
    return "skip";
  }

  // Already showing content — the stream is working.
  if (hasAssistantRenderableContent) {
    return "skip";
  }

  // Streaming but no content yet — check how long we've been streaming.
  if (streamingStartedAt === null || now - streamingStartedAt < stallMs) {
    return "skip";
  }

  return "recover";
}

/**
 * Compute the delay (in ms) before the stall-recovery timer should fire.
 *
 * Returns `null` when no timer should be scheduled (status is not
 * `"streaming"`, content is already visible, or the tab is hidden).
 */
export function computeStallRecoveryDelay(options: {
  status: ChatUiStatus;
  hasAssistantRenderableContent: boolean;
  streamingStartedAt: number | null;
  now: number;
  stallMs?: number;
}): number | null {
  const {
    status,
    hasAssistantRenderableContent,
    streamingStartedAt,
    now,
    stallMs = STREAM_RECOVERY_STALL_MS,
  } = options;

  if (status !== "streaming" || hasAssistantRenderableContent) {
    return null;
  }

  const elapsed = streamingStartedAt === null ? 0 : now - streamingStartedAt;
  return Math.max(0, stallMs - elapsed);
}
