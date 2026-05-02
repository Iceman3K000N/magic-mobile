import type { ProfileRecord } from "@/lib/magic-mobile";
import type { SaleRecord } from "@/lib/magichub";

export type PromoKind = "dollar_off" | "free_month" | "free_addon" | "multi_line";
export type PromoScope = "phone_bundle" | "plan" | "add_ons" | "plan_55_magic_max" | "multi_line";
export type PromoStatus = "draft" | "active" | "disabled";
export type PromoVisibility = "all" | "manager_admin";
export type PromoCustomerType = "all" | "first_time" | "returning";

export type PromoCodeRecord = {
  id: string;
  code: string;
  type: PromoKind;
  status: PromoStatus;
  amount_off: number | null;
  free_month: boolean | null;
  free_addon_case: boolean | null;
  applies_to: PromoScope;
  rule_text: string | null;
  starts_at: string | null;
  expires_at: string | null;
  usage_limit: number | null;
  usage_count: number | null;
  notes: string | null;
  admin_approval_required: boolean | null;
  manager_only: boolean | null;
  customer_type: PromoCustomerType | null;
  allow_stacking: boolean | null;
  max_stack_count: number | null;
  created_at: string;
  updated_at: string;
};

export type PromoDraft = Omit<PromoCodeRecord, "id" | "created_at" | "updated_at"> & { id?: string };

export type PromoValidationInput = {
  profile: ProfileRecord;
  sale: {
    includesPhone: boolean;
    includesPlan: boolean;
    addonCase: boolean;
    selectedPlanName: string;
    selectedPlanId: string | null;
    lineCount: number;
    phoneDigits: string;
    customerIsReturning: boolean;
    grossProfitBeforePromo: number;
    expectedCommission: number;
  };
  allowAdminOverride: boolean;
};

export type PromoValidationResult = {
  ok: boolean;
  reason?: string;
  discountAmount: number;
  addsFreeCase: boolean;
};

type PromoPreset = {
  code: string;
  type: PromoKind;
  amount_off: number | null;
  free_month: boolean;
  free_addon_case: boolean;
  applies_to: PromoScope;
  rule_text: string;
  admin_approval_required?: boolean;
  manager_only?: boolean;
  customer_type?: PromoCustomerType;
  allow_stacking?: boolean;
  max_stack_count?: number;
  notes?: string;
};

export const MAGIC_MOBILE_PROMO_PRESETS: PromoPreset[] = [
  {
    code: "MAGIC25",
    type: "dollar_off",
    amount_off: 25,
    free_month: false,
    free_addon_case: false,
    applies_to: "phone_bundle",
    rule_text: "Customer must purchase phone + plan",
  },
  {
    code: "FREEMONTH",
    type: "free_month",
    amount_off: 0,
    free_month: true,
    free_addon_case: false,
    applies_to: "plan",
    rule_text: "Admin approval required before applying",
    admin_approval_required: true,
  },
  {
    code: "FREECASE",
    type: "free_addon",
    amount_off: 0,
    free_month: false,
    free_addon_case: true,
    applies_to: "add_ons",
    rule_text: "Customer must purchase a phone",
  },
  {
    code: "UPGRADE55",
    type: "dollar_off",
    amount_off: 10,
    free_month: false,
    free_addon_case: false,
    applies_to: "plan_55_magic_max",
    rule_text: "Only works when selected plan = Magic Max $55",
  },
  {
    code: "FAMILY2",
    type: "multi_line",
    amount_off: 0,
    free_month: false,
    free_addon_case: false,
    applies_to: "multi_line",
    rule_text: "Must have at least 2 activated lines in same sale",
  },
];

export function defaultPromoDraft(): PromoDraft {
  return {
    code: "",
    type: "dollar_off",
    status: "draft",
    amount_off: 0,
    free_month: false,
    free_addon_case: false,
    applies_to: "plan",
    rule_text: "",
    starts_at: null,
    expires_at: null,
    usage_limit: null,
    usage_count: 0,
    notes: "",
    admin_approval_required: false,
    manager_only: false,
    customer_type: "all",
    allow_stacking: false,
    max_stack_count: 1,
  };
}

export function presetToPromoDraft(code: string): PromoDraft | null {
  const preset = MAGIC_MOBILE_PROMO_PRESETS.find((p) => p.code === code);
  if (!preset) return null;
  return {
    ...defaultPromoDraft(),
    ...preset,
    code: preset.code,
    status: "active",
    starts_at: new Date().toISOString(),
    usage_count: 0,
  };
}

