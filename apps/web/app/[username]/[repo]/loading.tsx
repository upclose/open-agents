"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatElapsed } from "@/app/shared/[shareId]/shared-chat-status-utils";

function getRepoFromPathname(pathname: string): {
  username: string;
  repo: string;
} | null {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  const username = segments[0];
  const repo = segments[1];

  if (!username || !repo) {
    return null;
  }

  return { username, repo };
}

export default function RepoLoading() {
  const pathname = usePathname();
  const repo = useMemo(() => getRepoFromPathname(pathname), [pathname]);
  const [longestAssistantTurnMs, setLongestAssistantTurnMs] = useState<
    number | null
  >(null);

  useEffect(() => {
    if (!repo) {
      return;
    }

    const abortController = new AbortController();

    fetch(
      `/api/repos/${encodeURIComponent(repo.username)}/${encodeURIComponent(repo.repo)}/longest-assistant-turn`,
      {
        cache: "no-store",
        signal: abortController.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load longest assistant turn");
        }

        return (await response.json()) as {
          longestAssistantTurnMs: number | null;
        };
      })
      .then((data) => {
        setLongestAssistantTurnMs(data.longestAssistantTurnMs);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
      });

    return () => {
      abortController.abort();
    };
  }, [repo]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-sm text-muted-foreground">
      <p>Preparing repository session...</p>
      {longestAssistantTurnMs !== null ? (
        <p className="mt-2 text-xs text-muted-foreground/80">
          Longest assistant turn here: {formatElapsed(longestAssistantTurnMs)}
        </p>
      ) : null}
    </div>
  );
}
