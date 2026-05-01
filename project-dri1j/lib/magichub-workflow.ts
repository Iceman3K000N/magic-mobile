import type { InventoryRecord } from "@/lib/magichub";
import {
  type PlanCatalogEntry,
  planChargeDueToday,
  planMonthlyRecurringAmount,
} from "@/lib/magichub-catalog";

/** POS workflow draft — persisted in session + hub_quotes.payload */
export interface SaleWorkflowDraft {
  step: number;
  customer: {
    fullName: string;
    phone: string;
    email: string;
    address: string;
    birthday: string;
    idType: string;
    notes: string;
    idDocumentDataUrl?: string;
  };
  deviceId: string | null;
  leadId: string | null;
  plan: {
    planId: string | null;
    carrier: string;
    activationFee: number;
    firstMonthFree: boolean;
    addons: {
      insurance: boolean;
      case: boolean;
      charger: boolean;
      screenProtector: boolean;
    };
    addonPrices: Record<string, number>;
  };
  quote: {
    discountAmount: number;
    taxPercent: number;
    promoCode?: string;
    promoDiscountAmount?: number;
    promoAppliedAt?: string;
    promoNotes?: string;
    lineCount?: number;
  };
  agreement: {
    termsAccepted: boolean;
    customerSignatureDataUrl?: string;
    repSignatureDataUrl?: string;
  };
  activation: {
    imei: string;
    sim: string;
    eid: string;
    carrier: string;
    checklist: Record<string, boolean>;
  };
  managerNotes?: string;
}

export function emptySaleDraft(): SaleWorkflowDraft {
  return {
    step: 1,
    customer: {
      fullName: "",
      phone: "",
      email: "",
      address: "",
      birthday: "",
      idType: "Driver License",
      notes: "",
    },
    deviceId: null,
    leadId: null,
    plan: {
      planId: null,
      carrier: "",
      activationFee: 0,
      firstMonthFree: false,
      addons: {
        insurance: false,
        case: false,
        charger: false,
        screenProtector: false,
      },
      addonPrices: {
        insurance: 12,
        case: 24,
        charger: 19,
        screenProtector: 29,
      },
    },
    quote: {
      discountAmount: 0,
      taxPercent: 6,
      promoCode: "",
      promoDiscountAmount: 0,
      promoAppliedAt: "",
      promoNotes: "",
      lineCount: 1,
    },
    agreement: {
      termsAccepted: false,
    },
    activation: {
      imei: "",
      sim: "",
      eid: "",
      carrier: "",
      checklist: {
        imeiEntered: false,
        simEntered: false,
        eidEntered: false,
        carrierSelected: false,
        customerPaid: false,
        activationSubmitted: false,
        serviceWorking: false,
        portCompleted: false,
      },
    },
  };
}

const DRAFT_KEY = "magic_hub_sale_draft_v2";

export function loadSessionDraft(): SaleWorkflowDraft {
  if (typeof sessionStorage === "undefined") return emptySaleDraft();
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return emptySaleDraft();
    return { ...emptySaleDraft(), ...JSON.parse(raw) } as SaleWorkflowDraft;
  } catch {
    return emptySaleDraft();
  }
}

export function saveSessionDraft(d: SaleWorkflowDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

export function clearSessionDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function computeWorkflowTotals(
  draft: SaleWorkflowDraft,
  device: InventoryRecord | undefined,
  plan: PlanCatalogEntry | undefined,
) {
  const devicePrice = device?.selling_price ?? 0;
  const planMrc = plan?.billing === "prepaid_term" ? 0 : (plan?.monthly ?? 0);
  const planChargeToday = planChargeDueToday(plan, draft.plan.firstMonthFree);
  const activation = draft.plan.activationFee || plan?.activationFee || 0;
  let addonTotal = 0;
  if (draft.plan.addons.insurance) addonTotal += draft.plan.addonPrices.insurance ?? 0;
  if (draft.plan.addons.case) addonTotal += draft.plan.addonPrices.case ?? 0;
  if (draft.plan.addons.charger) addonTotal += draft.plan.addonPrices.charger ?? 0;
  if (draft.plan.addons.screenProtector) addonTotal += draft.plan.addonPrices.screenProtector ?? 0;
  const subtotal = devicePrice + activation + addonTotal - draft.quote.discountAmount;
  const tax = subtotal * (draft.quote.taxPercent / 100);
  const dueToday = subtotal + tax + planChargeToday;
  const monthlyRecurring = planMonthlyRecurringAmount(plan);
  const profitEstimate =
    device != null ? Number((device.selling_price - device.cost - draft.quote.discountAmount * 0.5).toFixed(2)) : 0;
  return {
    devicePrice,
    planMonthly: planMrc,
    planChargeToday,
    activation,
    addonTotal,
    subtotal,
    tax,
    dueToday,
    monthlyRecurring,
    profitEstimate,
  };
}
