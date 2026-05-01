"use client";

import { MessageSquare, School, Sheet } from "lucide-react";

const btn = "flex items-center justify-between rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-100 hover:bg-blue-500/20";

export function QuickActionsCard() {
  return (
    <div className="rounded-2xl border border-blue-500/20 bg-slate-950/80 p-4 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Quick Actions</p>
      <div className="mt-3 space-y-2">
        <button type="button" className={btn}>
          <span>Message Team</span>
          <MessageSquare className="h-4 w-4" />
        </button>
        <button type="button" className={btn}>
          <span>View Full Report</span>
          <Sheet className="h-4 w-4" />
        </button>
        <button type="button" className={btn}>
          <span>Team Training</span>
          <School className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
