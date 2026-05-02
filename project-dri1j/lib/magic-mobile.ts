export type UserRole = "admin" | "sale_manager" | "contractor" | "store_lead";

export type LeadStatus = "New" | "Contacted" | "Closed" | "Lost";

export interface ProfileRecord {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  referral_code: string | null;
  created_at: string;
  team_manager_id?: string | null;
}

export interface LeadRecord {
  id: string;
  contractor_id: string;
  customer_name: string;
  customer_phone: string;
  customer_wants: "Phone" | "Plan" | "Phone + Plan" | "Accessories";
  /** Free-form intake (MagicHub); optional until column exists in DB */
  what_they_want?: string | null;
  current_carrier: string | null;
  budget: string | null;
  notes: string | null;
  status: LeadStatus;
  phone_sold: string | null;
  plan_sold: string | null;
  accessory_amount: number | null;
  total_sale_amount: number | null;
  commission_amount: number | null;
  commission_paid: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
}

export interface CommissionRecord {
  id: string;
  contractor_id: string;
  lead_id: string | null;
  sale_id?: string | null;
  amount: number;
  type: string;
  paid: boolean;
  created_at: string;
  paid_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  /** After hub migration: true when sale is approved, activation completed, paid, and phone not returned. */
  payout_eligible?: boolean | null;
  payout_method?: "cash_app" | "mercury_bank" | null;
  payout_date?: string | null;
  payout_reference?: string | null;
  paid_by?: string | null;
}

export interface TrainingRecord {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface AdminAuditLogRecord {
  id: string;
  actor_id: string;
  action: string;
  target_table: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export const COMMISSION_RULES = {
  phoneSale: 50,
  planActivation: 15,
  accessoriesRate: 0.1,
  weeklyBonusThreshold: 10,
  weeklyBonusAmount: 100,
};

export function calculateCommission(input: {
  includesPhone: boolean;
  includesPlan: boolean;
  accessoryAmount: number;
}) {
  let total = 0;

  if (input.includesPhone) total += COMMISSION_RULES.phoneSale;
  if (input.includesPlan) total += COMMISSION_RULES.planActivation;
  if (input.accessoryAmount > 0) total += input.accessoryAmount * COMMISSION_RULES.accessoriesRate;

  return Number(total.toFixed(2));
}

export function formatCurrency(value: number | null | undefined) {
  const amount = value ?? 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}
