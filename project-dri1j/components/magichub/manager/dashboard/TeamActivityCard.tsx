"use client";

import { DonutChart } from "@/components/magichub/manager/dashboard/DonutChart";

export function TeamActivityCard({ active, inactive }: { active: number; inactive: number }) {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-950/80 p-4 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Team Activity</p>
      <div className="mt-3 flex items-center gap-4">
        <DonutChart activeCount={active} inactiveCount={inactive} />
        <div className="space-y-1 text-sm">
          <p className="text-emerald-300">Active reps: {active}</p>
          <p className="text-amber-300">Inactive reps: {inactive}</p>
          <p className="text-xs text-zinc-400">Focus outreach on inactive reps to lift weekly close rate.</p>
        </div>
      </div>
    </div>
  );
}
