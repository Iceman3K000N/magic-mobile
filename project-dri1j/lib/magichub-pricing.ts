import type { SupabaseClient } from "@supabase/supabase-js";
import { MAGICHUB_PLAN_CATALOG } from "@/lib/magichub-catalog";

export type DeviceCategory = "Budget" | "Standard" | "Premium" | "Ultra" | "Foldable" | "Special Order";
export type DeviceAvailability = "In Stock" | "Special Order" | "Not Available";

export type PhonePricingEntry = {
  id: string;
  brand: "Apple" | "Samsung" | "Motorola" | "Google Pixel";
  series: string;
  model: string;
  category: DeviceCategory;
  buyPriceLow: number;
  buyPriceHigh: number;
  sellPriceLow: number;
  sellPriceHigh: number;
  estimatedProfitLow: number;
  estimatedProfitHigh: number;
  consultantPayout: number;
  managerPayout: number;
  status: DeviceAvailability;
};

export type PlanPricingEntry = {
  id: string;
  name: string;
  priceMonthly: number;
  oneTimePrice?: number;
  termMonths?: number;
  highSpeedData: string;
  hotspot: string;
  talkText: string;
  features: string[];
  consultantPayout: number;
  managerPayout: number;
  badge?: "Best Value" | "Promo" | "Unlimited";
};

export type PricingSettings = {
  activationFee: number;
  addons: {
    casePrice: number;
    chargerPrice: number;
    screenProtectorPrice: number;
  };
};

export type PricingOverrides = {
  phoneRows: PhonePricingEntry[];
  planRows: PlanPricingEntry[];
  settings: PricingSettings;
};

/** Values align with `sales` row text stored by Postgres (lowercase / snake_case). */
export type SaleLifecycle = {
  saleStatus: string;
  activationStatus: string;
  paymentStatus: string;
  bundledWithService: boolean;
  phoneReturned: boolean;
};

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  activationFee: 25,
  addons: {
    casePrice: 25,
    chargerPrice: 30,
    screenProtectorPrice: 20,
  },
};

export function defaultPricingOverrides(): PricingOverrides {
  return {
    phoneRows: DEFAULT_PHONE_PRICING_CATALOG,
    planRows: DEFAULT_PLAN_PRICING_CATALOG,
    settings: DEFAULT_PRICING_SETTINGS,
  };
}

function phone(
  id: string,
  brand: PhonePricingEntry["brand"],
  series: string,
  model: string,
  category: DeviceCategory,
  buyLow: number,
  buyHigh: number,
  sellLow: number,
  sellHigh: number,
  consultantPayout: number,
  managerPayout: number,
  status: DeviceAvailability = "In Stock",
): PhonePricingEntry {
  return {
    id,
    brand,
    series,
    model,
    category,
    buyPriceLow: buyLow,
    buyPriceHigh: buyHigh,
    sellPriceLow: sellLow,
    sellPriceHigh: sellHigh,
    estimatedProfitLow: sellLow - buyHigh,
    estimatedProfitHigh: sellHigh - buyLow,
    consultantPayout,
    managerPayout,
    status,
  };
}

