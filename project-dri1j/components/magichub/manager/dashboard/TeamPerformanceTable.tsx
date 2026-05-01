"use client";

import { useMemo, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { MiniTrendLine } from "@/components/magichub/manager/dashboard/MiniTrendLine";
import { StatusBadge } from "@/components/magichub/manager/dashboard/StatusBadge";

export type TeamRow = {
  id: string;
  name: string;
  phone: string;
  sales: number;
  leads: number;
  conversionRate: number;
  active: boolean;
  trend: number[];
};

export function TeamPerformanceTable({ rows }: { rows: TeamRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "active" && !r.active) return false;
      if (status === "inactive" && r.active) return false;
      if (!needle) return true;
      return r.name.toLowerCase().includes(needle) || r.phone.replace(/\D/g, "").includes(needle.replace(/\D/g, ""));
    });
  }, [rows, q, status]);

  return (
    <section className="rounded-2xl border border-blue-500/20 bg-slate-950/80 p-4 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">My Team Performance</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              className="w-full rounded-xl border border-blue-500/25 bg-slate-900/80 py-2 pl-8 pr-3 text-sm text-white outline-none"
              placeholder="Search team member..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <select
            className="rounded-xl border border-blue-500/25 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none"
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | "active" | "inactive")}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="mt-4 hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <th className="pb-2 pr-3">Consultant</th>
              <th className="pb-2 pr-3">Sales</th>
              <th className="pb-2 pr-3">Leads</th>
              <th className="pb-2 pr-3">Conversion Rate</th>
              <th className="pb-2 pr-3">Status</th>
              <th className="pb-2 pr-3">Trend</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-zinc-800/80">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/20 text-[11px] font-semibold text-blue-100">
                      {r.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-white">{r.name}</p>
                      <p className="text-xs text-zinc-500">{r.phone || "No phone"}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-3 text-white">{r.sales}</td>
                <td className="py-2 pr-3 text-zinc-300">{r.leads}</td>
                <td className="py-2 pr-3 text-blue-200">{r.conversionRate.toFixed(1)}%</td>
                <td className="py-2 pr-3"><StatusBadge active={r.active} /></td>
                <td className="py-2 pr-3"><MiniTrendLine points={r.trend} colorClass={r.active ? "text-emerald-300" : "text-amber-300"} /></td>
                <td className="py-2">
                  <button type="button" className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-1.5 text-blue-200">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-2 lg:hidden">
        {filtered.map((r) => (
          <div key={r.id} className="rounded-xl border border-zinc-800 bg-black/30 p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-white">{r.name}</p>
              <StatusBadge active={r.active} />
            </div>
            <p className="text-xs text-zinc-500">{r.phone || "No phone"}</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <p className="text-zinc-300">Sales: {r.sales}</p>
              <p className="text-zinc-300">Leads: {r.leads}</p>
              <p className="text-blue-200">Conv: {r.conversionRate.toFixed(1)}%</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
