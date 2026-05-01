"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  COMMISSION_RULES,
  formatCurrency,
  type CommissionRecord,
  type LeadRecord,
  type ProfileRecord,
} from "@/lib/magic-mobile";
import { type SaleRecord, startOfLocalDayIso } from "@/lib/magichub";
import { MAGICHUB_PLAN_CATALOG, type PlanCatalogEntry } from "@/lib/magichub-catalog";
import { insertHubAuditLog } from "@/lib/magichub-audit";
import {
  COMMISSION_PAYOUT_BLOCKERS,
  PHONE_TIER_PAYOUT_REFERENCE,
  PLAN_PAYOUT_REFERENCE,
  commissionPayoutBlockedReason,
  splitConsultantManagerFromSale,
} from "@/lib/magichub-commission-payout";
import { readPricingOverridesFromStorage } from "@/lib/magichub-pricing";
import { PlanCard } from "@/components/magichub/MagicMobilePlans";
import { HubCard, HubStat, hubBtnGhost, hubBtnPrimary, hubInputClass } from "@/components/magichub/MagicHubShell";

const ACTIVATION_KEY = "magichub_activation_v1";
const CHECKBOXES = [
  { id: "port", label: "Port / transfer complete" },
  { id: "device", label: "Device setup & data transfer" },
  { id: "plan", label: "Plan / line active" },
  { id: "walk", label: "Customer walkthrough done" },
] as const;

function readActivationMap(): Record<string, Record<string, boolean>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ACTIVATION_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Record<string, boolean>>;
  } catch {
    return {};
  }
}

function writeActivationMap(m: Record<string, Record<string, boolean>>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVATION_KEY, JSON.stringify(m));
}

export function SavedQuotesSection({
  supabase,
  profile,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  profile: ProfileRecord;
}) {
  const [rows, setRows] = useState<{ id: string; updated_at: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("hub_quotes")
        .select("id,updated_at")
        .eq("contractor_id", profile.id)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(12);
      if (cancelled) return;
      if (error) return;
      setRows(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profile.id]);

  if (rows.length === 0) return null;

  return (
    <HubCard>
      <h2 className="text-lg font-semibold text-white">Saved quote drafts</h2>
      <p className="mt-1 text-sm text-zinc-500">Autosaved from Start Sale — click to resume.</p>
      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-purple-500/20 bg-black/30 px-3 py-2">
            <span className="text-xs text-zinc-500">{new Date(r.updated_at).toLocaleString()}</span>
            <Link href={`/magichub/sale/1?quote=${r.id}`} className={`${hubBtnPrimary} text-xs py-1.5`}>
              Resume
            </Link>
          </li>
        ))}
      </ul>
    </HubCard>
  );
}

export function CustomersSection({
  supabase,
  leads,
  canManage,
  authUserId,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  leads: LeadRecord[];
  canManage: boolean;
  authUserId: string;
}) {
  const [q, setQ] = useState("");
  const [crm, setCrm] = useState<{ id: string; full_name: string; phone: string; updated_at: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let q = supabase
        .from("hub_customers")
        .select("id,full_name,phone,updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (!canManage) q = q.eq("contractor_id", authUserId);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) return;
      setCrm(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, authUserId, canManage]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = canManage ? leads : leads.filter((l) => l.contractor_id === authUserId);
    if (!needle) return base;
    return base.filter(
      (l) =>
        l.customer_name.toLowerCase().includes(needle) ||
        l.customer_phone.replace(/\D/g, "").includes(needle.replace(/\D/g, "")) ||
        (l.notes?.toLowerCase().includes(needle) ?? false)
    );
  }, [leads, q, canManage, authUserId]);

  return (
    <div className="space-y-4">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Customer lookup</h2>
        <p className="mt-1 text-sm text-zinc-500">Search leads and CRM rows recorded at sale completion.</p>
        <input
          className={`mt-3 ${hubInputClass}`}
          placeholder="Type to filter…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </HubCard>
      {crm.length > 0 ? (
        <HubCard>
          <p className="text-sm font-semibold text-white">CRM (from completed sales)</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            {crm.slice(0, 12).map((c) => (
              <li key={c.id}>
                {c.full_name} · {c.phone}
              </li>
            ))}
          </ul>
        </HubCard>
      ) : null}
      {visible.map((lead) => (
        <HubCard key={lead.id}>
          <p className="font-semibold text-white">{lead.customer_name}</p>
          <p className="text-sm text-zinc-400">{lead.customer_phone}</p>
          <p className="mt-2 text-sm text-zinc-300">Status: {lead.status}</p>
          {lead.what_they_want ? <p className="mt-1 text-sm text-zinc-400">{lead.what_they_want}</p> : null}
          {!canManage && lead.contractor_id !== authUserId ? (
            <p className="mt-2 text-xs text-amber-400">Not assigned to you — read-only.</p>
          ) : (
            <Link href="/magichub/leads" className={`mt-3 inline-block text-sm text-purple-300 hover:text-purple-200`}>
              Open in Leads →
            </Link>
          )}
        </HubCard>
      ))}
      {visible.length === 0 ? <p className="text-zinc-500">No matches.</p> : null}
    </div>
  );
}

