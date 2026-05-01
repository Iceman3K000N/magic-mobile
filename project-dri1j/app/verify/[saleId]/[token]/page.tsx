"use client";

import { useMemo, useState } from "react";

export default function VerifyPage({ params }: { params: { saleId: string; token: string } }) {
  const { saleId, token } = params;
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [validated, setValidated] = useState<"idle" | "ok" | "bad">("idle");

  const title = useMemo(() => (validated === "ok" ? "Upload your ID" : "Verify secure link"), [validated]);

  async function validateLink() {
    setMsg(null);
    const res = await fetch(`/api/id-verify/validate?saleId=${encodeURIComponent(saleId)}&token=${encodeURIComponent(token)}`);
    const body = (await res.json()) as { ok?: boolean; valid?: boolean; error?: string };
    if (!body.valid) {
      setValidated("bad");
      setMsg(body.error ?? "Link is not valid.");
      return;
    }
    setValidated("ok");
  }

  async function submit() {
    if (!front || !back) {
      setMsg("Please upload front and back of ID.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.set("saleId", saleId);
      form.set("token", token);
      form.set("front", front);
      form.set("back", back);
      if (selfie) form.set("selfie", selfie);
      const res = await fetch("/api/id-verify/submit", { method: "POST", body: form });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Upload failed.");
      setMsg("ID uploaded successfully. You can close this page.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 bg-black px-4 py-10 text-zinc-100">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-zinc-400">Magic Mobile secure verification portal.</p>
      {validated === "idle" ? (
        <button type="button" className="w-full rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/15 px-4 py-3 text-sm font-medium" onClick={() => void validateLink()}>
          Validate link
        </button>
      ) : null}
      {validated === "ok" ? (
        <div className="space-y-3">
          <label className="block text-sm">
            Front of ID
            <input className="mt-1 w-full text-sm" type="file" accept="image/*" capture="environment" onChange={(e) => setFront(e.target.files?.[0] ?? null)} />
          </label>
          <label className="block text-sm">
            Back of ID
            <input className="mt-1 w-full text-sm" type="file" accept="image/*" capture="environment" onChange={(e) => setBack(e.target.files?.[0] ?? null)} />
          </label>
          <label className="block text-sm">
            Selfie (optional)
            <input className="mt-1 w-full text-sm" type="file" accept="image/*" capture="user" onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} />
          </label>
          <button type="button" className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-sm font-medium" onClick={() => void submit()} disabled={busy}>
            {busy ? "Submitting..." : "Submit ID"}
          </button>
        </div>
      ) : null}
      {msg ? <p className={`text-sm ${validated === "bad" ? "text-red-300" : "text-zinc-300"}`}>{msg}</p> : null}
    </main>
  );
}
