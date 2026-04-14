import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AutomationDetailPageClient } from "../automation-detail-page-client";
import { getServerSession } from "@/lib/session/get-server-session";

export const metadata: Metadata = {
  title: "Automation",
  description: "View and manage a saved automation.",
};

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ automationId: string }>;
}) {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/");
  }

  const { automationId } = await params;
  return <AutomationDetailPageClient automationId={automationId} />;
}
