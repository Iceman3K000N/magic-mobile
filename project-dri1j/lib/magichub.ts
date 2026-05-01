import { calculateCommission, COMMISSION_RULES } from "@/lib/magic-mobile";

export type InventoryStatus = "Available" | "Sold";

export interface InventoryRecord {
  id: string;
  phone_model: string;
  cost: number;
  selling_price: number;
  status: InventoryStatus;
  imei?: string | null;
  serial_number?: string | null;
  created_at: string;
}

export interface SaleRecord {
  id: string;
  contractor_id: string;
  lead_id: string | null;
  inventory_id: string | null;
  customer_name: string;
  customer_phone: string;
  plan_name: string;
  accessory_amount: number;
  phone_price: number;
  inventory_cost: number;
  total_sale: number;
  profit: number;
  commission_amount: number;
  includes_phone: boolean;
  includes_plan: boolean;
  created_at: string;
  /** Present after hub lifecycle migration (magichub_go_live.sql). */
  sale_status?: string | null;
  activation_status?: string | null;
  payment_status?: string | null;
  risk_flag?: string | null;
  commission_hold_until?: string | null;
  phone_returned?: boolean | null;
  bundled_with_service?: boolean | null;
  consultant_payout_expected?: number | null;
  manager_payout_expected?: number | null;
  tax_rate_percent?: number | null;
  taxable_subtotal_snapshot?: number | null;
  total_tax_snapshot?: number | null;
  created_by_role?: "Consultant" | "Manager" | null;
  promo_code?: string | null;
  promo_discount_amount?: number | null;
  promo_stack_count?: number | null;
  promo_override_used?: boolean | null;
  promo_applied_at?: string | null;
  id_verification_status?: "not_sent" | "waiting" | "uploaded" | "verified" | null;
  id_upload_sent_at?: string | null;
  id_uploaded_at?: string | null;
  id_verified_at?: string | null;
}

export function inventoryProfit(row: Pick<InventoryRecord, "selling_price" | "cost">) {
  return Number((row.selling_price - row.cost).toFixed(2));
}

export function previewSaleTotals(input: {
  sellingPrice: number;
  inventoryCost: number;
  accessoryAmount: number;
  includesPhone: boolean;
  includesPlan: boolean;
}) {
  const acc = input.accessoryAmount || 0;
  const total_sale = Number((input.sellingPrice + acc).toFixed(2));
  const profit = Number((total_sale - input.inventoryCost).toFixed(2));
  const commission_amount = calculateCommission({
    includesPhone: input.includesPhone,
    includesPlan: input.includesPlan,
    accessoryAmount: acc,
  });
  return { total_sale, profit, commission_amount, COMMISSION_RULES };
}

/** Same as sale RPC: phone + accessories + plan charge due today (first month or prepaid). */
export function previewSaleTotalsWithPlan(input: {
  sellingPrice: number;
  inventoryCost: number;
  accessoryAmount: number;
  planChargeToday: number;
  includesPhone: boolean;
  includesPlan: boolean;
}) {
  const acc = input.accessoryAmount || 0;
  const plan = Math.max(0, input.planChargeToday || 0);
  const total_sale = Number((input.sellingPrice + acc + plan).toFixed(2));
  const profit = Number((total_sale - input.inventoryCost).toFixed(2));
  const commission_amount = calculateCommission({
    includesPhone: input.includesPhone,
    includesPlan: input.includesPlan,
    accessoryAmount: acc,
  });
  return { total_sale, profit, commission_amount, COMMISSION_RULES };
}

/** Aligns POS preview with catalog consultant + manager payouts (same source as `create_magichub_sale`). */
export function previewSaleTotalsWithCatalogPayouts(input: {
  sellingPrice: number;
  inventoryCost: number;
  accessoryAmount: number;
  planChargeToday: number;
  consultantPayout: number;
  managerPayout: number;
}) {
  const acc = input.accessoryAmount || 0;
  const plan = Math.max(0, input.planChargeToday || 0);
  const total_sale = Number((input.sellingPrice + acc + plan).toFixed(2));
  const profit = Number((total_sale - input.inventoryCost).toFixed(2));
  const commission_amount = Number((input.consultantPayout + input.managerPayout).toFixed(2));
  return { total_sale, profit, commission_amount };
}

export function startOfLocalDayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
