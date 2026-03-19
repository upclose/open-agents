"use client";

import { Check, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { VercelProjectCandidate } from "@/lib/vercel/types";
import { cn } from "@/lib/utils";

interface SessionStarterVercelProjectSelectorProps {
  selectedProject?: VercelProjectCandidate;
  selectedProjectId: string;
  onSelectedProjectIdChange: (projectId: string) => void;
  repoProjects: VercelProjectCandidate[];
  isProjectLookupPending: boolean;
  repoProjectsErrorMessage?: string;
  noneValue: string;
}

function VercelTriangleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 76 65"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

function getVercelProjectLabel(project: VercelProjectCandidate): string {
  return project.teamName
    ? `${project.projectName} · ${project.teamName}`
    : project.projectName;
}

export function SessionStarterVercelProjectSelector({
  selectedProject,
  selectedProjectId,
  onSelectedProjectIdChange,
  repoProjects,
  isProjectLookupPending,
  repoProjectsErrorMessage,
  noneValue,
}: SessionStarterVercelProjectSelectorProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border p-3 transition-all duration-300",
        selectedProject
          ? "border-foreground/15 bg-foreground/[0.03] dark:border-white/15 dark:bg-white/[0.04]"
          : "border-input bg-background/60 dark:border-white/10 dark:bg-white/[0.02]",
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-[2px] transition-all duration-300",
          selectedProject
            ? "bg-foreground/70 dark:bg-white/50"
            : "bg-transparent",
        )}
      />

      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-300",
            selectedProject
              ? "bg-foreground text-background dark:bg-white dark:text-neutral-900"
              : "bg-muted/80 text-muted-foreground dark:bg-white/[0.06] dark:text-neutral-500",
          )}
        >
          <VercelTriangleIcon className="h-3 w-3" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              Vercel project
            </p>
            {selectedProject ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground/70 dark:bg-white/10 dark:text-white/60">
                <Check className="h-2.5 w-2.5" />
                Linked
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {selectedProject ? (
              <>
                Dev environment variables from{" "}
                <span className="font-medium text-foreground/80 dark:text-white/70">
                  {selectedProject.projectName}
                </span>{" "}
                will sync to{" "}
                <code className="rounded bg-muted/80 px-1 py-0.5 text-[11px] dark:bg-white/[0.06]">
                  .env.local
                </code>
              </>
            ) : (
              <>
                Sync Development environment variables to{" "}
                <code className="rounded bg-muted/80 px-1 py-0.5 text-[11px] dark:bg-white/[0.06]">
                  .env.local
                </code>{" "}
                when the sandbox is created.
              </>
            )}
          </p>

          <div className="mt-2.5">
            {isProjectLookupPending ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-dashed border-input/60 px-3 text-sm text-muted-foreground dark:border-white/[0.08]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Finding matching projects…</span>
              </div>
            ) : repoProjects.length > 0 ? (
              <Select
                value={selectedProjectId}
                onValueChange={onSelectedProjectIdChange}
              >
                <SelectTrigger className="w-full bg-background/80 text-sm dark:bg-white/[0.03]">
                  <SelectValue placeholder="Choose a Vercel project" />
                </SelectTrigger>
                <SelectContent align="start" position="popper">
                  <SelectItem value={noneValue}>
                    Don&apos;t sync env variables
                  </SelectItem>
                  {repoProjects.map((project) => (
                    <SelectItem
                      key={project.projectId}
                      value={project.projectId}
                    >
                      {getVercelProjectLabel(project)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-md border border-dashed border-input/60 px-3 py-2 text-xs text-muted-foreground dark:border-white/[0.08]">
                No matching project found for this repository.
              </div>
            )}

            {repoProjectsErrorMessage ? (
              <p className="mt-1.5 text-xs text-destructive">
                Couldn&apos;t load projects: {repoProjectsErrorMessage}
              </p>
            ) : selectedProject?.isSavedDefault ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                Remembered from last time
              </p>
            ) : repoProjects.length === 1 && selectedProject ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                Auto-selected the only matching project
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
