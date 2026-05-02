"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { COMMISSION_RULES, formatCurrency, type LeadRecord, type ProfileRecord } from "@/lib/magic-mobile";
import {
  computeQuotePricing,
  defaultPricingOverrides,
  fetchPricingOverridesFromSupabase,
  matchPhoneCatalogEntry,
  planPayoutFromRows,
  type PricingOverrides,
} from "@/lib/magichub-pricing";
import {
  planChargeDueToday,
  planLabelForSale,
  MAGICHUB_PLAN_CATALOG,
  planMonthlyRecurringAmount,
} from "@/lib/magichub-catalog";
import type { InventoryRecord } from "@/lib/magichub";
import {
  clearSessionDraft,
  computeWorkflowTotals,
  emptySaleDraft,
  loadSessionDraft,
  type SaleWorkflowDraft,
  saveSessionDraft,
} from "@/lib/magichub-workflow";
import { uploadDataUrl } from "@/lib/magichub-storage";
import { insertHubAuditLog } from "@/lib/magichub-audit";
import {
  promoCountdownLabel,
  promoIsActiveNow,
  promoVisibleToRole,
  suggestedPromos,
  type PromoCodeRecord,
  validateAndScorePromo,
} from "@/lib/magichub-promos";
import { HubCard, hubBtnGhost, hubBtnPrimary, hubInputClass } from "@/components/magichub/MagicHubShell";
import { WorkflowStepper } from "@/components/magichub/workflow/WorkflowStepper";
import { SignaturePad } from "@/components/magichub/workflow/SignaturePad";
import { PlanComparisonCards } from "@/components/magichub/MagicMobilePlans";
import { useManagerPin } from "@/components/magichub/ManagerPinGate";
import { canUseManagerPin } from "@/lib/magichub-pin-api-auth";
import { isMissingPublicTableError } from "@/lib/postgrest-errors";

const BRANDS = ["Apple", "Samsung", "Google", "Motorola", "Other"] as const;

function formatClientError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const msg = typeof o.message === "string" ? o.message : "";
    const code = typeof o.code === "string" ? o.code : "";
    return [msg, code && `(${code})`].filter(Boolean).join(" ");
  }
  return String(err);
}

