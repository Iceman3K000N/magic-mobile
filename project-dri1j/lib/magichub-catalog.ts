/** Default Magic Mobile service plans for MagicHub (Quote Builder, Start Sale, Plan Selector). */

export type PlanBilling = "monthly" | "prepaid_term";

export type PlanBadge = "best_value" | "promo" | "unlimited";

export type PlanCatalogEntry = {
  id: string;
  carrier: string;
  name: string;
  billing: PlanBilling;
  /** Monthly recurring charge (MRC). Use `0` for prepaid-only plans. */
  monthly: number;
  /** One-time prepaid total (e.g. 6-month promo). */
  prepaidTotal?: number;
  prepaidTermMonths?: number;
  prepaidPromoNote?: string;
  activationFee: number;
  simType: "SIM" | "eSIM" | "Either";
  highSpeedData: string;
  mobileHotspot: string;
  talkText: string;
  features: string[];
  badge?: PlanBadge;
  notes?: string;
};

export const MAGICHUB_PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: "mm-starter",
    carrier: "Magic Mobile",
    name: "Magic Starter",
    billing: "monthly",
    monthly: 25,
    activationFee: 0,
    simType: "Either",
    highSpeedData: "5GB",
    mobileHotspot: "5GB",
    talkText: "Unlimited",
    features: ["Unlimited Talk & Text Included"],
  },
  {
    id: "mm-plus",
    carrier: "Magic Mobile",
    name: "Magic Plus",
    billing: "monthly",
    monthly: 35,
    activationFee: 0,
    simType: "Either",
    highSpeedData: "30GB",
    mobileHotspot: "10GB",
    talkText: "Unlimited",
    features: ["Unlimited Talk & Text Included"],
  },
  {
    id: "mm-max",
    carrier: "Magic Mobile",
    name: "Magic Max",
    billing: "monthly",
    monthly: 55,
    activationFee: 0,
    simType: "Either",
    badge: "best_value",
    highSpeedData: "50GB",
    mobileHotspot: "15GB",
    talkText: "Unlimited",
    features: ["Unlimited Talk & Text Included", "Mexico & Canada Included"],
  },
  {
    id: "mm-6mo-promo",
    carrier: "Magic Mobile",
    name: "Magic 6-Month Promo",
    billing: "prepaid_term",
    monthly: 0,
    prepaidTotal: 250,
    prepaidTermMonths: 6,
    prepaidPromoNote: "Purchase 6 months and get 1 month free",
    activationFee: 0,
    simType: "Either",
    badge: "promo",
    highSpeedData: "50GB each month",
    mobileHotspot: "Per promo terms",
    talkText: "Unlimited",
    features: ["Unlimited Talk & Text Included", "6-month prepaid term"],
  },
  {
    id: "mm-unlimited",
    carrier: "Magic Mobile",
    name: "Magic Unlimited",
    billing: "monthly",
    monthly: 70,
    activationFee: 0,
    simType: "Either",
    badge: "unlimited",
    highSpeedData: "Unlimited 5G",
    mobileHotspot: "5GB high-speed hotspot",
    talkText: "Unlimited",
    features: ["Unlimited Talk/Text/5G Data Included", "No data overages"],
    notes: "No data overages; 5GB high-speed mobile hotspot then reduced speeds may apply.",
  },
];

export function getPlanById(id: string | null | undefined): PlanCatalogEntry | undefined {
  if (!id) return undefined;
  return MAGICHUB_PLAN_CATALOG.find((p) => p.id === id);
}

/** Amount billed toward “due today” from the plan (first month of MRC, or full prepaid). */
export function planChargeDueToday(plan: PlanCatalogEntry | undefined, firstMonthFree: boolean): number {
  if (!plan) return 0;
  if (plan.billing === "prepaid_term") return plan.prepaidTotal ?? 0;
  if (firstMonthFree) return 0;
  return plan.monthly;
}

/** Ongoing monthly charge after signup (0 for prepaid promo). */
export function planMonthlyRecurringAmount(plan: PlanCatalogEntry | undefined): number {
  if (!plan || plan.billing === "prepaid_term") return 0;
  return plan.monthly;
}

export function planLabelForSale(plan: PlanCatalogEntry | undefined): string {
  if (!plan) return "";
  return `${plan.carrier} ${plan.name}`;
}