export function PlansCatalogSection() {
  const [planRows, setPlanRows] = useState(() => MAGICHUB_PLAN_CATALOG);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = readPricingOverridesFromStorage();
      let source = local;
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.from("hub_pricing_config").select("payload").eq("id", "default").maybeSingle();
        if (data?.payload && typeof data.payload === "object") {
          source = {
            ...local,
            ...(data.payload as typeof local),
          };
        }
      } catch {
        // fallback to local cache/default catalog only
      }
      if (cancelled) return;
      setPlanRows((prev) =>
        prev.map((p) => {
          const o = source.planRows.find((x) => x.id === p.id);
          if (!o) return p;
          return {
            ...p,
            monthly: o.priceMonthly,
            prepaidTotal: o.oneTimePrice,
            badge:
              o.badge === "Best Value" ? "best_value" : o.badge === "Promo" ? "promo" : o.badge === "Unlimited" ? "unlimited" : p.badge,
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Plan selector</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Reference rates for quotes and activations. Sync with your carrier or PrepaidIQ when available.
        </p>
      </HubCard>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {planRows.map((p: PlanCatalogEntry) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
    </div>
  );
}

export function ActivationBoardSection({
  supabase,
  sales,
  profile,
  canManage,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  sales: SaleRecord[];
  profile: ProfileRecord;
  canManage: boolean;
}) {
  const [map, setMap] = useState<Record<string, Record<string, boolean>>>(() => readActivationMap());
  const [dbRow, setDbRow] = useState<
    Record<string, { imei: string | null; sim: string | null; checklist: Record<string, unknown> | null }>
  >({});

  const list = useMemo(() => {
    const mine = canManage ? sales : sales.filter((s) => s.contractor_id === profile.id);
    return [...mine].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [sales, canManage, profile.id]);

  useEffect(() => {
    if (list.length === 0) return;
    let cancelled = false;
    const ids = list.map((s) => s.id);
    void (async () => {
      const { data, error } = await supabase.from("hub_activations").select("sale_id,imei,sim,checklist").in("sale_id", ids);
      if (cancelled || error) return;
      const next: typeof dbRow = {};
      for (const row of data ?? []) {
        next[row.sale_id] = { imei: row.imei, sim: row.sim, checklist: row.checklist as Record<string, unknown> };
      }
      setDbRow(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, list]);

  const setCheck = useCallback(
    (saleId: string, key: string, v: boolean) => {
      setMap((prev) => {
        const nextEntry = { ...prev[saleId], [key]: v };
        const next = { ...prev, [saleId]: nextEntry };
        writeActivationMap(next);
        void supabase.from("hub_activations").upsert(
          {
            sale_id: saleId,
            checklist: nextEntry,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "sale_id" },
        );
        return next;
      });
    },
    [supabase],
  );

  return (
    <div className="space-y-4">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Activation board</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Server-backed checklist when <code className="text-purple-300">hub_activations</code> exists; browser cache fills gaps.
        </p>
      </HubCard>
      {list.map((s) => (
        <HubCard key={s.id}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium text-white">{s.customer_name}</p>
              <p className="text-xs text-zinc-500">
                {s.plan_name || "—"} · {new Date(s.created_at).toLocaleString()}
              </p>
              {dbRow[s.id]?.imei ? (
                <p className="mt-1 text-xs text-zinc-400">IMEI: {dbRow[s.id]?.imei}</p>
              ) : null}
              {dbRow[s.id]?.sim ? (
                <p className="text-xs text-zinc-400">SIM: {dbRow[s.id]?.sim}</p>
              ) : null}
            </div>
            <p className="text-sm text-emerald-300/90">{formatCurrency(s.total_sale)}</p>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {CHECKBOXES.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={map[s.id]?.[c.id] ?? false}
                  onChange={(e) => setCheck(s.id, c.id, e.target.checked)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </HubCard>
      ))}
      {list.length === 0 ? <p className="text-zinc-500">No sales to show yet.</p> : null}
    </div>
  );
}

const SALE_STATUS_OPTIONS = ["pending_approval", "approved", "rejected", "refunded", "canceled", "fraudulent"] as const;
const ACTIVATION_STATUS_OPTIONS = ["pending", "completed"] as const;
const PAYMENT_STATUS_OPTIONS = ["pending", "paid", "refunded"] as const;

export function OrdersSection({
  supabase,
  sales,
  profile,
  canManage,
  contractors,
  onRefresh,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  sales: SaleRecord[];
  profile: ProfileRecord;
  canManage: boolean;
  contractors: ProfileRecord[];
  onRefresh: () => void;
}) {
  const name = (id: string) => contractors.find((c) => c.id === id)?.full_name ?? id.slice(0, 8);
  const list = useMemo(() => {
    const mine = canManage ? sales : sales.filter((s) => s.contractor_id === profile.id);
    return [...mine].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [sales, canManage, profile.id]);

  const [busyId, setBusyId] = useState<string | null>(null);

  const idStatusLabel = (s: SaleRecord) => {
    const status = (s.id_verification_status ?? "not_sent").toLowerCase();
    if (status === "waiting") return "Waiting";
    if (status === "uploaded") return "Uploaded";
    if (status === "verified") return "Verified";
    return "Not Sent";
  };

  const patchSale = useCallback(
    async (row: SaleRecord, patch: Partial<SaleRecord>) => {
      setBusyId(row.id);
      const before = {
        sale_status: row.sale_status ?? null,
        activation_status: row.activation_status ?? null,
        payment_status: row.payment_status ?? null,
        phone_returned: row.phone_returned ?? null,
      };
      const { error } = await supabase.from("sales").update(patch).eq("id", row.id);
      if (error) {
        alert(error.message);
        setBusyId(null);
        return;
      }
      await insertHubAuditLog(supabase, profile.id, {
        action: "sale_lifecycle_update",
        entity_type: "sales",
        entity_id: row.id,
        before,
        after: { ...before, ...patch },
      });
      onRefresh();
      setBusyId(null);
    },
    [onRefresh, profile.id, supabase],
  );

  const sendIdLink = useCallback(
    async (row: SaleRecord) => {
      setBusyId(row.id);
      try {
        const res = await fetch("/api/id-verify/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ saleId: row.id, customerPhone: row.customer_phone, expiresMinutes: 45 }),
        });
        const body = (await res.json()) as { ok?: boolean; link?: string; smsMessage?: string; error?: string };
        if (!res.ok || !body.ok) throw new Error(body.error ?? "Unable to create ID link.");
        await navigator.clipboard.writeText(body.smsMessage ?? body.link ?? "");
        alert("ID upload message copied. Send it to customer by SMS.");
        onRefresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    },
    [onRefresh],
  );

  const verifyId = useCallback(
    async (row: SaleRecord) => {
      await patchSale(row, { id_verification_status: "verified", id_verified_at: new Date().toISOString() } as Partial<SaleRecord>);
    },
    [patchSale],
  );

  const selectCls = `${hubInputClass} py-1.5 text-xs`;

  return (
    <div className="space-y-4">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Orders</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Sales orders — newest first. {canManage ? "Managers can update lifecycle fields (syncs payout eligibility)." : null}
        </p>
      </HubCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-purple-500/20 text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 pr-4">When</th>
              <th className="pb-2 pr-4">Customer</th>
              <th className="pb-2 pr-4">Plan</th>
              <th className="pb-2 pr-4">Total</th>
              <th className="pb-2 pr-3">Sale status</th>
              <th className="pb-2 pr-3">Activation</th>
              <th className="pb-2 pr-3">Payment</th>
              <th className="pb-2 pr-3">Phone returned</th>
              <th className="pb-2 pr-3">ID status</th>
              {canManage ? <th className="pb-2 pr-3">ID actions</th> : null}
              {canManage ? <th className="pb-2">Agent</th> : null}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const disabled = busyId === s.id;
              const saleVal = (s.sale_status ?? "pending_approval") as (typeof SALE_STATUS_OPTIONS)[number];
              const actVal = (s.activation_status ?? "pending") as (typeof ACTIVATION_STATUS_OPTIONS)[number];
              const payVal = (s.payment_status ?? "pending") as (typeof PAYMENT_STATUS_OPTIONS)[number];
              return (
                <tr key={s.id} className="border-b border-zinc-800/80">
                  <td className="py-3 pr-4 text-zinc-400">{new Date(s.created_at).toLocaleString()}</td>
                  <td className="py-3 pr-4 text-white">
                    {s.customer_name}
                    <span className="block text-xs text-zinc-500">{s.customer_phone}</span>
                  </td>
                  <td className="py-3 pr-4 text-zinc-300">{s.plan_name || "—"}</td>
                  <td className="py-3 pr-4 font-medium text-emerald-200">{formatCurrency(s.total_sale)}</td>
                  <td className="py-3 pr-3 align-top">
                    {canManage ? (
                      <select
                        className={selectCls}
                        disabled={disabled}
                        value={SALE_STATUS_OPTIONS.includes(saleVal) ? saleVal : "pending_approval"}
                        onChange={(e) =>
                          void patchSale(s, { sale_status: e.target.value as SaleRecord["sale_status"] })
                        }
                      >
                        {SALE_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-zinc-400">{s.sale_status ?? "—"}</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 align-top">
                    {canManage ? (
                      <select
                        className={selectCls}
                        disabled={disabled}
                        value={ACTIVATION_STATUS_OPTIONS.includes(actVal) ? actVal : "pending"}
                        onChange={(e) =>
                          void patchSale(s, { activation_status: e.target.value as SaleRecord["activation_status"] })
                        }
                      >
                        {ACTIVATION_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-zinc-400">{s.activation_status ?? "—"}</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 align-top">
                    {canManage ? (
                      <select
                        className={selectCls}
                        disabled={disabled}
                        value={PAYMENT_STATUS_OPTIONS.includes(payVal) ? payVal : "pending"}
                        onChange={(e) =>
                          void patchSale(s, { payment_status: e.target.value as SaleRecord["payment_status"] })
                        }
                      >
                        {PAYMENT_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-zinc-400">{s.payment_status ?? "—"}</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 align-top">
                    {canManage ? (
                      <select
                        className={selectCls}
                        disabled={disabled}
                        value={s.phone_returned ? "yes" : "no"}
                        onChange={(e) => void patchSale(s, { phone_returned: e.target.value === "yes" })}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    ) : (
                      <span className="text-zinc-400">{s.phone_returned ? "Yes" : "No"}</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-zinc-300">{idStatusLabel(s)}</td>
                  {canManage ? (
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={`${hubBtnGhost} !px-3 !py-1.5`}
                          disabled={disabled}
                          onClick={() => void sendIdLink(s)}
                        >
                          Send ID Upload Link
                        </button>
                        <button
                          type="button"
                          className={`${hubBtnGhost} !px-3 !py-1.5 border-emerald-500/40 text-emerald-200`}
                          disabled={disabled || (s.id_verification_status ?? "") !== "uploaded"}
                          onClick={() => void verifyId(s)}
                        >
                          Verify ID
                        </button>
                      </div>
                    </td>
                  ) : null}
                  {canManage ? <td className="py-3 text-zinc-400">{name(s.contractor_id)}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length === 0 ? <p className="text-zinc-500">No orders yet.</p> : null}
    </div>
  );
}

export function PaymentsTrackerSection({
  supabase,
  sales,
  commissions,
  profile,
  canManage,
  contractors,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  sales: SaleRecord[];
  commissions: CommissionRecord[];
  profile: ProfileRecord;
  canManage: boolean;
  contractors: ProfileRecord[];
}) {
  const [payRows, setPayRows] = useState<
    { id: string; sale_id: string; amount: number; label: string | null; status: string; paid_at: string | null }[]
  >([]);

  const name = (id: string) => contractors.find((c) => c.id === id)?.full_name ?? id.slice(0, 8);
  const myCommissions = useMemo(() => {
    const rows = canManage ? commissions : commissions.filter((c) => c.contractor_id === profile.id);
    return [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [commissions, canManage, profile.id]);

  const saleVolume = useMemo(() => {
    const rows = canManage ? sales : sales.filter((s) => s.contractor_id === profile.id);
    return rows.reduce((a, s) => a + Number(s.total_sale), 0);
  }, [sales, canManage, profile.id]);

  const saleIds = useMemo(() => {
    const rows = canManage ? sales : sales.filter((s) => s.contractor_id === profile.id);
    return rows.map((s) => s.id);
  }, [sales, canManage, profile.id]);

  useEffect(() => {
    if (saleIds.length === 0) {
      queueMicrotask(() => setPayRows([]));
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("hub_sale_payments")
        .select("id,sale_id,amount,label,status,paid_at")
        .in("sale_id", saleIds)
        .order("sort_order", { ascending: true });
      if (cancelled || error) return;
      setPayRows(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, saleIds]);

  return (
    <div className="space-y-4">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Payment tracker</h2>
        <p className="mt-1 text-sm text-zinc-500">Commission payout status, recorded sale volume, and sale payment rows.</p>
        <p className="mt-3 text-sm text-zinc-300">
          Recorded sale volume (scope): <span className="font-semibold text-white">{formatCurrency(saleVolume)}</span>
        </p>
      </HubCard>
      {payRows.length > 0 ? (
        <HubCard>
          <p className="text-sm font-semibold text-white">Recorded payments (POS)</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            {payRows.map((p) => (
              <li key={p.id} className="flex justify-between gap-4 border-b border-zinc-800/80 pb-2">
                <span>
                  {p.label ?? "Payment"} · {p.status}
                  <span className="block text-xs text-zinc-500">{p.sale_id.slice(0, 8)}…</span>
                </span>
                <span className="text-emerald-300/90">{formatCurrency(p.amount)}</span>
              </li>
            ))}
          </ul>
        </HubCard>
      ) : null}
      {myCommissions.map((c) => (
        <HubCard key={c.id}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-white">{formatCurrency(c.amount)}</p>
              <p className="text-xs text-zinc-500">
                {c.type} · {c.paid ? "Paid" : "Unpaid"}
                {canManage ? ` · ${name(c.contractor_id)}` : ""}
              </p>
              <p className="text-xs text-zinc-600">{new Date(c.created_at).toLocaleString()}</p>
            </div>
          </div>
        </HubCard>
      ))}
      {myCommissions.length === 0 ? <p className="text-zinc-600">No commission rows in scope.</p> : null}
    </div>
  );
}

export function ManagerQueueSection({
  supabase,
  leads,
  commissions,
  contractors,
  onRefresh,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  leads: LeadRecord[];
  commissions: CommissionRecord[];
  contractors: ProfileRecord[];
  onRefresh: () => void;
}) {
  const newLeads = useMemo(() => leads.filter((l) => l.status === "New"), [leads]);
  const unpaid = useMemo(() => commissions.filter((c) => !c.paid), [commissions]);
  const contractorName = (id: string) => contractors.find((c) => c.id === id)?.full_name ?? id.slice(0, 8);

  async function togglePaid(c: CommissionRecord, paid: boolean) {
    const { error } = await supabase
      .from("commissions")
      .update({ paid, paid_at: paid ? new Date().toISOString() : null })
      .eq("id", c.id);
    if (error) {
      alert(error.message);
      return;
    }
    onRefresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <HubCard>
          <p className="text-xs font-semibold uppercase text-zinc-500">New leads</p>
          <p className="mt-2 text-3xl font-bold text-amber-300">{newLeads.length}</p>
          <p className="mt-1 text-xs text-zinc-500">Status = New — needs first contact</p>
        </HubCard>
        <HubCard>
          <p className="text-xs font-semibold uppercase text-zinc-500">Unpaid commissions</p>
          <p className="mt-2 text-3xl font-bold text-purple-300">{unpaid.length}</p>
          <p className="mt-1 text-xs text-zinc-500">Approve payouts below</p>
        </HubCard>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Queue — unpaid</h3>
        <div className="space-y-2">
          {unpaid.map((c) => (
            <HubCard key={c.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-white">{formatCurrency(c.amount)}</p>
                  <p className="text-xs text-zinc-500">
                    {contractorName(c.contractor_id)} · {c.type}
                  </p>
                </div>
                <button type="button" className={hubBtnPrimary} onClick={() => void togglePaid(c, true)}>
                  Mark paid
                </button>
              </div>
            </HubCard>
          ))}
          {unpaid.length === 0 ? <p className="text-zinc-600">No unpaid commissions.</p> : null}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">New leads (first in queue)</h3>
        <div className="space-y-2">
          {newLeads.slice(0, 15).map((l) => (
            <HubCard key={l.id}>
              <p className="font-medium text-white">{l.customer_name}</p>
              <p className="text-xs text-zinc-500">{l.customer_phone}</p>
              <Link href="/magichub/leads" className="mt-2 inline-block text-xs text-purple-300">
                Assign / update in Leads →
              </Link>
            </HubCard>
          ))}
          {newLeads.length === 0 ? <p className="text-zinc-600">No new leads.</p> : null}
        </div>
      </section>
    </div>
  );
}

export function DocumentsSection({
  supabase,
  profile,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  profile: ProfileRecord;
}) {
  const [docs, setDocs] = useState<{ id: string; title: string | null; kind: string | null; created_at: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("hub_documents")
        .select("id,title,kind,created_at")
        .eq("contractor_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (cancelled || error) return;
      setDocs(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profile.id]);

  return (
    <div className="space-y-4">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Documents</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Files uploaded during Start Sale (signatures, ID) appear here. Stored in the private{" "}
          <code className="text-purple-300">magichub-docs</code> bucket.
        </p>
      </HubCard>
      {docs.length === 0 ? (
        <p className="text-sm text-zinc-500">No documents yet — complete a sale with signatures or ID photo.</p>
      ) : (
        <HubCard>
          <ul className="space-y-2 text-sm text-zinc-300">
            {docs.map((d) => (
              <li key={d.id} className="flex justify-between gap-4 border-b border-zinc-800/60 pb-2">
                <span>
                  {d.title ?? "File"} {d.kind ? <span className="text-zinc-500">({d.kind})</span> : null}
                </span>
                <span className="text-xs text-zinc-500">{new Date(d.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </HubCard>
      )}
    </div>
  );
}

export function TasksSection({ leads, canManage, authUserId }: { leads: LeadRecord[]; canManage: boolean; authUserId: string }) {
  const open = useMemo(() => {
    const base = canManage ? leads : leads.filter((l) => l.contractor_id === authUserId);
    return base.filter((l) => l.status === "New" || l.status === "Contacted");
  }, [leads, canManage, authUserId]);

  return (
    <div className="space-y-4">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Follow-up tasks</h2>
        <p className="mt-1 text-sm text-zinc-500">Open leads (New or Contacted) that need a next step.</p>
      </HubCard>
      {open.map((l) => (
        <HubCard key={l.id}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-white">{l.customer_name}</p>
              <p className="text-sm text-zinc-400">{l.customer_phone}</p>
              <p className="mt-1 text-xs text-amber-300/90">{l.status}</p>
            </div>
            <Link href="/magichub/leads" className={hubBtnGhost}>
              Update lead
            </Link>
          </div>
        </HubCard>
      ))}
      {open.length === 0 ? <p className="text-zinc-500">No open follow-ups. Nice work.</p> : null}
    </div>
  );
}

export function ReportsSection({
  sales,
  leads,
  profile,
  canManage,
}: {
  sales: SaleRecord[];
  leads: LeadRecord[];
  profile: ProfileRecord;
  canManage: boolean;
}) {
  const todayIso = startOfLocalDayIso();
  const scopedSales = useMemo(() => {
    return canManage ? sales : sales.filter((s) => s.contractor_id === profile.id);
  }, [sales, canManage, profile.id]);
  const scopedLeads = useMemo(() => {
    return canManage ? leads : leads.filter((l) => l.contractor_id === profile.id);
  }, [leads, canManage, profile.id]);

  const salesToday = useMemo(() => {
    const cutoff = new Date(todayIso);
    return scopedSales.filter((s) => new Date(s.created_at) >= cutoff);
  }, [scopedSales, todayIso]);

  const leadsToday = useMemo(() => {
    const cutoff = new Date(todayIso);
    return scopedLeads.filter((l) => new Date(l.created_at) >= cutoff);
  }, [scopedLeads, todayIso]);

  const revenueToday = salesToday.reduce((a, s) => a + Number(s.total_sale), 0);
  const profitToday = salesToday.reduce((a, s) => a + Number(s.profit), 0);

  const planMix = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of salesToday) {
      const k = s.plan_name?.trim() || "(no plan name)";
      m[k] = (m[k] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [salesToday]);

  return (
    <div className="space-y-4">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Daily report</h2>
        <p className="mt-1 text-sm text-zinc-500">Today&apos;s activity for your scope ({canManage ? "org" : "you"}).</p>
      </HubCard>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HubCard>
          <p className="text-xs text-zinc-500">Sales count</p>
          <p className="mt-1 text-2xl font-bold text-white">{salesToday.length}</p>
        </HubCard>
        <HubCard>
          <p className="text-xs text-zinc-500">Revenue today</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">{formatCurrency(revenueToday)}</p>
        </HubCard>
        <HubCard>
          <p className="text-xs text-zinc-500">Profit today</p>
          <p className="mt-1 text-2xl font-bold text-white">{formatCurrency(profitToday)}</p>
        </HubCard>
        <HubCard>
          <p className="text-xs text-zinc-500">Leads created today</p>
          <p className="mt-1 text-2xl font-bold text-white">{leadsToday.length}</p>
        </HubCard>
      </div>
      {planMix.length > 0 ? (
        <HubCard>
          <p className="text-sm font-semibold text-white">Plan mix (today)</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            {planMix.map(([plan, n]) => (
              <li key={plan} className="flex justify-between gap-4 border-b border-zinc-800/60 pb-2">
                <span className="truncate">{plan}</span>
                <span className="text-zinc-500">{n}</span>
              </li>
            ))}
          </ul>
        </HubCard>
      ) : null}
    </div>
  );
}

export function CommissionPayoutSection({
  supabase,
  sales,
  commissions,
  contractors,
  profile,
  onRefresh,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  sales: SaleRecord[];
  commissions: CommissionRecord[];
  contractors: ProfileRecord[];
  profile: ProfileRecord;
  onRefresh: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [referenceById, setReferenceById] = useState<Record<string, string>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const weekStartIso = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    return mon.toISOString();
  }, []);
  const saleById = useMemo(() => new Map(sales.map((s) => [s.id, s])), [sales]);
  const roleById = useMemo(() => new Map(contractors.map((p) => [p.id, p.role])), [contractors]);
  const cashTagById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contractors) {
      const tag = (c as unknown as { cash_app_tag?: string | null }).cash_app_tag;
      if (tag) m.set(c.id, tag);
    }
    return m;
  }, [contractors]);

  const readyRows = useMemo(() => {
    return commissions.filter((c) => {
      if (c.paid) return false;
      const sale = c.sale_id ? saleById.get(c.sale_id) : undefined;
      if (!sale) return false;
      const blocked = commissionPayoutBlockedReason(sale);
      const holdOk = !sale.commission_hold_until || new Date(sale.commission_hold_until).getTime() <= nowMs;
      return !blocked && holdOk;
    });
  }, [commissions, saleById, nowMs]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const consultantReady = useMemo(
    () => readyRows.filter((c) => roleById.get(c.contractor_id) === "contractor"),
    [readyRows, roleById],
  );
  const managerReady = useMemo(
    () => readyRows.filter((c) => roleById.get(c.contractor_id) === "sale_manager"),
    [readyRows, roleById],
  );
  const paidThisWeek = useMemo(
    () => commissions.filter((c) => c.paid && c.paid_at && new Date(c.paid_at) >= new Date(weekStartIso)),
    [commissions, weekStartIso],
  );

  const totals = useMemo(() => {
    let owedConsultants = 0;
    let owedManagers = 0;
    for (const c of readyRows) {
      const sale = c.sale_id ? saleById.get(c.sale_id) : undefined;
      const split = splitConsultantManagerFromSale(sale, Number(c.amount));
      if (roleById.get(c.contractor_id) === "sale_manager") owedManagers += split.consultant + split.manager;
      else owedConsultants += split.consultant + split.manager;
    }
    const paidWeek = paidThisWeek.reduce((a, c) => a + Number(c.amount), 0);
    const pending = readyRows.reduce((a, c) => a + Number(c.amount), 0);
    return { owedConsultants, owedManagers, paidWeek, pending };
  }, [readyRows, saleById, roleById, paidThisWeek]);

  async function markPaid(c: CommissionRecord, payoutMethod: "cash_app" | "mercury_bank") {
    const ref = (referenceById[c.id] ?? "").trim();
    if (!ref) {
      alert(payoutMethod === "cash_app" ? "Cash App tag is required." : "Mercury transfer ID is required.");
      return;
    }
    setBusyId(c.id);
    const { error } = await supabase
      .from("commissions")
      .update({
        paid: true,
        paid_at: new Date().toISOString(),
        payout_method: payoutMethod,
        payout_date: new Date().toISOString(),
        payout_reference: ref,
        paid_by: profile.id,
      })
      .eq("id", c.id);
    if (error) alert(error.message);
    else {
      await insertHubAuditLog(supabase, profile.id, {
        action: "payout_completed",
        entity_type: "commissions",
        entity_id: c.id,
        after: { payout_method: payoutMethod, payout_reference: ref },
      });
      onRefresh();
    }
    setBusyId(null);
  }

  return (
    <div className="space-y-6">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Commission payout rules</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Commission rows unlock only when <strong className="text-zinc-300">sale = Approved</strong>,{" "}
          <strong className="text-zinc-300">activation = Completed</strong>, and{" "}
          <strong className="text-zinc-300">payment = Paid</strong>, with no device return. Totals use consultant /
          manager splits stored on each sale. Consultants are paid via Cash App, managers via Mercury bank transfer.
        </p>
      </HubCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HubStat label="Total owed to consultants" value={formatCurrency(totals.owedConsultants)} />
        <HubStat label="Total owed to managers" value={formatCurrency(totals.owedManagers)} />
        <HubStat label="Paid this week" value={formatCurrency(totals.paidWeek)} />
        <HubStat label="Pending payouts" value={formatCurrency(totals.pending)} />
      </div>

      <HubCard>
        <h3 className="text-base font-semibold text-white">Weekly payout flow - Ready to Pay</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Eligibility: payment = Paid, activation = Completed, sale = Approved, hold period completed.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-300">Consultants - Cash App</p>
            <div className="mt-2 space-y-2">
              {consultantReady.map((c) => (
                <div key={c.id} className="rounded-xl border border-zinc-800 bg-black/40 p-3 text-sm">
                  <p className="font-medium text-white">{contractors.find((x) => x.id === c.contractor_id)?.full_name ?? c.contractor_id.slice(0,8)}</p>
                  <p className="text-zinc-400">{formatCurrency(c.amount)}</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      className={hubInputClass}
                      placeholder={cashTagById.get(c.contractor_id) ? `Cash App ${cashTagById.get(c.contractor_id)}` : "Cash App tag"}
                      value={referenceById[c.id] ?? cashTagById.get(c.contractor_id) ?? ""}
                      onChange={(e) => setReferenceById((m) => ({ ...m, [c.id]: e.target.value }))}
                    />
                    <button type="button" className={hubBtnPrimary} disabled={busyId===c.id} onClick={() => void markPaid(c, "cash_app")}>Mark Paid</button>
                  </div>
                </div>
              ))}
              {consultantReady.length === 0 ? <p className="text-sm text-zinc-600">No consultant payouts ready.</p> : null}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-blue-300">Managers - Mercury</p>
            <div className="mt-2 space-y-2">
              {managerReady.map((c) => (
                <div key={c.id} className="rounded-xl border border-zinc-800 bg-black/40 p-3 text-sm">
                  <p className="font-medium text-white">{contractors.find((x) => x.id === c.contractor_id)?.full_name ?? c.contractor_id.slice(0,8)}</p>
                  <p className="text-zinc-400">{formatCurrency(c.amount)}</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      className={hubInputClass}
                      placeholder="Mercury transfer ID"
                      value={referenceById[c.id] ?? ""}
                      onChange={(e) => setReferenceById((m) => ({ ...m, [c.id]: e.target.value }))}
                    />
                    <button type="button" className={hubBtnPrimary} disabled={busyId===c.id} onClick={() => void markPaid(c, "mercury_bank")}>Mark Paid</button>
                  </div>
                </div>
              ))}
              {managerReady.length === 0 ? <p className="text-sm text-zinc-600">No manager payouts ready.</p> : null}
            </div>
          </div>
        </div>
      </HubCard>

      <HubCard>
        <h3 className="text-base font-semibold text-white">Plan payouts</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-purple-500/25 text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-2 pr-4">Plan</th>
                <th className="pb-2 pr-4">Price</th>
                <th className="pb-2 pr-4">Consultant</th>
                <th className="pb-2">Manager</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_PAYOUT_REFERENCE.map((row) => (
                <tr key={row.planLabel} className="border-b border-zinc-800/80">
                  <td className="py-2.5 pr-4 text-zinc-200">{row.planLabel}</td>
                  <td className="py-2.5 pr-4 text-zinc-400">{row.priceNote}</td>
                  <td className="py-2.5 pr-4 text-emerald-200">{formatCurrency(row.consultant)}</td>
                  <td className="py-2.5 text-blue-200/90">{formatCurrency(row.manager)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HubCard>

      <HubCard>
        <h3 className="text-base font-semibold text-white">Phone payout tiers</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Admin inventory pricing uses device-specific numbers within these bands (Budget → Ultra / Fold).
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-purple-500/25 text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-2 pr-4">Tier</th>
                <th className="pb-2 pr-4">Consultant</th>
                <th className="pb-2">Manager</th>
              </tr>
            </thead>
            <tbody>
              {PHONE_TIER_PAYOUT_REFERENCE.map((row) => (
                <tr key={row.tier} className="border-b border-zinc-800/80">
                  <td className="py-2.5 pr-4 text-zinc-200">{row.tier}</td>
                  <td className="py-2.5 pr-4 text-emerald-200/90">{row.consultantRange}</td>
                  <td className="py-2.5 text-blue-200/90">{row.managerRange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HubCard>

      <HubCard>
        <h3 className="text-base font-semibold text-white">No commission when</h3>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-zinc-300">
          {COMMISSION_PAYOUT_BLOCKERS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-zinc-500">
          Orders uses these fields to drive <code className="text-purple-300">payout_eligible</code> on each commission
          row once the database trigger matches approved / completed / paid.
        </p>
      </HubCard>
    </div>
  );
}

export function SettingsSection() {
  return (
    <div className="space-y-4">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Hub settings</h2>
        <p className="mt-1 text-sm text-zinc-500">Commission rules used across MagicHub and the contractor portal.</p>
        <ul className="mt-4 space-y-2 text-sm text-zinc-300">
          <li>Phone (included): {formatCurrency(COMMISSION_RULES.phoneSale)} flat per eligible sale</li>
          <li>Plan (included): {formatCurrency(COMMISSION_RULES.planActivation)} flat per eligible sale</li>
          <li>Accessories: {(COMMISSION_RULES.accessoriesRate * 100).toFixed(0)}% of accessory dollars</li>
        </ul>
        <p className="mt-4 text-xs text-zinc-600">
          To change rules, update <code className="text-purple-300">COMMISSION_RULES</code> in{" "}
          <code className="text-purple-300">lib/magic-mobile.ts</code> and redeploy.
        </p>
        <Link href="/magichub/admin" className={`mt-4 inline-block text-sm text-purple-300`}>
          Open Admin →
        </Link>
      </HubCard>
    </div>
  );
}
