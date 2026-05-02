import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * GET — Checks whether this deployment's Supabase URL + service role can reach `public.profiles`.
 * Open in the browser on production (e.g. https://your-app.vercel.app/api/health/supabase)
 * to confirm Vercel env points at the same project where you ran SQL.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  let supabaseHost = "";
  try {
    if (url) supabaseHost = new URL(url).host;
  } catch {
    supabaseHost = "";
  }

  try {
    const admin = getSupabaseAdminClient();
    const { error } = await admin.from("profiles").select("id").limit(1);

    if (!error) {
      return NextResponse.json({
        ok: true,
        supabaseHost,
        profilesTableReachable: true,
      });
    }

    const code = typeof (error as { code?: string }).code === "string" ? (error as { code: string }).code : "";
    const message = typeof (error as { message?: string }).message === "string" ? (error as { message: string }).message : "";

    if (code === "PGRST205") {
      return NextResponse.json({
        ok: false,
        supabaseHost,
        profilesTableReachable: false,
        errorCode: code,
        message,
        hint:
          "Table not visible to PostgREST. In the Supabase project that matches NEXT_PUBLIC_SUPABASE_URL (" +
          (supabaseHost || "check env") +
          "), run project-dri1j/supabase/magic_mobile_schema.sql, then: select pg_notify('pgrst', 'reload schema');",
      });
    }

    return NextResponse.json({
      ok: false,
      supabaseHost,
      profilesTableReachable: false,
      errorCode: code,
      message,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const missingAdmin =
      msg.includes("Missing Supabase admin") || msg.includes("Missing or invalid Supabase admin");
    return NextResponse.json(
      {
        ok: false,
        supabaseHost,
        profilesTableReachable: false,
        hint: missingAdmin
          ? "Add SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in Vercel → Settings → Environment Variables so this check can run. Browser login still uses NEXT_PUBLIC_SUPABASE_URL + anon/publishable key — ensure those match the project where you created `profiles`."
          : msg,
      },
      { status: 503 },
    );
  }
}
