import { createClient } from "@supabase/supabase-js";

const CEO_EMAIL = "sheridanhart@magicmobilewireless.com";

export async function getAuthedUserFromRequest(req: Request): Promise<
  | { ok: true; userId: string; email: string | undefined }
  | { ok: false; status: number; message: string }
> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Missing Authorization bearer token." };
  }
  const token = auth.slice(7).trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return { ok: false, status: 500, message: "Missing Supabase URL or anon key." };
  }
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { ok: false, status: 401, message: "Invalid or expired session." };
  }
  return { ok: true, userId: user.id, email: user.email ?? undefined };
}

export function canUseManagerPin(role: string | null | undefined, email: string | undefined): boolean {
  if (role === "admin" || role === "sale_manager" || role === "store_lead") return true;
  if (email && email.toLowerCase() === CEO_EMAIL.toLowerCase()) return true;
  return false;
}
