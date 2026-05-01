import type { SupabaseClient } from "@supabase/supabase-js";

export async function notifyAdminsNewTeamMemberAwaitingApproval(
  supabase: SupabaseClient,
  opts: { candidateName: string; managerName: string },
) {
  const { data: admins, error } = await supabase.from("profiles").select("id").eq("role", "admin");
  if (error || !admins?.length) return;
  const body = `${opts.candidateName} - Invited by ${opts.managerName}`;
  await supabase.from("hub_notifications").insert(
    admins.map((a) => ({
      user_id: a.id,
      kind: "team_approval_pending",
      title: "New team member awaiting approval",
      body,
    })),
  );
}
