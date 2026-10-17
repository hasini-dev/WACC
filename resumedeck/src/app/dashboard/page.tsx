import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";
import { requirePageMe } from "@/lib/page-auth";

export const metadata: Metadata = { title: "Dashboard · clicked" };

export default async function DashboardPage() {
  const me = await requirePageMe();
  return (
    <AppShell me={me}>
      <DashboardView />
    </AppShell>
  );
}
