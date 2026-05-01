import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "magichub-docs";

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = header?.match(/data:([^;]+)/)?.[1] ?? "image/png";
  const binary = atob(b64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function uploadMagichubFile(
  supabase: SupabaseClient,
  uid: string,
  relativePath: string,
  body: Blob,
  contentType: string,
) {
  const path = `${uid}/${relativePath}`;
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return { path: data?.path ?? path, bucket: BUCKET };
}

export async function uploadDataUrl(
  supabase: SupabaseClient,
  uid: string,
  relativePath: string,
  dataUrl: string,
) {
  const blob = dataUrlToBlob(dataUrl);
  return uploadMagichubFile(supabase, uid, relativePath, blob, blob.type || "image/png");
}

export async function getMagichubDocSignedUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  expiresSec = 3600,
) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  if (error) return null;
  return data?.signedUrl ?? null;
}
