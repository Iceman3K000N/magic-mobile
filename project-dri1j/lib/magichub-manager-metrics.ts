import { splitConsultantManagerFromSale, type CommissionPayoutDashboardMetrics } from "@/lib/magichub-commission-payout";
import type { CommissionRecord, ProfileRecord } from "@/lib/magic-mobile";
import type { SaleRecord } from "@/lib/magichub";
import { startOfLocalDayIso } from "@/lib/magichub";

export function teamProfileIdsForManager(
  managerId: string,
  contractors: ProfileRecord[],
  requests: { linked_profile_id: string | null; status: string }[],
): Set<string> {
  const ids = new Set<string>();
  for (const c of contractors) {
    if (c.role === "contractor" && c.team_manager_id === managerId) ids.add(c.id);
  }
  for (const r of requests) {
    if (r.status === "active" && r.linked_profile_id) ids.add(r.linked_profile_id);
  }
  return ids;
}

export function filterSalesForTeam(sales: SaleRecord[], teamIds: Set<string>, managerId: string): SaleRecord[] {
  return sales.filter((s) => teamIds.has(s.contractor_id) || s.contractor_id === managerId);
}

export type ManagerDashMetrics = {
  salesToday: number;
  phonesSoldToday: number;
  plansSoldToday: number;
  teamRevenueToday: number;
  pendingSales: number;
  activationsInProgress: number;
  approvedSales: number;
  rejectedSales: number;
  teamCommission: number;
  managerOverride: number;
  pendingPayouts: number;
  topSellerName: string;
  consultantStats: { id: string; name: string; salesCount: number; revenue: number; phones: number; plans: number }[];
};

export function computeManagerDashboardMetrics(
  sales: SaleRecord[],
  commissions: CommissionRecord[],
  contractors: ProfileRecord[],
  managerProfileId: string,
  teamRequests: { linked_profile_id: string | null; status: string }[],
  payoutMetrics: CommissionPayoutDashboardMetrics,
): ManagerDashMetrics {
  const todayIso = startOfLocalDayIso();
  const teamIds = teamProfileIdsForManager(managerProfileId, contractors, teamRequests);
  const salesTodayRows = sales.filter((s) => new Date(s.created_at) >= new Date(todayIso));
  const teamSalesToday = filterSalesForTeam(salesTodayRows, teamIds, managerProfileId);
  const scopeSales = filterSalesForTeam(sales, teamIds, managerProfileId);

  const countByConsultant: Record<string, number> = {};
  const revenueByConsultant: Record<string, number> = {};
  const phonesByConsultant: Record<string, number> = {};
  const plansByConsultant: Record<string, number> = {};
  for (const s of teamSalesToday) {
    const cid = s.contractor_id;
    countByConsultant[cid] = (countByConsultant[cid] ?? 0) + 1;
    revenueByConsultant[cid] = (revenueByConsultant[cid] ?? 0) + Number(s.total_sale);
    if (s.includes_phone) phonesByConsultant[cid] = (phonesByConsultant[cid] ?? 0) + 1;
    if (s.includes_plan) plansByConsultant[cid] = (plansByConsultant[cid] ?? 0) + 1;
  }

  let teamCommission = 0;
  let managerOverride = 0;
  const saleById = new Map(scopeSales.map((s) => [s.id, s]));
  for (const c of commissions) {
    if (!c.sale_id) continue;
    const sale = saleById.get(c.sale_id);
    if (!sale) continue;
    const split = splitConsultantManagerFromSale(sale, Number(c.amount));
    teamCommission += split.consultant;
    managerOverride += split.manager;
  }

  const consultantStats = Array.from(teamIds)
    .map((id) => ({
      id,
      name: contractors.find((c) => c.id === id)?.full_name ?? id.slice(0, 8),
      salesCount: countByConsultant[id] ?? 0,
      revenue: revenueByConsultant[id] ?? 0,
      phones: phonesByConsultant[id] ?? 0,
      plans: plansByConsultant[id] ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    salesToday: teamSalesToday.length,
    phonesSoldToday: teamSalesToday.filter((s) => s.includes_phone).length,
    plansSoldToday: teamSalesToday.filter((s) => s.includes_plan).length,
    teamRevenueToday: teamSalesToday.reduce((a, s) => a + Number(s.total_sale), 0),
    pendingSales: scopeSales.filter((s) => (s.sale_status ?? "").toLowerCase() === "pending_approval").length,
    activationsInProgress: scopeSales.filter((s) => (s.activation_status ?? "").toLowerCase() === "pending").length,
    approvedSales: scopeSales.filter((s) => (s.sale_status ?? "").toLowerCase() === "approved").length,
    rejectedSales: scopeSales.filter((s) => ["rejected", "fraudulent"].includes((s.sale_status ?? "").toLowerCase())).length,
    teamCommission,
    managerOverride,
    pendingPayouts: payoutMetrics.pendingPayout,
    topSellerName: consultantStats[0]?.name ?? "—",
    consultantStats,
  };
}
