import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const saleId = url.searchParams.get("saleId");
    const token = url.searchParams.get("token");
    if (!saleId || !token) {
      return NextResponse.json({ ok: false, valid: false, error: "Missing saleId or token" }, { status: 400 });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("hub_id_verification_links")
      .select("id,expires_at,used_at")
      .eq("sale_id", saleId)
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: true, valid: false, error: "Link not found." });
    if (data.used_at) return NextResponse.json({ ok: true, valid: false, error: "Link already used." });
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ ok: true, valid: false, error: "Link expired." });
    }
    return NextResponse.json({ ok: true, valid: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, valid: false, error: e instanceof Error ? e.message : "Validation failed" },
      { status: 500 },
    );
  }
}
