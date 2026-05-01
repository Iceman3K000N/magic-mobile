"use client";

type TopPerformer = { id: string; name: string; phone: string; sales: number };

export function TopPerformerCard({ top }: { top: TopPerformer | null }) {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-950/80 p-4 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Top Performer</p>
      {top ? (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/20 text-sm font-bold text-blue-100">
              {top.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-white">{top.name}</p>
              <p className="text-xs text-zinc-400">{top.phone || "No phone on file"}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-zinc-300">
            <span className="font-semibold text-emerald-300">{top.sales}</span> completed sales in selected range.
          </p>
          <p className="mt-1 text-xs text-blue-200">Keep momentum high - your team is closing strong this week.</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No team sales yet.</p>
      )}
    </div>
  );
}
