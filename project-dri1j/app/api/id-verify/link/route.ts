import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const { saleId, customerPhone, expiresMinutes } = (await req.json()) as {
      saleId?: string;
      customerPhone?: string;
      expiresMinutes?: number;
    };
    if (!saleId) return NextResponse.json({ ok: false, error: "saleId is required" }, { status: 400 });
    const supabase = getSupabaseAdminClient();
    const token = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expMin = Math.min(60, Math.max(30, Number(expiresMinutes ?? 45)));
    const expiresAt = new Date(Date.now() + expMin * 60_000).toISOString();

    const { error } = await supabase.from("hub_id_verification_links").insert({
      sale_id: saleId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (error) throw error;

    await supabase
      .from("sales")
      .update({ id_verification_status: "waiting", id_upload_sent_at: new Date().toISOString() })
      .eq("id", saleId);

    const appBase = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const link = `${appBase}/verify/${saleId}/${token}`;
    const smsMessage = `Magic Mobile: Please upload your ID to complete your order. ${link}`;
    return NextResponse.json({ ok: true, link, smsMessage, customerPhone: customerPhone ?? null, expiresAt });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to create verification link" },
      { status: 500 },
    );
  }
}