export function SaleWorkflowClient({
  step,
  resumeQuoteId,
  supabase,
  profile,
  inventory,
  leads,
  contractors,
  canManage,
  onRefresh,
  authEmail = null,
}: {
  step: number;
  resumeQuoteId?: string | null;
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  profile: ProfileRecord;
  inventory: InventoryRecord[];
  leads: LeadRecord[];
  contractors: ProfileRecord[];
  canManage: boolean;
  onRefresh: () => void;
  /** For CEO (email-based PIN); profile.role may not be admin. */
  authEmail?: string | null;
}) {
  const router = useRouter();
  /** Same initial state on server + client avoids hydration mismatch (sessionStorage only exists on client). */
  const [draft, setDraftState] = useState<SaleWorkflowDraft>(() => emptySaleDraft());
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [saleAgentOverride, setSaleAgentOverride] = useState<string | null>(null);
  const isManagerCreator = profile.role === "sale_manager";
  const preferredContractorId = isManagerCreator ? profile.id : canManage && contractors.length > 0 ? contractors[0].id : profile.id;
  const saleAgentId = isManagerCreator ? profile.id : saleAgentOverride ?? preferredContractorId;
  const [finishing, setFinishing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [pricingPack, setPricingPack] = useState<PricingOverrides>(() => defaultPricingOverrides());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [promoRows, setPromoRows] = useState<PromoCodeRecord[]>([]);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoOverride, setPromoOverride] = useState(false);
  const [saleCompletedId, setSaleCompletedId] = useState<string | null>(null);
  const [idLinkSending, setIdLinkSending] = useState(false);
  const { ensureUnlocked } = useManagerPin();

  const setDraft = useCallback((next: SaleWorkflowDraft | ((prev: SaleWorkflowDraft) => SaleWorkflowDraft)) => {
    setDraftState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      saveSessionDraft(resolved);
      return resolved;
    });
  }, []);

  const device = inventory.find((d) => d.id === draft.deviceId);
  const planEntry = MAGICHUB_PLAN_CATALOG.find((p) => p.id === draft.plan.planId);

  const totals = useMemo(
    () => computeWorkflowTotals(draft, device, planEntry),
    [draft, device, planEntry],
  );

  const myLeads = useMemo(() => leads.filter((l) => l.contractor_id === profile.id), [leads, profile.id]);

  const filteredDevices = useMemo(() => {
    let rows = inventory.filter((i) => i.status === "Available");
    if (brandFilter && brandFilter !== "Other") {
      rows = rows.filter((i) => i.phone_model.toLowerCase().includes(brandFilter.toLowerCase()));
    }
    return rows;
  }, [inventory, brandFilter]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (resumeQuoteId) {
          const { data, error } = await supabase
            .from("hub_quotes")
            .select("id,payload")
            .eq("id", resumeQuoteId)
            .eq("contractor_id", profile.id)
            .maybeSingle();
          if (cancelled) return;
          if (error && !isMissingPublicTableError(error, "hub_quotes")) return;
          if (data?.payload && typeof data.payload === "object") {
            setQuoteId(data.id);
            const merged = { ...emptySaleDraft(), ...(data.payload as SaleWorkflowDraft) };
            setDraftState(merged);
            saveSessionDraft(merged);
          } else if (!cancelled) {
            setDraftState(loadSessionDraft());
          }
          return;
        }

        const session = loadSessionDraft();
        if (!cancelled) setDraftState(session);

        const { data, error } = await supabase
          .from("hub_quotes")
          .select("id,payload")
          .eq("contractor_id", profile.id)
          .eq("status", "draft")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (error && !isMissingPublicTableError(error, "hub_quotes")) return;
        if (data?.payload && typeof data.payload === "object") {
          setQuoteId(data.id);
          const merged = { ...emptySaleDraft(), ...(data.payload as SaleWorkflowDraft) };
          setDraftState(merged);
          saveSessionDraft(merged);
        }
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profile.id, resumeQuoteId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remote = await fetchPricingOverridesFromSupabase(supabase);
      if (!cancelled && remote) setPricingPack(remote);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("hub_promo_codes").select("*").order("created_at", { ascending: false });
      if (cancelled || error) return;
      setPromoRows((data ?? []) as PromoCodeRecord[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!bootstrapped) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        const payload = { ...draft } as Record<string, unknown>;
        delete payload.step;
        const row = {
          contractor_id: profile.id,
          status: "draft" as const,
          payload: draft,
          updated_at: new Date().toISOString(),
        };
        if (quoteId) {
          const { error } = await supabase.from("hub_quotes").update(row).eq("id", quoteId);
          if (error && !isMissingPublicTableError(error, "hub_quotes")) console.warn(error);
        } else {
          const { data, error } = await supabase.from("hub_quotes").insert(row).select("id").single();
          if (!error && data?.id) setQuoteId(data.id);
          else if (error && !isMissingPublicTableError(error, "hub_quotes")) console.warn(error);
        }
      })();
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [bootstrapped, draft, profile.id, quoteId, supabase]);

  const go = (n: number) => {
    const clamped = Math.min(8, Math.max(1, n));
    router.push(`/magichub/sale/${clamped}`);
  };

  const commEstimate = useMemo(() => {
    const phoneCat = device ? matchPhoneCatalogEntry(device.phone_model, pricingPack.phoneRows) : undefined;
    const phoneComm = phoneCat
      ? { consultant: phoneCat.consultantPayout, manager: phoneCat.managerPayout }
      : { consultant: 0, manager: 0 };
    const selectedPlanOverride = pricingPack.planRows.find((p) => p.id === draft.plan.planId);
    const planComm = selectedPlanOverride
      ? { consultant: selectedPlanOverride.consultantPayout, manager: selectedPlanOverride.managerPayout }
      : planPayoutFromRows(draft.plan.planId, pricingPack.planRows);
    const accComm =
      totals.addonTotal > 0 ? Number((totals.addonTotal * COMMISSION_RULES.accessoriesRate).toFixed(2)) : 0;
    const incP = Boolean(device);
    const incPl = Boolean(planEntry);
    return Number(
      (
        (incP ? phoneComm.consultant + phoneComm.manager : 0) +
        (incPl ? planComm.consultant + planComm.manager : 0) +
        accComm
      ).toFixed(2),
    );
  }, [device, draft.plan.planId, planEntry, pricingPack.phoneRows, pricingPack.planRows, totals.addonTotal]);

  const customerDigits = draft.customer.phone.replace(/\D/g, "");
  const customerIsReturning = useMemo(() => {
    if (!customerDigits || customerDigits.length < 7) return false;
    return leads.some((l) => l.customer_phone.replace(/\D/g, "") === customerDigits);
  }, [customerDigits, leads]);

  const activePromos = useMemo(
    () =>
      promoRows
        .filter((p) => promoVisibleToRole(p, profile.role))
        .filter((p) => promoIsActiveNow(p)),
    [promoRows, profile.role],
  );
  const selectedPromo = useMemo(
    () => activePromos.find((p) => p.code === (draft.quote.promoCode ?? "")) ?? null,
    [activePromos, draft.quote.promoCode],
  );
  const promoSuggestions = useMemo(
    () => suggestedPromos(activePromos, { selectedPlanName: planEntry?.name ?? draft.plan.carrier ?? "", includesPhone: Boolean(device) }),
    [activePromos, planEntry?.name, draft.plan.carrier, device],
  );
  const grossProfitBeforePromo = Number(totals.profitEstimate || 0);
  const promoDiscount = Number(draft.quote.promoDiscountAmount ?? draft.quote.discountAmount ?? 0);
  const netProfitAfterCommission = Number((grossProfitBeforePromo - promoDiscount - commEstimate).toFixed(2));

  const applyPromoCode = useCallback(
    async (code: string) => {
      if (!code) {
        setPromoMessage(null);
        setDraft((x) => ({
          ...x,
          quote: { ...x.quote, promoCode: "", promoDiscountAmount: 0, promoAppliedAt: "", promoNotes: "" },
        }));
        return;
      }
      const promo = activePromos.find((p) => p.code === code);
      if (!promo) {
        setPromoMessage("Promo is not active or not visible for your role.");
        return;
      }
      const result = validateAndScorePromo(promo, {
        profile,
        allowAdminOverride: promoOverride,
        sale: {
          includesPhone: Boolean(device),
          includesPlan: Boolean(planEntry),
          addonCase: draft.plan.addons.case,
          selectedPlanName: planEntry?.name ?? draft.plan.carrier ?? "",
          selectedPlanId: draft.plan.planId,
          lineCount: Number(draft.quote.lineCount ?? 1),
          phoneDigits: customerDigits,
          customerIsReturning,
          grossProfitBeforePromo,
          expectedCommission: commEstimate,
        },
      });
      if (!result.ok) {
        setPromoMessage(result.reason ?? "Promo cannot be applied.");
        return;
      }
      setPromoMessage(null);
      setDraft((x) => ({
        ...x,
        plan: result.addsFreeCase ? { ...x.plan, addons: { ...x.plan.addons, case: true } } : x.plan,
        quote: {
          ...x.quote,
          promoCode: promo.code,
          promoDiscountAmount: result.discountAmount,
          discountAmount: result.discountAmount,
          promoAppliedAt: new Date().toISOString(),
          promoNotes: promo.rule_text ?? "",
        },
      }));
      await insertHubAuditLog(supabase, profile.id, {
        action: "promo_applied",
        entity_type: "hub_promo_codes",
        entity_id: promo.id,
        after: { code: promo.code, discount: result.discountAmount, override: promoOverride },
      });
    },
    [
      activePromos,
      profile,
      promoOverride,
      device,
      planEntry,
      draft.plan.addons.case,
      draft.plan.carrier,
      draft.plan.planId,
      draft.quote.lineCount,
      customerDigits,
      customerIsReturning,
      grossProfitBeforePromo,
      commEstimate,
      setDraft,
      supabase,
    ],
  );

  const sendIdUploadLink = useCallback(async () => {
    if (!saleCompletedId) return;
    setIdLinkSending(true);
    try {
      const res = await fetch("/api/id-verify/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: saleCompletedId,
          customerPhone: draft.customer.phone.trim(),
          expiresMinutes: 45,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; link?: string; smsMessage?: string; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Failed to generate link.");
      await navigator.clipboard.writeText(body.smsMessage ?? body.link ?? "");
      setMsg("ID upload SMS message copied. Paste/send to customer.");
    } catch (e) {
      setMsg(formatClientError(e));
    } finally {
      setIdLinkSending(false);
    }
  }, [draft.customer.phone, saleCompletedId]);

  async function finalizeSale() {
    if (!draft.deviceId || !device) {
      setMsg("Select a device in step 2.");
      return;
    }
    if (!draft.customer.fullName.trim() || !draft.customer.phone.trim()) {
      setMsg("Customer name and phone are required.");
      return;
    }
    if (netProfitAfterCommission < 0 && !(profile.role === "admin" && promoOverride)) {
      setMsg("Promo/discount blocked: net profit would fall below $0.");
      return;
    }
    if (canUseManagerPin(profile.role, authEmail ?? undefined)) {
      if (!(await ensureUnlocked({ forceVerify: true }))) return;
    }
    setFinishing(true);
    setMsg(null);
    const warnings: string[] = [];
    try {
      const planName = planLabelForSale(planEntry) || draft.plan.carrier || "Plan";
      const selectedPlanOverride = pricingPack.planRows.find((p) => p.id === draft.plan.planId);
      const planChargeToday =
        selectedPlanOverride?.oneTimePrice != null
          ? selectedPlanOverride.oneTimePrice
          : planChargeDueToday(planEntry, draft.plan.firstMonthFree);
      const settings = pricingPack.settings;
      const caseAmount = draft.plan.addons.case ? settings.addons.casePrice : 0;
      const chargerAmount = draft.plan.addons.charger ? settings.addons.chargerPrice : 0;
      const screenAmount = draft.plan.addons.screenProtector ? settings.addons.screenProtectorPrice : 0;
      const accessoryAmount = caseAmount + chargerAmount + screenAmount;
      const phoneCat = device ? matchPhoneCatalogEntry(device.phone_model, pricingPack.phoneRows) : undefined;
      const phoneComm = phoneCat
        ? { consultant: phoneCat.consultantPayout, manager: phoneCat.managerPayout }
        : { consultant: 0, manager: 0 };
      const planComm = selectedPlanOverride
        ? { consultant: selectedPlanOverride.consultantPayout, manager: selectedPlanOverride.managerPayout }
        : planPayoutFromRows(draft.plan.planId, pricingPack.planRows);
      const accessoryCommission =
        accessoryAmount > 0 ? Number((accessoryAmount * COMMISSION_RULES.accessoriesRate).toFixed(2)) : 0;
      const includesPhone = Boolean(device);
      const includesPlan = Boolean(planEntry);
      const consultantPayout =
        (includesPhone ? phoneComm.consultant : 0) +
        (includesPlan ? planComm.consultant : 0) +
        accessoryCommission;
      const managerPayout =
        isManagerCreator
          ? 0
          : (includesPhone ? phoneComm.manager : 0) + (includesPlan ? planComm.manager : 0);
      const planMrc =
        selectedPlanOverride?.oneTimePrice != null
          ? 0
          : (selectedPlanOverride?.priceMonthly ?? planMonthlyRecurringAmount(planEntry));
      const quoteSnap = computeQuotePricing({
        phoneSellPrice: device.selling_price,
        phoneBuyPrice: device.cost,
        planChargeToday,
        planMonthlyRecurring: planMrc,
        activationFee: settings.activationFee,
        casePrice: caseAmount,
        chargerPrice: chargerAmount,
        screenProtectorPrice: screenAmount,
        discount: draft.quote.promoDiscountAmount || draft.quote.discountAmount || 0,
        taxPercent: draft.quote.taxPercent || 0,
        consultantPayout,
        managerPayout,
      });
      const { data: saleId, error: rpcErr } = await supabase.rpc("create_magichub_sale", {
        p_inventory_id: draft.deviceId,
        p_lead_id: draft.leadId || null,
        p_plan_name: planName,
        p_accessory_amount: accessoryAmount,
        p_includes_phone: includesPhone,
        p_includes_plan: includesPlan,
        p_customer_name: draft.customer.fullName.trim(),
        p_customer_phone: draft.customer.phone.trim(),
        p_contractor_id: canManage ? saleAgentId : null,
        p_discount: draft.quote.promoDiscountAmount || draft.quote.discountAmount || 0,
        p_plan_charge_today: planChargeToday,
        p_consultant_payout: consultantPayout,
        p_manager_payout: managerPayout,
        p_bundled_with_service: Boolean(planEntry && draft.plan.planId),
        p_tax_rate_percent: draft.quote.taxPercent || 0,
        p_taxable_subtotal: quoteSnap.taxableSubtotalBeforeTax,
        p_total_tax: quoteSnap.taxes,
      });
      if (rpcErr) throw rpcErr;
      if (!saleId) throw new Error("Sale ID missing");
      await supabase
        .from("sales")
        .update({
          created_by_role: isManagerCreator ? "Manager" : "Consultant",
          promo_code: draft.quote.promoCode || null,
          promo_discount_amount: draft.quote.promoDiscountAmount || draft.quote.discountAmount || 0,
          promo_stack_count: 1,
          promo_override_used: promoOverride,
          promo_applied_at: draft.quote.promoCode ? new Date().toISOString() : null,
        })
        .eq("id", saleId as string);
      await insertHubAuditLog(supabase, profile.id, {
        action: "sale_created",
        entity_type: "sales",
        entity_id: saleId as string,
        after: { created_by_role: isManagerCreator ? "Manager" : "Consultant" },
      });
      if (draft.quote.promoCode) {
        await insertHubAuditLog(supabase, profile.id, {
          action: "promo_applied",
          entity_type: "sales",
          entity_id: saleId as string,
          after: {
            promo_code: draft.quote.promoCode,
            promo_discount_amount: draft.quote.promoDiscountAmount || draft.quote.discountAmount || 0,
            override: promoOverride,
          },
        });
      }

      const uid = profile.id;

      if (draft.agreement.customerSignatureDataUrl) {
        try {
          const up = await uploadDataUrl(supabase, uid, `sale-${saleId}/customer-sig.png`, draft.agreement.customerSignatureDataUrl);
          await supabase.from("hub_documents").insert({
            contractor_id: uid,
            storage_path: up.path,
            title: "Customer signature",
            kind: "signature",
            sale_id: saleId as string,
            quote_id: quoteId,
          });
        } catch (e) {
          warnings.push(`Customer signature upload: ${formatClientError(e)}`);
        }
      }
      if (draft.agreement.repSignatureDataUrl) {
        try {
          const up = await uploadDataUrl(supabase, uid, `sale-${saleId}/rep-sig.png`, draft.agreement.repSignatureDataUrl);
          await supabase.from("hub_documents").insert({
            contractor_id: uid,
            storage_path: up.path,
            title: "Rep signature",
            kind: "signature",
            sale_id: saleId as string,
            quote_id: quoteId,
          });
        } catch (e) {
          warnings.push(`Rep signature upload: ${formatClientError(e)}`);
        }
      }

      if (draft.customer.idDocumentDataUrl) {
        try {
          const up = await uploadDataUrl(supabase, uid, `sale-${saleId}/id-document.png`, draft.customer.idDocumentDataUrl);
          await supabase.from("hub_documents").insert({
            contractor_id: uid,
            storage_path: up.path,
            title: "ID document",
            kind: "id",
            sale_id: saleId as string,
            quote_id: quoteId,
          });
        } catch (e) {
          warnings.push(`ID document upload: ${formatClientError(e)}`);
        }
      }

      try {
        await supabase.from("hub_activations").upsert(
          {
            sale_id: saleId as string,
            imei: draft.activation.imei || null,
            sim: draft.activation.sim || null,
            eid: draft.activation.eid || null,
            carrier: draft.activation.carrier || planEntry?.carrier || null,
            checklist: draft.activation.checklist,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "sale_id" },
        );
        await insertHubAuditLog(supabase, profile.id, {
          action: "activation_completed",
          entity_type: "hub_activations",
          entity_id: saleId as string,
        });
      } catch (e) {
        warnings.push(`Activation record: ${formatClientError(e)}`);
      }

      try {
        await supabase.from("hub_sale_metadata").upsert(
          {
            sale_id: saleId as string,
            workflow_snapshot: draft as unknown as Record<string, unknown>,
            manager_notes: draft.managerNotes ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "sale_id" },
        );
      } catch (e) {
        warnings.push(`Sale metadata: ${formatClientError(e)}`);
      }

      try {
        await supabase.from("hub_sale_payments").insert({
          sale_id: saleId as string,
          amount: totals.dueToday,
          label: "Due at sale",
          sort_order: 0,
          status: "paid",
          paid_at: new Date().toISOString(),
        });
      } catch (e) {
        warnings.push(`Payment row: ${formatClientError(e)}`);
      }

      const phoneDigits = draft.customer.phone.replace(/\D/g, "");
      if (phoneDigits.length >= 7) {
        try {
          const base = {
            contractor_id: saleAgentId,
            lead_id: draft.leadId,
            full_name: draft.customer.fullName.trim(),
            phone: draft.customer.phone.trim(),
            phone_digits: phoneDigits,
            email: draft.customer.email.trim() || null,
            address: draft.customer.address.trim() || null,
            birthday: draft.customer.birthday.trim() || null,
            id_type: draft.customer.idType || null,
            notes: draft.customer.notes.trim() || null,
            updated_at: new Date().toISOString(),
          };
          const { data: hit, error: findErr } = await supabase
            .from("hub_customers")
            .select("id")
            .eq("contractor_id", saleAgentId)
            .eq("phone_digits", phoneDigits)
            .maybeSingle();
          if (findErr) throw findErr;
          if (hit?.id) {
            const { error: upErr } = await supabase.from("hub_customers").update(base).eq("id", hit.id);
            if (upErr) throw upErr;
          } else {
            const { error: insErr } = await supabase.from("hub_customers").insert(base);
            if (insErr) throw insErr;
          }
        } catch (e) {
          warnings.push(`CRM profile: ${formatClientError(e)}`);
        }
      }

      if (quoteId) {
        try {
          await supabase
            .from("hub_quotes")
            .update({
              status: "converted",
              converted_sale_id: saleId as string,
              updated_at: new Date().toISOString(),
            })
            .eq("id", quoteId);
        } catch (e) {
          warnings.push(`Quote status: ${formatClientError(e)}`);
        }
      }

      clearSessionDraft();
      setDraftState(emptySaleDraft());
      setSaleCompletedId(saleId as string);
      onRefresh();
      if (warnings.length > 0) {
        setMsg(`Sale recorded. ${warnings.join(" · ")}`);
      } else {
        setMsg("Sale recorded successfully.");
      }
    } catch (e) {
      setMsg(formatClientError(e));
    } finally {
      setFinishing(false);
    }
  }

  if (!bootstrapped) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <p className="text-zinc-500">Loading sale workspace…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Start sale</h2>
          <p className="text-sm text-zinc-500">8-step workflow — saved as a draft quote while you work.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={hubBtnGhost} onClick={() => step > 1 && go(step - 1)}>
            Back
          </button>
          <button type="button" className={hubBtnPrimary} onClick={() => step < 8 && go(step + 1)}>
            Next
          </button>
          <Link href="/magichub/dashboard" className={hubBtnGhost}>
            Exit
          </Link>
        </div>
      </div>

      <WorkflowStepper current={step} />

      {step === 1 && (
        <HubCard>
          <h3 className="text-lg font-semibold text-white">Step 1 — Customer</h3>
          {canManage ? (
            <label className="mt-4 block text-xs text-zinc-500">
              Credit sale to (step 8 uses RPC)
              <select
                className={`mt-1 ${hubInputClass}`}
                value={saleAgentId}
                onChange={(e) => setSaleAgentOverride(e.target.value)}
              >
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name || c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="mt-4 block text-xs text-zinc-500">
            Link lead (optional)
            <select
              className={`mt-1 ${hubInputClass}`}
              value={draft.leadId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                const L = leads.find((l) => l.id === id);
                setDraft((d) => ({
                  ...d,
                  leadId: id,
                  customer: L
                    ? {
                        ...d.customer,
                        fullName: L.customer_name,
                        phone: L.customer_phone,
                      }
                    : d.customer,
                }));
              }}
            >
              <option value="">— None —</option>
              {(canManage ? leads : myLeads).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.customer_name} · {l.customer_phone}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(
              [
                ["fullName", "Full name"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["address", "Address"],
                ["birthday", "Birthday"],
              ] as const
            ).map(([k, lab]) => (
              <label key={k} className="block text-sm">
                <span className="text-xs text-zinc-500">{lab}</span>
                <input
                  className={`mt-1 ${hubInputClass}`}
                  value={draft.customer[k]}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      customer: { ...d.customer, [k]: e.target.value },
                    }))
                  }
                />
              </label>
            ))}
            <label className="block text-sm md:col-span-2">
              <span className="text-xs text-zinc-500">ID type</span>
              <select
                className={`mt-1 ${hubInputClass}`}
                value={draft.customer.idType}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    customer: { ...d.customer, idType: e.target.value },
                  }))
                }
              >
                <option>Driver License</option>
                <option>State ID</option>
                <option>Passport</option>
                <option>Military ID</option>
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-xs text-zinc-500">ID photo (stored after sale finalizes)</span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="mt-1 w-full text-sm text-zinc-400"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () =>
                    setDraft((d) => ({
                      ...d,
                      customer: { ...d.customer, idDocumentDataUrl: String(reader.result) },
                    }));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-xs text-zinc-500">Notes</span>
              <textarea
                className={`mt-1 min-h-[88px] ${hubInputClass}`}
                value={draft.customer.notes}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    customer: { ...d.customer, notes: e.target.value },
                  }))
                }
              />
            </label>
          </div>
        </HubCard>
      )}

      {step === 2 && (
        <HubCard>
          <h3 className="text-lg font-semibold text-white">Step 2 — Device</h3>
          <p className="text-xs text-amber-400/90">Filter by brand; pick from available inventory.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {BRANDS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBrandFilter(b === brandFilter ? null : b)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  brandFilter === b ? "border-purple-500 bg-purple-500/20 text-white" : "border-zinc-700 text-zinc-400"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          <ul className="mt-4 space-y-2">
            {filteredDevices.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setDraft((x) => ({ ...x, deviceId: d.id }))}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm ${
                    draft.deviceId === d.id
                      ? "border-purple-500 bg-purple-500/15 text-white"
                      : "border-zinc-800 bg-zinc-950 text-zinc-300"
                  }`}
                >
                  <span>{d.phone_model}</span>
                  <span className="text-zinc-500">
                    {formatCurrency(d.selling_price)} · {d.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {filteredDevices.length === 0 ? <p className="text-sm text-amber-400">No devices match. Ask a manager to add inventory.</p> : null}
        </HubCard>
      )}

      {step === 3 && (
        <HubCard>
          <h3 className="text-lg font-semibold text-white">Step 3 — Plan &amp; add-ons</h3>
          <p className="mt-1 text-xs text-zinc-500">Select one plan. Compare data, hotspot, and included features below.</p>
          <div className="mt-4">
            <PlanComparisonCards
              selectedId={draft.plan.planId}
              onSelect={(p) =>
                setDraft((x) => ({
                  ...x,
                  plan: {
                    ...x.plan,
                    planId: p.id,
                    carrier: p.carrier,
                    activationFee: p.activationFee,
                    firstMonthFree: p.billing === "prepaid_term" ? false : x.plan.firstMonthFree,
                  },
                }))
              }
            />
          </div>
          {planEntry?.billing === "prepaid_term" ? (
            <p className="mt-4 text-sm text-zinc-500">
              Prepaid promo: the one-time amount is included in &quot;due today&quot;. No monthly recurring from this plan.
            </p>
          ) : (
            <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={draft.plan.firstMonthFree}
                onChange={(e) =>
                  setDraft((x) => ({
                    ...x,
                    plan: { ...x.plan, firstMonthFree: e.target.checked },
                  }))
                }
              />
              First month free promo (waives first month of plan on due today)
            </label>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["insurance", "Insurance"],
                ["case", "Case"],
                ["charger", "Charger"],
                ["screenProtector", "Screen protector"],
              ] as const
            ).map(([k, lab]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.plan.addons[k]}
                  onChange={(e) =>
                    setDraft((x) => ({
                      ...x,
                      plan: {
                        ...x.plan,
                        addons: { ...x.plan.addons, [k]: e.target.checked },
                      },
                    }))
                  }
                />
                {lab}
              </label>
            ))}
          </div>
        </HubCard>
      )}

      {step === 4 && (
        <HubCard>
          <h3 className="text-lg font-semibold text-white">Step 4 — Quote summary</h3>
          <div className="mt-3 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-3">
            <p className="text-sm font-semibold text-fuchsia-100">Promo Codes</p>
            <p className="text-xs text-zinc-300">Active promos only. Manager-only promos are hidden from consultants.</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="text-xs text-zinc-300">
                Select active promo
                <select
                  className={`mt-1 ${hubInputClass}`}
                  value={draft.quote.promoCode ?? ""}
                  onChange={(e) => void applyPromoCode(e.target.value)}
                >
                  <option value="">No promo</option>
                  {activePromos.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-zinc-300">
                Number of lines in this sale
                <input
                  className={`mt-1 ${hubInputClass}`}
                  inputMode="numeric"
                  value={draft.quote.lineCount ?? 1}
                  onChange={(e) =>
                    setDraft((x) => ({
                      ...x,
                      quote: { ...x.quote, lineCount: Math.max(1, Number(e.target.value) || 1) },
                    }))
                  }
                />
              </label>
            </div>
            {profile.role === "admin" ? (
              <label className="mt-2 flex items-center gap-2 text-xs text-amber-200">
                <input type="checkbox" checked={promoOverride} onChange={(e) => setPromoOverride(e.target.checked)} />
                Admin override promo rules (warning confirmation equivalent)
              </label>
            ) : null}
            {promoSuggestions.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {promoSuggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="rounded-full border border-fuchsia-400/40 bg-fuchsia-400/10 px-2 py-1 text-xs text-fuchsia-100"
                    onClick={() => void applyPromoCode(p.code)}
                  >
                    Suggested: {p.code}
                  </button>
                ))}
              </div>
            ) : null}
            {selectedPromo?.expires_at ? (
              <p className="mt-2 text-xs text-amber-200">Offer timer: {promoCountdownLabel(selectedPromo.expires_at)}</p>
            ) : null}
            {promoMessage ? <p className="mt-2 text-xs text-red-300">{promoMessage}</p> : null}
          </div>
          <div className="mt-4 grid gap-2 text-sm text-zinc-300 md:grid-cols-2">
            <div className="rounded-xl bg-black/40 p-4 ring-1 ring-purple-500/20">
              <p>
                Plan:{" "}
                {planEntry
                  ? `${planEntry.name}${
                      planEntry.billing === "prepaid_term"
                        ? ` · ${formatCurrency(planEntry.prepaidTotal ?? 0)} prepaid`
                        : ` · ${formatCurrency(planEntry.monthly)}/mo`
                    }`
                  : "—"}
              </p>
              {planEntry?.billing === "prepaid_term" && planEntry.prepaidPromoNote ? (
                <p className="text-xs text-fuchsia-300/90">Promo: {planEntry.prepaidPromoNote}</p>
              ) : null}
              <p className="mt-2 text-zinc-400">Device: {formatCurrency(totals.devicePrice)}</p>
              <p>Plan charge (due today): {formatCurrency(totals.planChargeToday)}</p>
              <p>Monthly recurring (plan): {formatCurrency(totals.monthlyRecurring)}</p>
              <p>Activation: {formatCurrency(totals.activation)}</p>
              <p>Add-ons: {formatCurrency(totals.addonTotal)}</p>
              <p>Promo code: {draft.quote.promoCode || "—"}</p>
              <label className="mt-2 block text-xs text-zinc-500">
                Discount ($)
                <input
                  type="number"
                  className={`mt-1 ${hubInputClass}`}
                  value={draft.quote.discountAmount}
                  onChange={(e) =>
                    setDraft((x) => ({
                      ...x,
                      quote: { ...x.quote, discountAmount: Number(e.target.value) },
                    }))
                  }
                />
              </label>
              {selectedPromo ? (
                <p className="mt-1 text-xs text-fuchsia-200">
                  Rule: {selectedPromo.rule_text || "Promo selected"} {selectedPromo.allow_stacking ? "(stacking allowed)" : "(single promo only)"}
                </p>
              ) : null}
              <label className="mt-2 block text-xs text-zinc-500">
                Tax %
                <input
                  type="number"
                  className={`mt-1 ${hubInputClass}`}
                  value={draft.quote.taxPercent}
                  onChange={(e) =>
                    setDraft((x) => ({
                      ...x,
                      quote: { ...x.quote, taxPercent: Number(e.target.value) },
                    }))
                  }
                />
              </label>
            </div>
            <div className="rounded-xl bg-purple-950/30 p-4 ring-1 ring-purple-500/30">
              <p className="text-lg font-bold text-white">Due today: {formatCurrency(totals.dueToday)}</p>
              <p>Monthly recurring: {formatCurrency(totals.monthlyRecurring)}</p>
              <p className="text-emerald-400">Profit estimate: {formatCurrency(totals.profitEstimate)}</p>
              <div className="mt-3 rounded-lg border border-zinc-700/70 bg-black/30 p-3 text-xs text-zinc-300">
                <p>Original profit: {formatCurrency(grossProfitBeforePromo)}</p>
                <p>Discount applied: {formatCurrency(promoDiscount)}</p>
                <p className={netProfitAfterCommission < 0 ? "text-red-300" : "text-emerald-300"}>
                  Net profit after commission: {formatCurrency(netProfitAfterCommission)}
                </p>
              </div>
            </div>
          </div>
        </HubCard>
      )}

      {step === 5 && (
        <HubCard>
          <h3 className="text-lg font-semibold text-white">Step 5 — Agreement</h3>
          <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={draft.agreement.termsAccepted}
              onChange={(e) =>
                setDraft((x) => ({
                  ...x,
                  agreement: { ...x.agreement, termsAccepted: e.target.checked },
                }))
              }
            />
            Customer agrees to Magic Mobile terms &amp; carrier conditions.
          </label>
          <div className="mt-6 space-y-6">
            <SignaturePad
              label="Customer signature"
              onSave={(url) =>
                setDraft((x) => ({
                  ...x,
                  agreement: { ...x.agreement, customerSignatureDataUrl: url },
                }))
              }
            />
            <SignaturePad
              label="Sales rep signature"
              onSave={(url) =>
                setDraft((x) => ({
                  ...x,
                  agreement: { ...x.agreement, repSignatureDataUrl: url },
                }))
              }
            />
          </div>
          <p className="mt-4 text-xs text-zinc-600">PDF agreement export can be added via html2pdf or a server route.</p>
        </HubCard>
      )}

      {step === 6 && (
        <HubCard>
          <h3 className="text-lg font-semibold text-white">Step 6 — Activation checklist</h3>
          {(["imei", "sim", "eid", "carrier"] as const).map((field) => (
            <label key={field} className="mt-3 block text-sm">
              <span className="text-xs uppercase text-zinc-500">{field}</span>
              <input
                className={`mt-1 ${hubInputClass}`}
                value={draft.activation[field]}
                onChange={(e) =>
                  setDraft((x) => ({
                    ...x,
                    activation: { ...x.activation, [field]: e.target.value },
                  }))
                }
              />
            </label>
          ))}
          <div className="mt-4 space-y-2">
            {Object.entries(draft.activation.checklist).map(([k, v]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={v}
                  onChange={(e) =>
                    setDraft((x) => ({
                      ...x,
                      activation: {
                        ...x.activation,
                        checklist: {
                          ...x.activation.checklist,
                          [k]: e.target.checked,
                        },
                      },
                    }))
                  }
                />
                {k.replace(/([A-Z])/g, " $1")}
              </label>
            ))}
          </div>
        </HubCard>
      )}

      {step === 7 && (
        <HubCard>
          <h3 className="text-lg font-semibold text-white">Step 7 — Manager notes</h3>
          <p className="text-sm text-zinc-500">
            Unpaid commissions and new leads surface in{" "}
            <Link href="/magichub/queue" className="text-purple-400 hover:underline">
              Queue
            </Link>
            .
          </p>
          <textarea
            className={`mt-4 min-h-[100px] ${hubInputClass}`}
            placeholder="Manager notes"
            value={draft.managerNotes ?? ""}
            onChange={(e) => setDraft((x) => ({ ...x, managerNotes: e.target.value }))}
          />
        </HubCard>
      )}

      {step === 8 && (
        <HubCard>
          <h3 className="text-lg font-semibold text-white">Step 8 — Complete sale</h3>
          <div className="mt-4 rounded-xl bg-black/40 p-4 text-sm text-zinc-300 ring-1 ring-purple-500/20">
            <p>
              Estimated commission: <span className="font-semibold text-white">{formatCurrency(commEstimate)}</span>
            </p>
            <p>
              Discount line: <span className="font-semibold text-fuchsia-200">{formatCurrency(promoDiscount)}</span>
              {draft.quote.promoCode ? ` (${draft.quote.promoCode})` : ""}
            </p>
            <p>
              Net profit after commission:{" "}
              <span className={netProfitAfterCommission < 0 ? "font-semibold text-red-300" : "font-semibold text-emerald-300"}>
                {formatCurrency(netProfitAfterCommission)}
              </span>
            </p>
            <p className="text-xs text-zinc-500">Tracked in Commissions after you finish.</p>
          </div>
          {msg ? <p className="mt-3 text-sm text-red-400">{msg}</p> : null}
          <button
            type="button"
            className={`${hubBtnPrimary} mt-6 w-full`}
            disabled={finishing}
            onClick={() => void finalizeSale()}
          >
            {finishing ? "Saving…" : "Finish & record sale"}
          </button>
          {saleCompletedId ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" className={hubBtnGhost} disabled={idLinkSending} onClick={() => void sendIdUploadLink()}>
                {idLinkSending ? "Generating link..." : "Send ID Upload Link"}
              </button>
              <Link href="/magichub/dashboard" className={hubBtnPrimary}>
                Return to Dashboard
              </Link>
            </div>
          ) : null}
        </HubCard>
      )}
    </div>
  );
}
