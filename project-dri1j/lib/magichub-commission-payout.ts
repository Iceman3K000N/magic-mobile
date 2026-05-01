import type { CommissionRecord } from "@/lib/magic-mobile";
import type { SaleRecord } from "@/lib/magichub";

/** Published plan payout schedule (MagicHub catalog defaults align with these). */
export const PLAN_PAYOUT_REFERENCE: {
  planLabel: string;
  priceNote: string;
  consultant: number;
  manager: number;
}[] = [
  { planLabel: "Magic Starter", priceNote: "$25/mo", consultant: 5, manager: 5 },
  { planLabel: "Magic Plus", priceNote: "$35/mo", consultant: 15, manager: 20 },
  { planLabel: "Magic Max", priceNote: "$55/mo", consultant: 25, manager: 20 },
  { planLabel: "Magic Unlimited", priceNote: "$70/mo", consultant: 30, manager: 20 },
  { planLabel: "Magic 6-Month Promo", priceNote: "$250 one-time", consultant: 60, manager: 25 },
];

/** Representative ranges per device tier (actual rows live in Admin pricing). */
export const PHONE_TIER_PAYOUT_REFERENCE: {
  tier: string;
  consultantRange: string;
  managerRange: string;
}[] = [
  { tier: "Budget", consultantRange: "$15 – $20", managerRange: "$10" },
  { tier: "Standard", consultantRange: "$25 – $30", managerRange: "$15 – $20" },
  { tier: "Premium", consultantRange: "$40 – $60", managerRange: "$25 – $35" },
  { tier: "Ultra / Fold", consultantRange: "$60 – $100", managerRange: "$35 – $60" },
];

/** No commission when any of these conditions apply (UI + logic helper). */
export const COMMISSION_PAYOUT_BLOCKERS = [
  "Sale not approved (rejected, refunded, canceled, or fraud flagged)",
  "Activation not completed (pending or failed)",
  "Payment not completed (pending, failed, or refunded)",
  "Phone marked returned",
] as const;

function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

/** Returns a human-readable blocker, or null if the sale would allow payout eligibility (subject to DB trigger). */
export function commissionPayoutBlockedReason(sale: Pick<
  SaleRecord,
  | "sale_status"
  | "activation_status"
  | "payment_status"
  | "phone_returned"
>): string | null {
  const st = norm(sale.sale_status);
  const act = norm(sale.activation_status);
  const pay = norm(sale.payment_status);
  if (sale.phone_returned === true) return "Phone returned — no commission.";
  if (["rejected", "refunded", "canceled", "cancelled", "fraudulent"].includes(st)) {
    return `Sale status (${sale.sale_status ?? "—"}) blocks payout.`;
  }
  if (st !== "approved") return "Sale must be approved before commission pays.";
  if (["failed", "pending"].includes(act) || act !== "completed") {
    return "Activation must be completed (not pending or failed).";
  }
  if (["failed", "pending", "refunded"].includes(pay) || pay !== "paid") {
    return "Payment must be paid (not pending, failed, or refunded).";
  }
  return null;
}

export function splitConsultantManagerFromSale(
  sale: SaleRecord | undefined,
  commissionAmount: number,
): { consultant: number; manager: number } {
  if (!sale) {
    const half = Number((commissionAmount / 2).toFixed(2));
    return { consultant: half, manager: Number((commissionAmount - half).toFixed(2)) };
  }
  const c = sale.consultant_payout_expected;
  const m = sale.manager_payout_expected;
  if (c != null && m != null) {
    return { consultant: Number(c), manager: Number(m) };
  }
  const half = Number((commissionAmount / 2).toFixed(2));
  return { consultant: half, manager: Number((commissionAmount - half).toFixed(2)) };
}

export type CommissionPayoutDashboardMetrics = {
  /** Unpaid commission dollars still ineligible (gates not met). */
  pendingPayout: number;
  /** Unpaid commission dollars eligible to pay. */
  approvedPayout: number;
  /** Paid commission dollars. */
  paidPayout: number;
  /** Consultant share for eligible unpaid + paid (ready / settled). */
  consultantPayoutTotal: number;
  /** Manager share for eligible unpaid + paid. */
  managerPayoutTotal: number;
  /** Gross profit today minus paid commission dollars (same window as dashboard profit). */
  netProfitAfterPayoutToday: number;
};

export function aggregateCommissionPayoutDashboard(
  salesTodayProfit: number,
  sales: SaleRecord[],
  commissions: CommissionRecord[],
): CommissionPayoutDashboardMetrics {
  const saleById = new Map(sales.map((s) => [s.id, s]));

  let pendingPayout = 0;
  let approvedPayout = 0;
  let paidPayout = 0;
  let consultantApprovedAndPaid = 0;
  let managerApprovedAndPaid = 0;
  let paidOnlyTotal = 0;

  for (const c of commissions) {
    const amt = Number(c.amount);
    const sale = c.sale_id ? saleById.get(c.sale_id) : undefined;
    const sp = splitConsultantManagerFromSale(sale, amt);

    if (c.paid) {
      paidPayout += amt;
      paidOnlyTotal += amt;
      consultantApprovedAndPaid += sp.consultant;
      managerApprovedAndPaid += sp.manager;
    } else if (c.payout_eligible === true) {
      approvedPayout += amt;
      consultantApprovedAndPaid += sp.consultant;
      managerApprovedAndPaid += sp.manager;
    } else {
      pendingPayout += amt;
    }
  }

  return {
    pendingPayout,
    approvedPayout,
    paidPayout,
    consultantPayoutTotal: Number(consultantApprovedAndPaid.toFixed(2)),
    managerPayoutTotal: Number(managerApprovedAndPaid.toFixed(2)),
    netProfitAfterPayoutToday: Number((salesTodayProfit - paidOnlyTotal).toFixed(2)),
  };
}
