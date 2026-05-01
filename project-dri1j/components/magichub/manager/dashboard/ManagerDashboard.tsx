"use client";

import { Bell, Download, Gauge, Percent, Users, Wallet } from "lucide-react";
import { MetricCard } from "@/components/magichub/manager/dashboard/MetricCard";
import { QuickActionsCard } from "@/components/magichub/manager/dashboard/QuickActionsCard";
import { Sidebar } from "@/components/magichub/manager/dashboard/Sidebar";
import { TeamActivityCard } from "@/components/magichub/manager/dashboard/TeamActivityCard";
import { TeamPerformanceTable, type TeamRow } from "@/components/magichub/manager/dashboard/TeamPerformanceTable";
import { TopPerformerCard } from "@/components/magichub/manager/dashboard/TopPerformerCard";

export function ManagerDashboard({
  managerName,
  roleLabel,
  dateRange,
  onDateRangeChange,
  metrics,
  rows,
  topPerformer,
}: {
  managerName: string;
  roleLabel: string;
  dateRange: "7d" | "30d" | "90d";
  onDateRangeChange: (v: "7d" | "30d" | "90d") => void;
  metrics: {
    totalTeamSales: number;
    avgSalesPerConsultant: number;
    conversionRate: number;
    activeReps: number;
    inactiveReps: number;
    changes: {
      totalTeamSales: number;
      avgSalesPerConsultant: number;
      conversionRate: number;
      activity: number;
    };
    trends: {
      totalTeamSales: number[];
      avgSalesPerConsultant: number[];
      conversionRate: number[];
      activity: number[];
    };
  };
  rows: TeamRow[];
  topPerformer: { id: string; name: string; phone: string; sales: number } | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[260px_1fr_320px]">
        <Sidebar />

        <section className="space-y-4">
          <div className="rounded-2xl border border-blue-500/20 bg-slate-950/80 p-4 backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">Manager Dashboard</h1>
                <p className="mt-1 text-sm text-zinc-300">
                  Welcome back, {managerName}! Here&apos;s your team performance overview.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-xl border border-blue-500/30 bg-slate-900/80 px-3 py-2 text-sm text-white"
                  value={dateRange}
                  onChange={(e) => onDateRangeChange(e.target.value as "7d" | "30d" | "90d")}
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
                <button type="button" className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2 text-blue-100">
                  <Bell className="h-4 w-4" />
                </button>
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-white">
                  {managerName} <span className="text-xs text-blue-200">({roleLabel})</span>
                </div>
                <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-blue-400/40 bg-blue-500/20 px-3 py-2 text-sm font-medium text-blue-100">
                  <Download className="h-4 w-4" />
                  Export Report
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Team Sales"
              value={String(metrics.totalTeamSales)}
              icon={Wallet}
              changePct={metrics.changes.totalTeamSales}
              trend={metrics.trends.totalTeamSales}
              tone="blue"
            />
            <MetricCard
              title="Avg Sales Per Consultant"
              value={metrics.avgSalesPerConsultant.toFixed(1)}
              icon={Gauge}
              changePct={metrics.changes.avgSalesPerConsultant}
              trend={metrics.trends.avgSalesPerConsultant}
              tone="green"
            />
            <MetricCard
              title="Conversion Rate"
              value={`${metrics.conversionRate.toFixed(1)}%`}
              icon={Percent}
              changePct={metrics.changes.conversionRate}
              trend={metrics.trends.conversionRate}
              tone="orange"
            />
            <MetricCard
              title="Active vs Inactive Reps"
              value={`${metrics.activeReps} / ${metrics.inactiveReps}`}
              icon={Users}
              changePct={metrics.changes.activity}
              trend={metrics.trends.activity}
              tone="blue"
              donut={{ active: metrics.activeReps, inactive: metrics.inactiveReps }}
            />
          </div>

          <TeamPerformanceTable rows={rows} />
        </section>

        <section className="space-y-4">
          <TopPerformerCard top={topPerformer} />
          <TeamActivityCard active={metrics.activeReps} inactive={metrics.inactiveReps} />
          <QuickActionsCard />
        </section>
      </div>
    </div>
  );
}
