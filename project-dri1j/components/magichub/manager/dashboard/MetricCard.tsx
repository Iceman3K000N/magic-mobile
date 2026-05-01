"use client";

import type { LucideIcon } from "lucide-react";
import { MiniTrendLine } from "@/components/magichub/manager/dashboard/MiniTrendLine";
import { DonutChart } from "@/components/magichub/manager/dashboard/DonutChart";

export function MetricCard({
  title,
  value,
  changePct,
  icon: Icon,
  trend,
  tone = "blue",
  donut,
}: {
  title: string;
  value: string;
  changePct: number;
  icon: LucideIcon;
  trend: number[];
  tone?: "blue" | "green" | "orange";
  donut?: { active: number; inactive: number };
}) {
  const toneClass = tone === "green" ? "text-emerald-300" : tone === "orange" ? "text-amber-300" : "text-blue-300";
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-slate-950/90 to-slate-900/80 p-4 shadow-[0_0_30px_rgba(37,99,235,0.12)] backdrop-blur">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          <p className={`mt-1 text-xs font-medium ${changePct >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {changePct >= 0 ? "+" : ""}
            {changePct.toFixed(1)}% this week
          </p>
        </div>
        <span className="rounded-xl border border-blue-400/30 bg-blue-500/15 p-2">
          <Icon className={`h-5 w-5 ${toneClass}`} />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <MiniTrendLine points={trend} colorClass={toneClass} />
        {donut ? <DonutChart activeCount={donut.active} inactiveCount={donut.inactive} size={64} /> : null}
      </div>
    </div>
  );
}
