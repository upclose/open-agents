"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AutomationForm } from "./automation-form";
import { useAutomations, type AutomationRecord } from "@/hooks/use-automations";
import { formatAutomationDateTime } from "@/lib/automations/cron";

function getAutomationTimezone(automation: AutomationRecord) {
  const cronTrigger = automation.triggers.find(
    (trigger) => trigger.type === "cron" && trigger.config.type === "cron",
  );

  return cronTrigger?.config.type === "cron"
    ? cronTrigger.config.timezone
    : Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function AutomationsPageClient() {
  const router = useRouter();
  const { automations, createAutomation, isLoading, runNow } = useAutomations();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Automations
          </h1>
          <p className="text-sm text-muted-foreground">
            Saved recurring configs that create normal sessions and chats.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/sessions">Back to Sessions</Link>
        </Button>
      </div>

      <AutomationForm
        title="Create Automation"
        description="Set the repo, instructions, schedule, and optional draft PR behavior."
        submitLabel="Create automation"
        onSubmit={async (input) => {
          const automation = await createAutomation(input);
          router.push(`/automations/${automation.id}`);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Loading automations...</CardTitle>
            </CardHeader>
          </Card>
        ) : automations.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No automations yet</CardTitle>
              <CardDescription>
                Create one above to start recurring repo work.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          automations.map((automation) => (
            <Card key={automation.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span>{automation.name}</span>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {automation.enabled ? "Enabled" : "Paused"}
                  </span>
                </CardTitle>
                <CardDescription>{automation.scheduleSummary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  {automation.repoOwner}/{automation.repoName} on{" "}
                  {automation.baseBranch}
                </p>
                <div className="space-y-1">
                  <p>
                    <span className="font-medium text-foreground">
                      Next run:
                    </span>{" "}
                    {formatAutomationDateTime(
                      automation.nextRunAt
                        ? new Date(automation.nextRunAt)
                        : null,
                      getAutomationTimezone(automation),
                    )}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">
                      Last result:
                    </span>{" "}
                    {automation.lastRunStatus ?? "No runs yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/automations/${automation.id}`}>Open</Link>
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const result = await runNow(automation.id);
                      router.push(
                        `/sessions/${result.session.id}/chats/${result.chat.id}`,
                      );
                    }}
                  >
                    Run now
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
