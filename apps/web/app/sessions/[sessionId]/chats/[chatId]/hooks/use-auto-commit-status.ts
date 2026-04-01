"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionGitStatus } from "@/hooks/use-session-git-status";
import type { SessionPostTurnPhase } from "@/lib/session/post-turn-phase";

const POST_TURN_REFRESH_INTERVAL_MS = 2_000;
const POST_TURN_OPTIMISTIC_TIMEOUT_MS = 8_000;

type UseAutoCommitStatusParams = {
  autoCommitEnabled: boolean;
  autoCreatePrEnabled: boolean;
  sessionPostTurnPhase: SessionPostTurnPhase | null | undefined;
  gitStatus: SessionGitStatus | null;
  hasExistingPr: boolean;
  refresh: () => void;
};

type ReconcileOptimisticPostTurnPhaseParams = {
  sessionPostTurnPhase: SessionPostTurnPhase | null | undefined;
  optimisticPhase: SessionPostTurnPhase | null;
  hasExistingPr: boolean;
  hasUncommittedChanges: boolean;
  hasUnpushedCommits: boolean;
};

export function reconcileOptimisticPostTurnPhase({
  sessionPostTurnPhase,
  optimisticPhase,
  hasExistingPr,
  hasUncommittedChanges,
  hasUnpushedCommits,
}: ReconcileOptimisticPostTurnPhaseParams): SessionPostTurnPhase | null {
  if (sessionPostTurnPhase) {
    return sessionPostTurnPhase;
  }

  if (!optimisticPhase) {
    return null;
  }

  if (optimisticPhase === "auto_commit") {
    return hasUncommittedChanges || hasUnpushedCommits ? optimisticPhase : null;
  }

  if (optimisticPhase === "auto_pr") {
    return hasExistingPr ? null : optimisticPhase;
  }

  return optimisticPhase;
}

/**
 * Tracks the navbar's post-stream git automation state.
 *
 * The server now persists a durable `session.postTurnPhase`, but we still keep
 * a local optimistic phase so the current tab can render "Committing..."
 * immediately when the assistant stream closes.
 */
export function useAutoCommitStatus({
  autoCommitEnabled,
  autoCreatePrEnabled: _autoCreatePrEnabled,
  sessionPostTurnPhase,
  gitStatus,
  hasExistingPr,
  refresh,
}: UseAutoCommitStatusParams) {
  const [optimisticPhase, setOptimisticPhase] =
    useState<SessionPostTurnPhase | null>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const markAutoCommitStarted = useCallback(() => {
    if (!autoCommitEnabled) {
      return;
    }

    setOptimisticPhase("auto_commit");
  }, [autoCommitEnabled]);

  const activePhase = sessionPostTurnPhase ?? optimisticPhase;
  const hasUncommittedChanges = gitStatus?.hasUncommittedChanges ?? false;
  const hasUnpushedCommits = gitStatus?.hasUnpushedCommits ?? false;

  useEffect(() => {
    if (!autoCommitEnabled && optimisticPhase) {
      setOptimisticPhase(null);
    }
  }, [autoCommitEnabled, optimisticPhase]);

  useEffect(() => {
    const nextOptimisticPhase = reconcileOptimisticPostTurnPhase({
      sessionPostTurnPhase,
      optimisticPhase,
      hasExistingPr,
      hasUncommittedChanges,
      hasUnpushedCommits,
    });

    if (nextOptimisticPhase === optimisticPhase) {
      return;
    }

    setOptimisticPhase(nextOptimisticPhase);
  }, [
    sessionPostTurnPhase,
    optimisticPhase,
    hasExistingPr,
    hasUncommittedChanges,
    hasUnpushedCommits,
  ]);

  useEffect(() => {
    if (!activePhase) {
      return;
    }

    void refreshRef.current();

    const refreshInterval = setInterval(() => {
      refreshRef.current();
    }, POST_TURN_REFRESH_INTERVAL_MS);

    const fallbackTimeout = setTimeout(() => {
      if (!sessionPostTurnPhase) {
        setOptimisticPhase(null);
      }
    }, POST_TURN_OPTIMISTIC_TIMEOUT_MS);

    return () => {
      clearInterval(refreshInterval);
      clearTimeout(fallbackTimeout);
    };
  }, [activePhase, sessionPostTurnPhase]);

  return {
    postTurnPhase: activePhase,
    isAutoCommitting: activePhase === "auto_commit",
    isAutoCreatingPr: activePhase === "auto_pr",
    markAutoCommitStarted,
  } as const;
}
