"use client";

import { useCallback } from "react";
import useSWR from "swr";
import type { SessionUserInfo } from "@/lib/session/types";
import { fetcher } from "@/lib/swr";

type SetActiveTeamResponse = {
  activeTeamId?: string;
  error?: string;
};

export function useSession() {
  const { data, isLoading, mutate } = useSWR<SessionUserInfo>(
    "/api/auth/info",
    fetcher,
    {
      revalidateOnFocus: true,
      fallbackData: { user: undefined },
    },
  );

  const setActiveTeam = useCallback(
    async (teamId: string) => {
      const response = await fetch("/api/auth/active-team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ teamId }),
      });

      let payload: SetActiveTeamResponse | undefined;
      try {
        payload = (await response.json()) as SetActiveTeamResponse;
      } catch {
        payload = undefined;
      }

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to switch team");
      }

      await mutate();

      return payload?.activeTeamId ?? teamId;
    },
    [mutate],
  );

  return {
    session: data ?? null,
    loading: isLoading,
    isAuthenticated: !!data?.user,
    activeTeamId: data?.activeTeamId,
    teams: data?.teams ?? [],
    hasGitHub: data?.hasGitHub ?? false,
    hasGitHubAccount: data?.hasGitHubAccount ?? false,
    hasGitHubInstallations: data?.hasGitHubInstallations ?? false,
    refreshSession: mutate,
    setActiveTeam,
  };
}
