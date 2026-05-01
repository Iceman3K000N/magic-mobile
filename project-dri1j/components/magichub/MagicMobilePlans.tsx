"use client";

import { formatCurrency } from "@/lib/magic-mobile";
import type { PlanCatalogEntry } from "@/lib/magichub-catalog";
import { MAGICHUB_PLAN_CATALOG } from "@/lib/magichub-catalog";

const BADGE_STYLES = {
  best_value: "bg-amber-500/20 text-amber-200 ring-amber-500/40",
  promo: "bg-fuchsia-500/20 text-fuchsia-200 ring-fuchsia-500/40",
  unlimited: "bg-sky-500/20 text-sky-200 ring-sky-500/40",
} as const;

function badgeLabel(b: keyof typeof BADGE_STYLES): string {
  if (b === "best_value") return "Best Value";
  if (b === "promo") return "Promo";
  return "Unlimited";
}

export function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: PlanCatalogEntry;
  selected?: boolean;
  onSelect?: (p: PlanCatalogEntry) => void;
}) {
  const priceLine =
    plan.billing === "prepaid_term"
      ? `${formatCurrency(plan.prepaidTotal ?? 0)} one-time`
      : `${formatCurrency(plan.monthly)}/mo`;

  const interactive = Boolean(onSelect);
  const className = `relative flex h-full flex-col rounded-2xl border p-4 text-left transition ${
    selected
      ? "border-purple-500 bg-purple-500/15 ring-2 ring-purple-400/40"
      : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"
  } ${interactive ? "cursor-pointer" : ""}`;

  const inner = (
    <>
      {plan.badge ? (
        <span
          className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${BADGE_STYLES[plan.badge]}`}
        >
          {badgeLabel(plan.badge)}
        </span>
      ) : null}
      <p className="text-xs font-semibold uppercase tracking-wide text-purple-400/90">{plan.carrier}</p>
      <p className="mt-1 pr-16 text-lg font-bold text-white">{plan.name}</p>
      <p className="mt-2 text-xl font-semibold text-emerald-300">{priceLine}</p>
      {plan.billing === "prepaid_term" && plan.prepaidTermMonths ? (
        <p className="text-xs text-zinc-500">
          {plan.prepaidTermMonths} months
          {plan.prepaidPromoNote ? ` · ${plan.prepaidPromoNote}` : ""}
        </p>
      ) : null}
      <ul className="mt-3 space-y-1.5 text-xs text-zinc-400">
        <li>
          <span className="text-zinc-500">High-speed data: </span>
          {plan.highSpeedData}
        </li>
        <li>
          <span className="text-zinc-500">Mobile hotspot: </span>
          {plan.mobileHotspot}
        </li>
        <li>
          <span className="text-zinc-500">Talk/Text: </span>
          {plan.talkText}
        </li>
      </ul>
      <ul className="mt-3 space-y-1 border-t border-zinc-800/80 pt-3 text-xs leading-snug text-zinc-300">
        {plan.features.map((f) => (
          <li key={f}>• {f}</li>
        ))}
      </ul>
      {plan.notes ? <p className="mt-2 text-[11px] text-zinc-600">{plan.notes}</p> : null}
    </>
  );

  if (interactive && onSelect) {
    return (
      <button type="button" onClick={() => onSelect(plan)} className={className}>
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}

export function PlanComparisonCards({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (p: PlanCatalogEntry) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {MAGICHUB_PLAN_CATALOG.map((p) => (
        <PlanCard key={p.id} plan={p} selected={selectedId === p.id} onSelect={onSelect} />
      ))}
    </div>
  );
}
