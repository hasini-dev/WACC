import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";

export const metadata: Metadata = { title: "Dashboard · clicked" };

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