export function promoVisibleToRole(promo: Pick<PromoCodeRecord, "manager_only">, role: ProfileRecord["role"]) {
  if (!promo.manager_only) return true;
  return role === "sale_manager" || role === "admin" || role === "store_lead";
}

export function promoIsActiveNow(promo: PromoCodeRecord) {
  if (promo.status !== "active") return false;
  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) return false;
  if (promo.expires_at && new Date(promo.expires_at).getTime() <= now) return false;
  if (promo.usage_limit != null && (promo.usage_count ?? 0) >= promo.usage_limit) return false;
  return true;
}

export function promoCountdownLabel(expiresAt: string | null | undefined) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return hrs > 0 ? `${hrs}h ${remMins}m left` : `${Math.max(1, remMins)}m left`;
}

export function suggestedPromos(rows: PromoCodeRecord[], context: { selectedPlanName: string; includesPhone: boolean }) {
  const planLower = context.selectedPlanName.toLowerCase();
  const out: PromoCodeRecord[] = [];
  for (const p of rows) {
    if (p.code === "UPGRADE55" && (planLower.includes("55") || planLower.includes("magic max"))) out.push(p);
    if (p.code === "FREECASE" && context.includesPhone) out.push(p);
  }
  return out;
}

export function validateAndScorePromo(promo: PromoCodeRecord, input: PromoValidationInput): PromoValidationResult {
  const sale = input.sale;
  const isAdmin = input.profile.role === "admin";
  const allowOverride = isAdmin && input.allowAdminOverride;

  if (promo.admin_approval_required && !allowOverride && !isAdmin) {
    return { ok: false, reason: "Admin approval required for this promo.", discountAmount: 0, addsFreeCase: false };
  }

  if (promo.customer_type === "first_time" && sale.customerIsReturning && !allowOverride) {
    return { ok: false, reason: "Promo is for first-time customers only.", discountAmount: 0, addsFreeCase: false };
  }
  if (promo.customer_type === "returning" && !sale.customerIsReturning && !allowOverride) {
    return { ok: false, reason: "Promo is for returning customers only.", discountAmount: 0, addsFreeCase: false };
  }

  if (promo.applies_to === "phone_bundle" && !(sale.includesPhone && sale.includesPlan) && !allowOverride) {
    return { ok: false, reason: "Requires phone + plan bundle.", discountAmount: 0, addsFreeCase: false };
  }
  if (promo.applies_to === "add_ons" && !sale.includesPhone && !allowOverride) {
    return { ok: false, reason: "Requires a phone purchase.", discountAmount: 0, addsFreeCase: false };
  }
  if (promo.applies_to === "plan_55_magic_max") {
    const plan = `${sale.selectedPlanName} ${sale.selectedPlanId ?? ""}`.toLowerCase();
    const ok = plan.includes("magic max") && plan.includes("55");
    if (!ok && !allowOverride) {
      return { ok: false, reason: "Only valid with Magic Max $55 plan.", discountAmount: 0, addsFreeCase: false };
    }
  }
  if (promo.applies_to === "multi_line" && sale.lineCount < 2 && !allowOverride) {
    return { ok: false, reason: "Requires at least 2 lines in same sale.", discountAmount: 0, addsFreeCase: false };
  }

  let discountAmount = Number(promo.amount_off ?? 0);
  const addsFreeCase = Boolean(promo.free_addon_case);
  if (promo.free_month) discountAmount = Math.max(discountAmount, 55);
  if (addsFreeCase) discountAmount = Math.max(discountAmount, 24);

  const projectedNet = Number((sale.grossProfitBeforePromo - discountAmount - sale.expectedCommission).toFixed(2));
  if (projectedNet < 0 && !allowOverride) {
    return { ok: false, reason: "Promo would push net profit below $0.", discountAmount, addsFreeCase };
  }

  return { ok: true, discountAmount, addsFreeCase };
}

export function aggregatePromoAnalytics(promos: PromoCodeRecord[], sales: SaleRecord[]) {
  const byCode = new Map<string, { usage: number; revenue: number; discount: number; netProfit: number }>();
  for (const promo of promos) byCode.set(promo.code, { usage: 0, revenue: 0, discount: 0, netProfit: 0 });
  for (const s of sales) {
    const code = (s.promo_code ?? "").trim();
    if (!code || !byCode.has(code)) continue;
    const row = byCode.get(code)!;
    const discount = Number(s.promo_discount_amount ?? 0);
    row.usage += 1;
    row.revenue += Number(s.total_sale ?? 0);
    row.discount += discount;
    row.netProfit += Number((Number(s.profit ?? 0) - discount - Number(s.commission_amount ?? 0)).toFixed(2));
  }
  return byCode;
}
