"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function PublicReferralPage() {
  const searchParams = useSearchParams();
  const referral = searchParams.get("ref") ?? "";
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_wants: "Phone",
    current_carrier: "",
    budget: "",
    notes: "",
  });
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const supabase = useMemo(() => {
    try {
      return getSupabaseBrowserClient();
    } catch {
      return null;
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!supabase) {
      setMessage("Portal is not configured. Please try again later.");
      return;
    }
    if (!referral) {
      setMessage("Referral code missing in URL.");
      return;
    }
    if (!form.customer_name.trim() || !form.customer_phone.trim()) {
      setMessage("Name and phone are required.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_public_lead", {
      p_referral_code: referral,
      p_customer_name: form.customer_name.trim(),
      p_customer_phone: form.customer_phone.trim(),
      p_customer_wants: form.customer_wants,
      p_current_carrier: form.current_carrier.trim() || null,
      p_budget: form.budget.trim() || null,
      p_notes: form.notes.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setForm({
      customer_name: "",
      customer_phone: "",
      customer_wants: "Phone",
      current_carrier: "",
      budget: "",
      notes: "",
    });
    setMessage("Thanks! Your lead was sent to Magic Mobile.");
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-zinc-100">
      <section className="mx-auto max-w-lg rounded-2xl border border-purple-500/30 bg-zinc-950/90 p-6">
        <h1 className="text-2xl font-bold text-white">Magic Mobile Referral</h1>
        <p className="mt-1 text-sm text-zinc-400">Share your info and an agent will contact you shortly.</p>
        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
            placeholder="Your name"
            value={form.customer_name}
            onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
          />
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
            placeholder="Phone number"
            value={form.customer_phone}
            onChange={(e) => setForm((p) => ({ ...p, customer_phone: e.target.value }))}
          />
          <select
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
            value={form.customer_wants}
            onChange={(e) => setForm((p) => ({ ...p, customer_wants: e.target.value }))}
          >
            <option>Phone</option>
            <option>Plan</option>
            <option>Phone + Plan</option>
            <option>Accessories</option>
          </select>
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
            placeholder="Current carrier (optional)"
            value={form.current_carrier}
            onChange={(e) => setForm((p) => ({ ...p, current_carrier: e.target.value }))}
          />
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
            placeholder="Budget (optional)"
            value={form.budget}
            onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))}
          />
          <textarea
            className="h-24 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Send Lead"}
          </button>
        </form>
        {message && <p className="mt-4 text-sm text-purple-300">{message}</p>}
      </section>
    </main>
  );
}