export const DEFAULT_PHONE_PRICING_CATALOG: PhonePricingEntry[] = [
  phone("iphone-xr", "Apple", "iPhone", "iPhone XR", "Budget", 120, 170, 220, 290, 20, 10),
  phone("iphone-11", "Apple", "iPhone", "iPhone 11", "Standard", 150, 220, 280, 360, 20, 10),
  phone("iphone-11-pro-max", "Apple", "iPhone", "iPhone 11 Pro Max", "Premium", 220, 320, 420, 560, 25, 15),
  phone("iphone-12", "Apple", "iPhone", "iPhone 12", "Standard", 220, 300, 420, 560, 25, 15),
  phone("iphone-13", "Apple", "iPhone", "iPhone 13", "Premium", 280, 380, 520, 680, 25, 15),
  phone("iphone-14", "Apple", "iPhone 14", "iPhone 14", "Premium", 380, 480, 650, 820, 30, 20),
  phone("iphone-14-plus", "Apple", "iPhone 14", "iPhone 14 Plus", "Premium", 420, 540, 720, 900, 30, 20),
  phone("iphone-14-pro", "Apple", "iPhone 14", "iPhone 14 Pro", "Ultra", 520, 700, 900, 1180, 35, 20),
  phone("iphone-14-pro-max", "Apple", "iPhone 14", "iPhone 14 Pro Max", "Ultra", 600, 820, 1050, 1390, 35, 20),
  phone("iphone-15", "Apple", "iPhone 15", "iPhone 15", "Premium", 540, 690, 900, 1150, 35, 20),
  phone("iphone-15-plus", "Apple", "iPhone 15", "iPhone 15 Plus", "Premium", 590, 760, 980, 1240, 35, 20),
  phone("iphone-15-pro", "Apple", "iPhone 15", "iPhone 15 Pro", "Ultra", 700, 900, 1150, 1480, 40, 25),
  phone("iphone-15-pro-max", "Apple", "iPhone 15", "iPhone 15 Pro Max", "Ultra", 820, 1050, 1320, 1700, 40, 25),
  phone("iphone-16", "Apple", "iPhone 16", "iPhone 16", "Premium", 680, 860, 1080, 1360, 40, 25),
  phone("iphone-16-plus", "Apple", "iPhone 16", "iPhone 16 Plus", "Premium", 740, 940, 1180, 1480, 40, 25),
  phone("iphone-16-pro", "Apple", "iPhone 16", "iPhone 16 Pro", "Ultra", 900, 1150, 1400, 1780, 45, 25),
  phone("iphone-16-pro-max", "Apple", "iPhone 16", "iPhone 16 Pro Max", "Ultra", 980, 1280, 1550, 1980, 45, 25),
  phone("iphone-17", "Apple", "iPhone 17", "iPhone 17", "Premium", 760, 960, 1200, 1520, 45, 25, "Special Order"),
  phone("iphone-17-plus", "Apple", "iPhone 17", "iPhone 17 Plus", "Premium", 840, 1060, 1320, 1650, 45, 25, "Special Order"),
  phone("iphone-17-pro", "Apple", "iPhone 17", "iPhone 17 Pro", "Ultra", 1040, 1320, 1620, 2060, 50, 30, "Special Order"),
  phone("iphone-17-pro-max", "Apple", "iPhone 17", "iPhone 17 Pro Max", "Ultra", 1140, 1460, 1780, 2280, 50, 30, "Special Order"),
  phone("galaxy-s20", "Samsung", "Galaxy S", "Galaxy S20", "Standard", 150, 230, 300, 420, 20, 10),
  phone("galaxy-s21", "Samsung", "Galaxy S", "Galaxy S21", "Standard", 190, 280, 360, 520, 20, 10),
  phone("galaxy-s22", "Samsung", "Galaxy S", "Galaxy S22", "Premium", 280, 390, 520, 710, 25, 15),
  phone("galaxy-s23", "Samsung", "Galaxy S", "Galaxy S23", "Premium", 390, 520, 680, 920, 30, 20),
  phone("galaxy-s21-ultra", "Samsung", "Galaxy S Ultra", "Galaxy S21 Ultra", "Ultra", 360, 500, 650, 900, 30, 20),
  phone("galaxy-s22-ultra", "Samsung", "Galaxy S Ultra", "Galaxy S22 Ultra", "Ultra", 520, 700, 900, 1250, 35, 20),
  phone("galaxy-s23-ultra", "Samsung", "Galaxy S Ultra", "Galaxy S23 Ultra", "Ultra", 620, 860, 1080, 1520, 35, 20),
  phone("galaxy-s24-ultra", "Samsung", "Galaxy S Ultra", "Galaxy S24 Ultra", "Ultra", 860, 1120, 1450, 1960, 40, 25),
  phone("galaxy-z-flip-3", "Samsung", "Galaxy Z Flip", "Galaxy Z Flip 3", "Foldable", 280, 420, 580, 860, 30, 20),
  phone("galaxy-z-flip-4", "Samsung", "Galaxy Z Flip", "Galaxy Z Flip 4", "Foldable", 360, 540, 720, 1060, 30, 20),
  phone("galaxy-z-flip-5", "Samsung", "Galaxy Z Flip", "Galaxy Z Flip 5", "Foldable", 500, 740, 960, 1390, 35, 20),
  phone("galaxy-z-fold-3", "Samsung", "Galaxy Z Fold", "Galaxy Z Fold 3", "Foldable", 520, 760, 980, 1480, 35, 20),
  phone("galaxy-z-fold-4", "Samsung", "Galaxy Z Fold", "Galaxy Z Fold 4", "Foldable", 700, 980, 1300, 1820, 40, 25),
  phone("galaxy-z-fold-5", "Samsung", "Galaxy Z Fold", "Galaxy Z Fold 5", "Foldable", 900, 1280, 1560, 2190, 45, 30),
  phone("moto-g-power", "Motorola", "Moto G", "Moto G Power", "Budget", 90, 140, 190, 280, 15, 10),
  phone("moto-g-stylus-5g", "Motorola", "Moto G", "Moto G Stylus 5G", "Standard", 160, 240, 320, 470, 20, 10),
  phone("motorola-edge-2023-2024", "Motorola", "Motorola Edge", "Motorola Edge 2023/2024", "Standard", 220, 340, 430, 640, 20, 10),
  phone("motorola-razr-foldable", "Motorola", "Motorola Razr", "Motorola Razr Foldable", "Foldable", 420, 680, 880, 1320, 30, 20),
  phone("pixel-6", "Google Pixel", "Pixel", "Pixel 6", "Standard", 180, 270, 340, 510, 20, 10),
  phone("pixel-6a", "Google Pixel", "Pixel", "Pixel 6a", "Budget", 130, 220, 260, 420, 15, 10),
  phone("pixel-7", "Google Pixel", "Pixel", "Pixel 7", "Premium", 260, 380, 500, 720, 25, 15),
];

