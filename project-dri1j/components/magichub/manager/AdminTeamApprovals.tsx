"use client";

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRecord } from "@/lib/magic-mobile";
import { insertHubAuditLog } from "@/lib/magichub-audit";
import { getMagichubDocSignedUrl } from "@/lib/magichub-storage";
import {
  CONSULTANT_REQUEST_STATUS_LABELS,
  type HubConsultantRequest,
} from "@/lib/magichub-team";
import { HubCard, hubBtnGhost, hubBtnPrimary, hubInputClass } from "@/components/magichub/MagicHubShell";
import { useManagerPin } from "@/components/magichub/ManagerPinGate";

function managerName(contractors: ProfileRecord[], id: string) {
  return contractors.find((c) => c.id === id)?.full_name ?? id.slice(0, 8);
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

export function AdminTeamApprovals({
  supabase,
  requests,
  contractors,
  actorId,
  onRefresh,
}: {
  supabase: SupabaseClient;
  requests: HubConsultantRequest[];
  contractors: ProfileRecord[];
  actorId: string;
  onRefresh: () => void;
}) {
  const { ensureUnlocked } = useManagerPin();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [profileUuid, setProfileUuid] = useState("");
  const [reassignManagerId, setReassignManagerId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [docLinks, setDocLinks] = useState<Record<string, string | null>>({});

  const pending = useMemo(
    () => requests.filter((r) => r.status === "pending_admin_approval" || r.status === "needs_correction"),
    [requests],
  );
  const selected = useMemo(() => pending.find((r) => r.id === selectedId) ?? null, [pending, selectedId]);
  function selectRequest(r: HubConsultantRequest | null) {
    setSelectedId(r?.id ?? null);
    setProfileUuid(r?.linked_profile_id ?? "");
    setReassignManagerId(r?.manager_id ?? "");
    setRejectReason("");
    setCorrectionReason("");
  }

  const managerOptions = useMemo(
    () => contractors.filter((c) => c.role === "sale_manager"),
    [contractors],
  );

  async function openDoc(key: string, path: string | null) {
    const url = await getMagichubDocSignedUrl(supabase, path);
    setDocLinks((m) => ({ ...m, [key]: url }));
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function approve(r: HubConsultantRequest) {
    if (!(await ensureUnlocked())) return;
    const uuid = profileUuid.trim() || r.linked_profile_id || "";
    if (!uuid) {
      alert("Profile UUID is required before approval.");
      return;
    }
    setBusyId(r.id);
    try {
      const now = new Date().toISOString();
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          role: "contractor",
          is_active: true,
          team_manager_id: r.manager_id,
        })
        .eq("id", uuid);
      if (pErr) throw pErr;

      const { error } = await supabase
        .from("hub_consultant_requests")
        .update({
          status: "active",
          linked_profile_id: uuid,
          reviewed_by: actorId,
          reviewed_at: now,
          rejection_reason: null,
          updated_at: now,
        })
        .eq("id", r.id);
      if (error) throw error;

      await insertHubAuditLog(supabase, actorId, {
        action: "admin_approved_consultant",
        entity_type: "hub_consultant_requests",
        entity_id: r.id,
        after: { status: "active", linked_profile_id: uuid },
      });
      selectRequest(null);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(r: HubConsultantRequest) {
    if (!(await ensureUnlocked())) return;
    const reason = rejectReason.trim();
    if (!reason) {
      alert("Rejection reason is required.");
      return;
    }
    setBusyId(r.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("hub_consultant_requests")
        .update({
          status: "rejected",
          reviewed_by: actorId,
          reviewed_at: now,
          rejection_reason: reason,
          updated_at: now,
        })
        .eq("id", r.id);
      if (error) throw error;
      await insertHubAuditLog(supabase, actorId, {
        action: "admin_rejected_consultant",
        entity_type: "hub_consultant_requests",
        entity_id: r.id,
        after: { status: "rejected", rejection_reason: reason },
      });
      selectRequest(null);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function requestCorrection(r: HubConsultantRequest) {
    if (!(await ensureUnlocked())) return;
    const reason = correctionReason.trim();
    if (!reason) {
      alert("Correction reason is required.");
      return;
    }
    setBusyId(r.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("hub_consultant_requests")
        .update({
          status: "needs_correction",
          reviewed_by: actorId,
          reviewed_at: now,
          rejection_reason: reason,
          updated_at: now,
        })
        .eq("id", r.id);
      if (error) throw error;
      await insertHubAuditLog(supabase, actorId, {
        action: "admin_requested_consultant_correction",
        entity_type: "hub_consultant_requests",
        entity_id: r.id,
        after: { status: "needs_correction", correction_reason: reason },
      });
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function restoreConsultant(r: HubConsultantRequest) {
    if (!(await ensureUnlocked())) return;
    setBusyId(r.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("hub_consultant_requests")
        .update({ status: "active", reviewed_by: actorId, reviewed_at: now, updated_at: now })
        .eq("id", r.id);
      if (error) throw error;
      if (r.linked_profile_id) {
        await supabase.from("profiles").update({ is_active: true }).eq("id", r.linked_profile_id);
      }
      await insertHubAuditLog(supabase, actorId, {
        action: "admin_restored_consultant",
        entity_type: "hub_consultant_requests",
        entity_id: r.id,
      });
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function reassignConsultant(r: HubConsultantRequest) {
    if (!(await ensureUnlocked())) return;
    if (!r.linked_profile_id) return alert("Link a profile UUID before reassignment.");
    if (!reassignManagerId) return alert("Select a manager.");
    setBusyId(r.id);
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ team_manager_id: reassignManagerId })
        .eq("id", r.linked_profile_id);
      if (pErr) throw pErr;
      const { error } = await supabase
        .from("hub_consultant_requests")
        .update({ manager_id: reassignManagerId, updated_at: new Date().toISOString() })
        .eq("id", r.id);
      if (error) throw error;
      await insertHubAuditLog(supabase, actorId, {
        action: "consultant_reassigned",
        entity_type: "hub_consultant_requests",
        entity_id: r.id,
        after: { manager_id: reassignManagerId },
      });
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(r: HubConsultantRequest) {
    if (!(await ensureUnlocked())) return;
    if (!confirm("Fully remove this consultant request and linked profile?")) return;
    setBusyId(r.id);
    try {
      if (r.linked_profile_id) {
        await supabase.from("profiles").delete().eq("id", r.linked_profile_id);
      }
      await supabase.from("hub_consultant_requests").delete().eq("id", r.id);
      await insertHubAuditLog(supabase, actorId, {
        action: "admin_removed_consultant",
        entity_type: "hub_consultant_requests",
        entity_id: r.id,
      });
      selectRequest(null);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Pending Approval List</h2>
        <HubCard className="!p-0 overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-xs uppercase text-zinc-500">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Manager</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id} className="border-b border-zinc-800/70">
                  <td className="px-3 py-2 text-white">{r.full_name}</td>
                  <td className="px-3 py-2 text-zinc-400">{r.phone ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{r.email ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{managerName(contractors, r.manager_id)}</td>
                  <td className="px-3 py-2 text-fuchsia-300">{CONSULTANT_REQUEST_STATUS_LABELS[r.status]}</td>
                  <td className="px-3 py-2 text-zinc-500">{fmt(r.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={`${hubBtnGhost} !px-3 !py-1.5`} onClick={() => selectRequest(r)}>
                        View Details
                      </button>
                      <button type="button" className={`${hubBtnPrimary} !px-3 !py-1.5`} onClick={() => void approve(r)} disabled={busyId === r.id}>
                        Approve
                      </button>
                      <button type="button" className={`${hubBtnGhost} !px-3 !py-1.5 border-red-500/40 text-red-300`} onClick={() => void reject(r)} disabled={busyId === r.id}>
                        Reject
                      </button>
                      <button type="button" className={`${hubBtnGhost} !px-3 !py-1.5 border-amber-500/40 text-amber-300`} onClick={() => void requestCorrection(r)} disabled={busyId === r.id}>
                        Request Correction
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pending.length === 0 ? <p className="px-4 py-5 text-sm text-zinc-500">No pending approvals.</p> : null}
        </HubCard>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">Detail View</h2>
        {!selected ? (
          <HubCard>
            <p className="text-sm text-zinc-500">Select a pending request to view full details and documents.</p>
          </HubCard>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <HubCard>
              <h3 className="text-lg font-semibold text-white">{selected.full_name}</h3>
              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                <p>Email: {selected.email ?? "—"}</p>
                <p>Phone: {selected.phone ?? "—"}</p>
                <p>Address: {selected.address ?? "—"}</p>
                <p>DOB: {selected.date_of_birth ?? "—"}</p>
                <p>Emergency contact: {selected.emergency_contact ?? "—"}</p>
                <p>Payout method: {selected.payout_method ?? "—"}</p>
                <p>Cash App: {selected.cash_app_tag ?? "—"}</p>
                <p>Bank payout notes: {selected.bank_payout_notes ?? "—"}</p>
                <p>Notes: {selected.notes ?? "—"}</p>
                <p className="text-zinc-500">Manager assigned: {managerName(contractors, selected.manager_id)}</p>
              </div>
            </HubCard>

            <HubCard>
              <h3 className="text-lg font-semibold text-white">Documents</h3>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">ID</span>
                  <button type="button" className={hubBtnGhost} onClick={() => void openDoc("id", selected.id_document_path)}>Open</button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">W-9</span>
                  <button type="button" className={hubBtnGhost} onClick={() => void openDoc("w9", selected.w9_document_path)}>Open</button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Contractor agreement</span>
                  <button type="button" className={hubBtnGhost} onClick={() => void openDoc("agreement", selected.agreement_document_path)}>Open</button>
                </div>
                {(docLinks.id || docLinks.w9 || docLinks.agreement) ? (
                  <p className="text-xs text-zinc-500">Signed links generated. They open in a new tab.</p>
                ) : null}
              </div>

              <div className="mt-5 space-y-3 border-t border-zinc-800 pt-4">
                <label className="block text-xs text-zinc-500">
                  Profile UUID (required for approve)
                  <input
                    className={`mt-1 ${hubInputClass} font-mono`}
                    value={profileUuid}
                    onChange={(e) => setProfileUuid(e.target.value)}
                    placeholder={selected.linked_profile_id ?? "existing profile UUID"}
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  Rejection reason
                  <textarea className={`mt-1 min-h-[70px] ${hubInputClass}`} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                </label>
                <label className="block text-xs text-zinc-500">
                  Correction request details
                  <textarea className={`mt-1 min-h-[70px] ${hubInputClass}`} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} />
                </label>
                <label className="block text-xs text-zinc-500">
                  Reassign manager
                  <select className={`mt-1 ${hubInputClass}`} value={reassignManagerId} onChange={(e) => setReassignManagerId(e.target.value)}>
                    <option value="">Select manager</option>
                    {managerOptions.map((m) => (
                      <option key={m.id} value={m.id}>{m.full_name ?? m.id.slice(0,8)}</option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={hubBtnPrimary} disabled={busyId === selected.id} onClick={() => void reassignConsultant(selected)}>
                    Reassign Consultant
                  </button>
                  <button type="button" className={hubBtnGhost} disabled={busyId === selected.id} onClick={() => void restoreConsultant(selected)}>
                    Restore Suspended
                  </button>
                  <button type="button" className={`${hubBtnGhost} border-red-500/40 text-red-300`} disabled={busyId === selected.id} onClick={() => void removeUser(selected)}>
                    Remove User
                  </button>
                </div>
              </div>
            </HubCard>
          </div>
        )}
      </section>
    </div>
  );
}
