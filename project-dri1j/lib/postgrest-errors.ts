/**
 * PostgREST / Supabase JS errors for missing relations (schema cache).
 * Message wording can vary slightly by API version.
 */
export function isMissingPublicTableError(err: unknown, tableName: string): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code : "";
  const msg = typeof o.message === "string" ? o.message : "";
  if (code !== "PGRST205") return false;
  const quoted = `'public.${tableName}'`;
  const unquoted = `public.${tableName}`;
  return msg.includes(quoted) || msg.includes(unquoted);
}