export const DEFAULT_PLAN_PRICING_CATALOG: PlanPricingEntry[] = [
  {
    id: "mm-starter",
    name: "Magic Starter",
    priceMonthly: 25,
    highSpeedData: "5GB",
    hotspot: "5GB",
    talkText: "Unlimited",
    consultantPayout: 5,
    managerPayout: 5,
    features: ["Unlimited Talk & Text Included"],
  },
  {
    id: "mm-plus",
    name: "Magic Plus",
    priceMonthly: 35,
    highSpeedData: "30GB",
    hotspot: "10GB",
    talkText: "Unlimited",
    consultantPayout: 15,
    managerPayout: 20,
    features: ["Unlimited Talk & Text Included"],
  },
  {
    id: "mm-max",
    name: "Magic Max",
    priceMonthly: 55,
    highSpeedData: "50GB",
    hotspot: "15GB",
    talkText: "Unlimited",
    consultantPayout: 25,
    managerPayout: 20,
    features: ["Unlimited Talk & Text Included", "Mexico & Canada Included"],
    badge: "Best Value",
  },
  {
    id: "mm-6mo-promo",
    name: "Magic 6-Month Promo",
    priceMonthly: 0,
    oneTimePrice: 250,
    termMonths: 6,
    highSpeedData: "50GB each month",
    hotspot: "Per promo terms",
    talkText: "Unlimited",
    consultantPayout: 60,
    managerPayout: 25,
    features: ["Purchase 6 months and get 1 month free"],
    badge: "Promo",
  },
  {
    id: "mm-unlimited",
    name: "Magic Unlimited",
    priceMonthly: 70,
    highSpeedData: "Unlimited 5G",
    hotspot: "5GB high-speed hotspot",
    talkText: "Unlimited",
    consultantPayout: 30,
    managerPayout: 20,
    features: ["Unlimited talk, text, and 5G data", "No data overages"],
    badge: "Unlimited",
  },
];

export function planPayout(planId: string | null | undefined) {
  const p = DEFAULT_PLAN_PRICING_CATALOG.find((x) => x.id === planId);
  return { consultant: p?.consultantPayout ?? 0, manager: p?.managerPayout ?? 0 };
}

export function phonePayout(phoneId: string | null | undefined) {
  const p = DEFAULT_PHONE_PRICING_CATALOG.find((x) => x.id === phoneId);
  return { consultant: p?.consultantPayout ?? 0, manager: p?.managerPayout ?? 0 };
}

export function canTriggerPayouts(life: SaleLifecycle): boolean {
  const sale = (life.saleStatus ?? "").trim().toLowerCase();
  const act = (life.activationStatus ?? "").trim().toLowerCase();
  const pay = (life.paymentStatus ?? "").trim().toLowerCase();
  const saleBlocked =
    sale === "rejected" ||
    sale === "refunded" ||
    sale === "canceled" ||
    sale === "cancelled" ||
    sale === "fraudulent";
  if (saleBlocked) return false;
  if (sale !== "approved") return false;
  if (act !== "completed") return false;
  if (pay !== "paid") return false;
  if (life.phoneReturned) return false;
  return true;
}

