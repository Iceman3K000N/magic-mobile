"use client";

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        active
          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
          : "border-amber-400/40 bg-amber-500/15 text-amber-200"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}
