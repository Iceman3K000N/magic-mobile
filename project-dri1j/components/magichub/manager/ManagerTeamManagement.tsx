"use client";

import { useCallback, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, type ProfileRecord } from "@/lib/magic-mobile";
import { insertHubAuditLog } from "@/lib/magichub-audit";
import { uploadMagichubFile } from "@/lib/magichub-storage";
import { notifyAdminsNewTeamMemberAwaitingApproval } from "@/lib/magichub-notify-admins";
import { CONSULTANT_REQUEST_STATUS_LABELS, type HubConsultantRequest } from "@/lib/magichub-team";
import { HubCard, hubBtnGhost, hubBtnPrimary, hubInputClass } from "@/components/magichub/MagicHubShell";
import type { SaleRecord } from "@/lib/magichub";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export function ManagerTeamManagement({
  supabase,
  managerId,
  managerName,
  teamRequests,
  contractors,
  sales,
  onRefresh,
}: {
  supabase: SupabaseClient;
  managerId: string;
  managerName: string;
  teamRequests: HubConsultantRequest[];
  contractors: ProfileRecord[];
  sales: SaleRecord[];
  onRefresh: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [agreementFile, setAgreementFile] = useState<File | null>(null);
  const [w9File, setW9File] = useState<File | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    address: "",
    date_of_birth: "",
    emergency_contact: "",
    payout_method: "",
    cash_app_tag: "",
    bank_payout_notes: "",
    notes: "",
  });

  const myContractors = useMemo(
    () => contractors.filter((c) => c.role === "contractor" && c.team_manager_id === managerId),
    [contractors, managerId],
  );
  const myRequests = useMemo(
    () => teamRequests.filter((r) => r.manager_id === managerId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [teamRequests, managerId],
  );

  const weekStart = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    mon.setHours(0, 0, 0, 0);
    return mon.toISOString();
  }, []);

  const weekSales = useMemo(() => {
    const ids = new Set(myContractors.map((c) => c.id));
    return sales.filter((s) => ids.has(s.contractor_id) && new Date(s.created_at) >= new Date(weekStart));
  }, [sales, myContractors, weekStart]);

  const stats = useMemo(() => {
    const pending = myRequests.filter((r) => r.status === "pending_admin_approval").length;
    const suspended = myRequests.filter((r) => r.status === "suspended").length;
    const active = myRequests.filter((r) => r.status === "active").length;
    const topCounts: Record<string, number> = {};
    for (const s of weekSales) topCounts[s.contractor_id] = (topCounts[s.contractor_id] ?? 0) + 1;
    const topId = Object.entries(topCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      total: myContractors.length + active,
      active: myContractors.filter((c) => c.is_active).length,
      pending,
      suspended,
      weekRevenue: weekSales.reduce((a, s) => a + Number(s.total_sale), 0),
      topSeller: topId ? contractors.find((c) => c.id === topId)?.full_name ?? "—" : "—",
    };
  }, [myContractors, myRequests, weekSales, contractors]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return setMsg("Full name is required.");
    if (!form.cash_app_tag.trim()) return setMsg("Cash App tag is required for consultant payouts.");
    setSaving(true);
    setMsg(null);
    try {
      const { data, error } = await supabase
        .from("hub_consultant_requests")
        .insert({
          manager_id: managerId,
          status: "pending_admin_approval",
          full_name: form.full_name.trim(),
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          date_of_birth: form.date_of_birth || null,
          emergency_contact: form.emergency_contact || null,
          payout_method: "cash_app",
          cash_app_tag: form.cash_app_tag || null,
          bank_payout_notes: form.bank_payout_notes || null,
          notes: form.notes || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const reqId = data?.id as string;
      if (reqId && idFile) {
        const up = await uploadMagichubFile(supabase, managerId, `team-request/${reqId}/id`, idFile, idFile.type || "application/octet-stream");
        await supabase.from("hub_consultant_requests").update({ id_document_path: up.path }).eq("id", reqId);
      }
      if (reqId && agreementFile) {
        const up = await uploadMagichubFile(supabase, managerId, `team-request/${reqId}/agreement`, agreementFile, agreementFile.type || "application/pdf");
        await supabase.from("hub_consultant_requests").update({ agreement_document_path: up.path }).eq("id", reqId);
      }
      if (reqId && w9File) {
        const up = await uploadMagichubFile(supabase, managerId, `team-request/${reqId}/w9`, w9File, w9File.type || "application/pdf");
        await supabase.from("hub_consultant_requests").update({ w9_document_path: up.path }).eq("id", reqId);
      }
      await insertHubAuditLog(supabase, managerId, { action: "manager_submitted_consultant", entity_type: "hub_consultant_requests", entity_id: reqId });
      await notifyAdminsNewTeamMemberAwaitingApproval(supabase, { candidateName: form.full_name, managerName });
      setMsg("Request submitted for admin approval.");
      setForm({ full_name: "", phone: "", email: "", address: "", date_of_birth: "", emergency_contact: "", payout_method: "", cash_app_tag: "", bank_payout_notes: "", notes: "" });
      setIdFile(null);
      setAgreementFile(null);
      setW9File(null);
      onRefresh();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  const suspend = useCallback(async (r: HubConsultantRequest) => {
    if (!confirm(`Deactivate ${r.full_name}?`)) return;
    const { error } = await supabase.from("hub_consultant_requests").update({ status: "suspended" }).eq("id", r.id).eq("manager_id", managerId);
    if (error) return alert(error.message);
    await insertHubAuditLog(supabase, managerId, { action: "manager_suspended_consultant", entity_type: "hub_consultant_requests", entity_id: r.id });
    onRefresh();
  }, [managerId, onRefresh, supabase]);

  const requestRemoval = useCallback(async (r: HubConsultantRequest) => {
    if (!confirm("Request removal? Admin will finalize.")) return;
    const { error } = await supabase.from("hub_consultant_requests").update({ status: "removed" }).eq("id", r.id).eq("manager_id", managerId);
    if (error) return alert(error.message);
    await insertHubAuditLog(supabase, managerId, { action: "manager_requested_removal", entity_type: "hub_consultant_requests", entity_id: r.id });
    onRefresh();
  }, [managerId, onRefresh, supabase]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HubCard><p className="text-xs uppercase text-zinc-500">Total team members</p><p className="mt-1 text-2xl font-semibold text-white">{stats.total}</p></HubCard>
        <HubCard><p className="text-xs uppercase text-zinc-500">Active consultants</p><p className="mt-1 text-2xl font-semibold text-emerald-300">{stats.active}</p></HubCard>
        <HubCard><p className="text-xs uppercase text-zinc-500">Pending approval</p><p className="mt-1 text-2xl font-semibold text-amber-300">{stats.pending}</p></HubCard>
        <HubCard><p className="text-xs uppercase text-zinc-500">Suspended consultants</p><p className="mt-1 text-2xl font-semibold text-zinc-300">{stats.suspended}</p></HubCard>
        <HubCard><p className="text-xs uppercase text-zinc-500">Team sales this week</p><p className="mt-1 text-2xl font-semibold text-fuchsia-200">{formatCurrency(stats.weekRevenue)}</p></HubCard>
        <HubCard><p className="text-xs uppercase text-zinc-500">Top team seller</p><p className="mt-1 text-lg font-semibold text-white">{stats.topSeller}</p></HubCard>
      </div>

      <HubCard>
        <h2 className="text-lg font-semibold text-white">Add New Consultant</h2>
        <form className="mt-4 space-y-3" onSubmit={(e) => void submitRequest(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["full_name","phone","email","address","date_of_birth","emergency_contact","cash_app_tag","bank_payout_notes"] as const).map((k) => (
              <label key={k} className={`${k==="address"||k==="emergency_contact"||k==="bank_payout_notes"?"col-span-full ":""}block text-xs text-zinc-500`}>
                {k.replaceAll("_"," ").replace(/\b\w/g, (m) => m.toUpperCase())}{k==="full_name"?" *":""}
                <input type={k==="email"?"email":k==="date_of_birth"?"date":"text"} className={`mt-1 ${hubInputClass}`} value={(form as Record<string,string>)[k]} onChange={(e)=>setForm((f)=>({ ...f, [k]: e.target.value }))} required={k==="full_name"} />
              </label>
            ))}
            <label className="block text-xs text-zinc-500">
              Payout method
              <input className={`mt-1 ${hubInputClass}`} value="Cash App" readOnly />
            </label>
            <label className="col-span-full block text-xs text-zinc-500">Notes<textarea className={`mt-1 min-h-[72px] ${hubInputClass}`} value={form.notes} onChange={(e)=>setForm((f)=>({ ...f, notes: e.target.value }))} /></label>
            <label className="block text-xs text-zinc-500">Upload ID<input type="file" className="mt-1 block w-full text-sm text-zinc-400" onChange={(e)=>setIdFile(e.target.files?.[0] ?? null)} /></label>
            <label className="block text-xs text-zinc-500">Upload signed contractor agreement<input type="file" className="mt-1 block w-full text-sm text-zinc-400" onChange={(e)=>setAgreementFile(e.target.files?.[0] ?? null)} /></label>
            <label className="block text-xs text-zinc-500">Upload W-9<input type="file" className="mt-1 block w-full text-sm text-zinc-400" onChange={(e)=>setW9File(e.target.files?.[0] ?? null)} /></label>
          </div>
          {msg ? <p className="text-sm text-purple-300">{msg}</p> : null}
          <button type="submit" disabled={saving} className={`${hubBtnPrimary} w-full sm:w-auto`}>{saving ? "Submitting..." : "Submit for approval"}</button>
        </form>
      </HubCard>

      <HubCard>
        <h2 className="text-lg font-semibold text-white">View My Team</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {myContractors.map((c) => (
            <li key={c.id} className="flex flex-wrap justify-between gap-2 border-b border-zinc-800/80 py-2">
              <span className="text-white">{c.full_name ?? c.id.slice(0,8)}</span>
              <span className={c.is_active ? "text-emerald-400" : "text-amber-400"}>{c.is_active ? "Active" : "Inactive"}</span>
            </li>
          ))}
        </ul>
      </HubCard>

      <HubCard>
        <h2 className="text-lg font-semibold text-white">Track onboarding status</h2>
        <div className="mt-3 space-y-2">
          {myRequests.map((r) => (
            <div key={r.id} className="rounded-xl border border-zinc-800 bg-black/40 p-3 text-sm">
              <div className="flex justify-between gap-2"><span className="font-medium text-white">{r.full_name}</span><span className="text-fuchsia-300">{CONSULTANT_REQUEST_STATUS_LABELS[r.status]}</span></div>
              <p className="mt-1 text-xs text-zinc-500">{r.email ?? r.phone ?? "—"}</p>
              {r.rejection_reason ? <p className="mt-2 text-xs text-amber-200">{r.rejection_reason}</p> : null}
              {r.status === "active" ? <div className="mt-2 grid grid-cols-1 gap-2 sm:flex"><button type="button" className={`${hubBtnGhost} w-full sm:w-auto`} onClick={() => void suspend(r)}>Deactivate Consultant</button><button type="button" className={`${hubBtnGhost} w-full sm:w-auto`} onClick={() => void requestRemoval(r)}>Remove From Team</button></div> : null}
            </div>
          ))}
        </div>
      </HubCard>
    </div>
  );
}