export function computeQuotePricing(input: {
  phoneSellPrice: number;
  phoneBuyPrice: number;
  planChargeToday: number;
  planMonthlyRecurring: number;
  activationFee: number;
  casePrice: number;
  chargerPrice: number;
  screenProtectorPrice: number;
  discount: number;
  taxPercent: number;
  consultantPayout: number;
  managerPayout: number;
}) {
  const subTotalBeforeTax = Math.max(
    0,
    input.phoneSellPrice +
      input.planChargeToday +
      input.activationFee +
      input.casePrice +
      input.chargerPrice +
      input.screenProtectorPrice -
      input.discount,
  );
  const taxes = Number((subTotalBeforeTax * (input.taxPercent / 100)).toFixed(2));
  const totalDueToday = Number((subTotalBeforeTax + taxes).toFixed(2));
  const monthlyRecurringTotal = Number(input.planMonthlyRecurring.toFixed(2));
  const grossProfit = Number(
    (
      (input.phoneSellPrice - input.phoneBuyPrice) +
      input.planChargeToday +
      input.activationFee +
      input.casePrice +
      input.chargerPrice +
      input.screenProtectorPrice -
      input.discount
    ).toFixed(2),
  );
  const totalPayout = Number((input.consultantPayout + input.managerPayout).toFixed(2));
  const netProfitAfterPayout = Number((grossProfit - totalPayout).toFixed(2));
  return {
    taxableSubtotalBeforeTax: subTotalBeforeTax,
    totalDueToday,
    monthlyRecurringTotal,
    grossProfit,
    consultantPayout: input.consultantPayout,
    managerPayout: input.managerPayout,
    netProfitAfterPayout,
    taxes,
  };
}

/** Match inventory `phone_model` to a catalog row (substring match). */
export function matchPhoneCatalogEntry(model: string, phoneRows: PhonePricingEntry[]): PhonePricingEntry | undefined {
  const m = model.trim().toLowerCase();
  if (!m) return undefined;
  return phoneRows.find((r) => {
    const rm = r.model.toLowerCase();
    return m.includes(rm) || rm.includes(m) || m.includes(r.id.replace(/-/g, " "));
  });
}

export function mergePricingPayload(payload: unknown): PricingOverrides {
  const defaults = defaultPricingOverrides();
  if (!payload || typeof payload !== "object") return defaults;
  const p = payload as Partial<PricingOverrides>;
  return {
    phoneRows: Array.isArray(p.phoneRows) && p.phoneRows.length > 0 ? p.phoneRows : defaults.phoneRows,
    planRows: Array.isArray(p.planRows) && p.planRows.length > 0 ? p.planRows : defaults.planRows,
    settings: p.settings ?? defaults.settings,
  };
}

export function mapPlanCatalogToPricing() {
  return MAGICHUB_PLAN_CATALOG.map((p) => ({
    id: p.id,
    name: p.name,
    priceMonthly: p.monthly,
    oneTimePrice: p.prepaidTotal,
  }));
}

export function readPricingOverridesFromStorage(): PricingOverrides {
  if (typeof window === "undefined") return defaultPricingOverrides();
  try {
    const raw = localStorage.getItem("magichub_pricing_overrides_v1");
    if (!raw) return defaultPricingOverrides();
    const parsed = JSON.parse(raw) as Partial<PricingOverrides>;
    return {
      phoneRows:
        Array.isArray(parsed.phoneRows) && parsed.phoneRows.length > 0 ? parsed.phoneRows : DEFAULT_PHONE_PRICING_CATALOG,
      planRows:
        Array.isArray(parsed.planRows) && parsed.planRows.length > 0 ? parsed.planRows : DEFAULT_PLAN_PRICING_CATALOG,
      settings: parsed.settings ?? DEFAULT_PRICING_SETTINGS,
    };
  } catch {
    return defaultPricingOverrides();
  }
}

export function savePricingOverridesToStorage(next: PricingOverrides) {
  if (typeof window === "undefined") return;
  localStorage.setItem("magichub_pricing_overrides_v1", JSON.stringify(next));
}

/** Load org-wide pricing from Supabase (`hub_pricing_config`). Caller merges with local cache on success. */
export async function fetchPricingOverridesFromSupabase(supabase: SupabaseClient): Promise<PricingOverrides | null> {
  const { data, error } = await supabase.from("hub_pricing_config").select("payload").eq("id", "default").maybeSingle();
  if (error || data == null || typeof data !== "object") return null;
  const payload = (data as { payload?: unknown }).payload;
  return mergePricingPayload(payload);
}

export function planPayoutFromRows(planId: string | null | undefined, planRows: PlanPricingEntry[]) {
  const p = planRows.find((x) => x.id === planId);
  return { consultant: p?.consultantPayout ?? 0, manager: p?.managerPayout ?? 0 };
}
