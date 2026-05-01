import type { SupabaseClient } from "@supabase/supabase-js";

export type HubAuditPayload = {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  before?: unknown;
  after?: unknown;
};

/** Append-only audit trail for MagicHub money/pricing changes (`hub_audit_log`). */
export async function insertHubAuditLog(supabase: SupabaseClient, actorId: string, payload: HubAuditPayload) {
  const { error } = await supabase.from("hub_audit_log").insert({
    actor_id: actorId,
    action: payload.action,
    entity_type: payload.entity_type,
    entity_id: payload.entity_id ?? null,
    before: payload.before ?? null,
    after: payload.after ?? null,
  });
  if (error) console.warn("hub_audit_log insert failed", error);
}
