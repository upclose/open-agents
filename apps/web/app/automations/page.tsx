import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AutomationsPageClient } from "./automations-page-client";
import { getServerSession } from "@/lib/session/get-server-session";

export const metadata: Metadata = {
  title: "Automations",
  description: "Create and manage recurring automations that produce sessions.",
};

export default async function AutomationsPage() {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/");
  }

  return <AutomationsPageClient />;
}
