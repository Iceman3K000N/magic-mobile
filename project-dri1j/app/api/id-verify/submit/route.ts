import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

async function uploadFile(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  saleId: string,
  field: string,
  file: File | null,
) {
  if (!file) return null;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `verify/${saleId}/${field}-${Date.now()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from("magichub-docs").upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const saleId = String(form.get("saleId") || "");
    const token = String(form.get("token") || "");
    const front = form.get("front") as File | null;
    const back = form.get("back") as File | null;
    const selfie = form.get("selfie") as File | null;
    if (!saleId || !token) {
      return NextResponse.json({ ok: false, error: "Missing saleId/token" }, { status: 400 });
    }
    if (!front || !back) {
      return NextResponse.json({ ok: false, error: "Front and back ID are required." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data: link, error: linkErr } = await supabase
      .from("hub_id_verification_links")
      .select("id,expires_at,used_at")
      .eq("sale_id", saleId)
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
    if (link.used_at) return NextResponse.json({ ok: false, error: "This link was already used." }, { status: 400 });
    if (new Date(link.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "Link has expired." }, { status: 400 });
    }

    const frontPath = await uploadFile(supabase, saleId, "id-front", front);
    const backPath = await uploadFile(supabase, saleId, "id-back", back);
    const selfiePath = await uploadFile(supabase, saleId, "selfie", selfie);
    const now = new Date().toISOString();
    const { data: saleRow } = await supabase.from("sales").select("contractor_id").eq("id", saleId).maybeSingle();
    const contractorId = String(saleRow?.contractor_id ?? "");
    if (!contractorId) throw new Error("Sale contractor not found.");

    const docs = [
      { storage_path: frontPath, title: "ID Front", kind: "id_front" },
      { storage_path: backPath, title: "ID Back", kind: "id_back" },
      ...(selfiePath ? [{ storage_path: selfiePath, title: "Selfie", kind: "selfie" }] : []),
    ]
      .filter((x) => x.storage_path)
      .map((x) => ({
        contractor_id: contractorId,
        storage_path: x.storage_path as string,
        title: x.title,
        kind: x.kind,
        sale_id: saleId,
        created_at: now,
      }));

    if (docs.length > 0) {
      await supabase.from("hub_documents").insert(docs);
    }
    await supabase.from("sales").update({ id_verification_status: "uploaded", id_uploaded_at: now }).eq("id", saleId);
    await supabase.from("hub_id_verification_links").update({ used_at: now }).eq("id", link.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
