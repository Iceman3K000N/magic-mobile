import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { canUseManagerPin, getAuthedUserFromRequest } from "@/lib/magichub-pin-api-auth";
import { hashManagerPin, normalizeFourDigitPin, verifyManagerPin } from "@/lib/magichub-pin-server";

const MAX_FAILS = 8;
const LOCKOUT_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const auth = await getAuthedUserFromRequest(req);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

    const admin = getSupabaseAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.userId).maybeSingle();
    const role = profile?.role as string | undefined;
    if (!canUseManagerPin(role, auth.email)) {
      return NextResponse.json({ pinRequired: false, needsSetup: false });
    }

    const { data: row } = await admin.from("manager_auth_pins").select("user_id").eq("user_id", auth.userId).maybeSingle();
    return NextResponse.json({
      pinRequired: true,
      needsSetup: !row,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PIN status failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthedUserFromRequest(req);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

    const admin = getSupabaseAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", auth.userId).maybeSingle();
    const role = profile?.role as string | undefined;
    if (!canUseManagerPin(role, auth.email)) {
      return NextResponse.json({ error: "PIN not required for this account." }, { status: 403 });
    }

    const body = (await req.json()) as { action?: string; pin?: string; confirmPin?: string };
    const action = body.action === "set" ? "set" : body.action === "verify" ? "verify" : null;
    if (!action) return NextResponse.json({ error: "Invalid action." }, { status: 400 });

    if (action === "set") {
      const pin = normalizeFourDigitPin(String(body.pin ?? ""));
      const confirm = normalizeFourDigitPin(String(body.confirmPin ?? ""));
      if (!pin || !confirm) return NextResponse.json({ error: "Enter two matching 4-digit PINs." }, { status: 400 });
      if (pin !== confirm) return NextResponse.json({ error: "PINs do not match." }, { status: 400 });

      const pin_hash = hashManagerPin(pin);
      const now = new Date().toISOString();
      const { error } = await admin.from("manager_auth_pins").upsert(
        {
          user_id: auth.userId,
          pin_hash,
          updated_at: now,
          failed_attempts: 0,
          locked_until: null,
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const pin = normalizeFourDigitPin(String(body.pin ?? ""));
    if (!pin) return NextResponse.json({ error: "Enter your 4-digit PIN." }, { status: 400 });

    const { data: row, error: re } = await admin
      .from("manager_auth_pins")
      .select("pin_hash, failed_attempts, locked_until")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (re) throw re;
    if (!row?.pin_hash) return NextResponse.json({ error: "PIN not set yet." }, { status: 400 });

    const lockedUntil = row.locked_until ? new Date(row.locked_until).getTime() : 0;
    if (lockedUntil > Date.now()) {
      return NextResponse.json({ error: "PIN temporarily locked. Try again later." }, { status: 429 });
    }

    const ok = verifyManagerPin(pin, row.pin_hash as string);
    if (!ok) {
      const fails = Number(row.failed_attempts ?? 0) + 1;
      const lock =
        fails >= MAX_FAILS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
      await admin
        .from("manager_auth_pins")
        .update({
          failed_attempts: fails,
          locked_until: lock,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", auth.userId);
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    await admin
      .from("manager_auth_pins")
      .update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
      .eq("user_id", auth.userId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PIN request failed" },
      { status: 500 },
    );
  }
}
