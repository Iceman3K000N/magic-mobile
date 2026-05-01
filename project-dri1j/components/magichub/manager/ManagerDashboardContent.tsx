"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommissionRecord, LeadRecord, ProfileRecord } from "@/lib/magic-mobile";
import type { SaleRecord } from "@/lib/magichub";
import { ManagerDashboard } from "@/components/magichub/manager/dashboard/ManagerDashboard";
import type { TeamRow } from "@/components/magichub/manager/dashboard/TeamPerformanceTable";

export function ManagerDashboardContent({
  managerId,
  sales,
  leads,
  contractors,
}: {
  supabase: SupabaseClient;
  managerId: string;
  sales: SaleRecord[];
  commissions: CommissionRecord[];
  leads: LeadRecord[];
  contractors: ProfileRecord[];
  teamRequests: { linked_profile_id: string | null; status: string }[];
  inventoryRows: { id: string; phone_model: string; status: string; imei?: string | null }[];
  onRefresh: () => void;
}) {
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d">("7d");
  const [now] = useState(() => Date.now());
  const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
  const rangeStart = now - days * 24 * 60 * 60 * 1000;
  const prevRangeStart = rangeStart - days * 24 * 60 * 60 * 1000;

  const teamMembers = useMemo(
    () => contractors.filter((c) => c.role === "contractor" && c.team_manager_id === managerId),
    [contractors, managerId],
  );
  const teamIds = useMemo(() => new Set(teamMembers.map((m) => m.id)), [teamMembers]);

  const scopedSales = useMemo(() => sales.filter((s) => teamIds.has(s.contractor_id)), [sales, teamIds]);
  const scopedLeads = useMemo(() => leads.filter((l) => teamIds.has(l.contractor_id)), [leads, teamIds]);
  const inRange = useMemo(() => scopedSales.filter((s) => new Date(s.created_at).getTime() >= rangeStart), [scopedSales, rangeStart]);
  const prevInRange = useMemo(
    () =>
      scopedSales.filter((s) => {
        const ts = new Date(s.created_at).getTime();
        return ts >= prevRangeStart && ts < rangeStart;
      }),
    [scopedSales, prevRangeStart, rangeStart],
  );

  const isCompletedOrApproved = (status: string | null | undefined) => {
    const v = (status ?? "").toLowerCase();
    return v === "completed" || v === "approved";
  };
  const completed = inRange.filter((s) => isCompletedOrApproved(s.sale_status));
  const prevCompleted = prevInRange.filter((s) => isCompletedOrApproved(s.sale_status));

  const last7dStart = now - 7 * 24 * 60 * 60 * 1000;
  const activeSet = new Set(
    scopedSales
      .filter((s) => isCompletedOrApproved(s.sale_status) && new Date(s.created_at).getTime() >= last7dStart)
      .map((s) => s.contractor_id),
  );
  const activeReps = teamMembers.filter((m) => activeSet.has(m.id)).length;
  const inactiveReps = Math.max(0, teamMembers.length - activeReps);
  const totalTeamSales = completed.length;
  const avgSalesPerConsultant = activeReps > 0 ? totalTeamSales / activeReps : 0;
  const totalLeads = scopedLeads.length;
  const conversionRate = totalLeads > 0 ? (totalTeamSales / totalLeads) * 100 : 0;
  const prevTotalTeamSales = prevCompleted.length;
  const prevActiveSet = new Set(
    scopedSales
      .filter((s) => isCompletedOrApproved(s.sale_status) && new Date(s.created_at).getTime() >= prevRangeStart && new Date(s.created_at).getTime() < rangeStart)
      .map((s) => s.contractor_id),
  );
  const prevActiveReps = prevActiveSet.size;
  const prevAvg = prevActiveReps > 0 ? prevTotalTeamSales / prevActiveReps : 0;
  const prevConv = totalLeads > 0 ? (prevTotalTeamSales / totalLeads) * 100 : 0;

  const pct = (curr: number, prev: number) => (prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100);

  const pointsFor = (memberId: string) => {
    const bins = Array.from({ length: 6 }, () => 0);
    const bucketSize = (days * 24 * 60 * 60 * 1000) / bins.length;
    for (const s of inRange) {
      if (s.contractor_id !== memberId || !isCompletedOrApproved(s.sale_status)) continue;
      const idx = Math.min(
        bins.length - 1,
        Math.max(0, Math.floor((new Date(s.created_at).getTime() - rangeStart) / bucketSize)),
      );
      bins[idx] += 1;
    }
    return bins;
  };

  const teamRows: TeamRow[] = teamMembers.map((m) => {
    const memberSales = inRange.filter((s) => s.contractor_id === m.id && isCompletedOrApproved(s.sale_status));
    const memberLeads = scopedLeads.filter((l) => l.contractor_id === m.id);
    return {
      id: m.id,
      name: m.full_name ?? m.id.slice(0, 8),
      phone: m.phone ?? "",
      sales: memberSales.length,
      leads: memberLeads.length,
      conversionRate: memberLeads.length > 0 ? (memberSales.length / memberLeads.length) * 100 : 0,
      active: activeSet.has(m.id),
      trend: pointsFor(m.id),
    };
  });

  const topPerformer = useMemo(() => {
    const top = [...teamRows].sort((a, b) => b.sales - a.sales)[0];
    return top ? { id: top.id, name: top.name, phone: top.phone, sales: top.sales } : null;
  }, [teamRows]);

  const trendFromTotals = (rows: SaleRecord[]) => {
    const bins = Array.from({ length: 6 }, () => 0);
    const bucketSize = (days * 24 * 60 * 60 * 1000) / bins.length;
    for (const s of rows) {
      if (!isCompletedOrApproved(s.sale_status)) continue;
      const idx = Math.min(
        bins.length - 1,
        Math.max(0, Math.floor((new Date(s.created_at).getTime() - rangeStart) / bucketSize)),
      );
      bins[idx] += 1;
    }
    return bins;
  };

  return (
    <ManagerDashboard
      managerName={contractors.find((c) => c.id === managerId)?.full_name ?? "Manager"}
      roleLabel="Manager"
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      metrics={{
        totalTeamSales,
        avgSalesPerConsultant,
        conversionRate,
        activeReps,
        inactiveReps,
        changes: {
          totalTeamSales: pct(totalTeamSales, prevTotalTeamSales),
          avgSalesPerConsultant: pct(avgSalesPerConsultant, prevAvg),
          conversionRate: pct(conversionRate, prevConv),
          activity: pct(activeReps, prevActiveReps),
        },
        trends: {
          totalTeamSales: trendFromTotals(inRange),
          avgSalesPerConsultant: trendFromTotals(inRange).map((n) => (activeReps > 0 ? n / activeReps : n)),
          conversionRate: trendFromTotals(inRange).map((n) => (totalLeads > 0 ? (n / totalLeads) * 100 : 0)),
          activity: trendFromTotals(inRange),
        },
      }}
      rows={teamRows}
      topPerformer={topPerformer}
    />
  );
}
