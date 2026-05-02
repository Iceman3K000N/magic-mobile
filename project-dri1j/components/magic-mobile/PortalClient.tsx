"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  IconCheckCircle,
  IconClock,
  IconCopy,
  IconDollar,
  IconFile,
  IconFlame,
  IconSend,
  IconTrophy,
  IconZap,
  MagicMobileDrawer,
  MagicMobileHeader,
  mmCard,
  QuickActionLink,
  StatTile,
} from "@/components/magic-mobile/MagicMobileChrome";
import { AdminAreaTabs } from "@/components/magichub/AdminAreaTabs";
import {
  AdminAuditLogRecord,
  calculateCommission,
  CommissionRecord,
  COMMISSION_RULES,
  formatCurrency,
  LeadRecord,
  LeadStatus,
  ProfileRecord,
  TrainingRecord,
} from "@/lib/magic-mobile";

type PortalView =
  | "login"
  | "dashboard"
  | "submit-lead"
  | "text-customer"
  | "my-leads"
  | "my-commissions"
  | "training"
  | "admin-dashboard"
  | "admin-leads"
  | "admin-contractors"
  | "admin-commissions";

const contractorNav = [
  { href: "/magic-mobile/dashboard", label: "Dashboard" },
  { href: "/magic-mobile/submit-lead", label: "Submit Lead" },
  { href: "/magic-mobile/text-customer", label: "Text a Customer" },
  { href: "/magic-mobile/my-leads", label: "My Leads" },
  { href: "/magic-mobile/my-commissions", label: "My Commissions" },
  { href: "/magic-mobile/training", label: "Training" },
];

const adminNav = [
  { href: "/magic-mobile/admin", label: "Admin Home" },
  { href: "/magic-mobile/admin/leads", label: "Admin Leads" },
  { href: "/magic-mobile/admin/contractors", label: "Contractors" },
  { href: "/magic-mobile/admin/commissions", label: "Admin Commissions" },
  { href: "/magichub/dashboard", label: "MagicHub" },
];

const cardClass = `${mmCard} p-4`;

const emptySubscribe = () => () => {};

function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const diff = copy.getDate() - copy.getDay();
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function startOfMonth(date: Date) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function countClosedSince(leads: LeadRecord[], sinceIso: string) {
  const since = new Date(sinceIso).getTime();
  return leads.filter((lead) => lead.status === "Closed" && new Date(lead.created_at).getTime() >= since).length;
}

function referralCodeFromUserId(userId: string) {
  return `MM-${userId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** Supabase PostgREST errors are plain objects, not `Error` instances */
function formatClientError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const msg = typeof o.message === "string" ? o.message : "";
    const code = typeof o.code === "string" ? o.code : "";
    const details = typeof o.details === "string" ? o.details : "";
    const hint = typeof o.hint === "string" ? o.hint : "";
    const parts = [msg, code && `(${code})`, details, hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isMissingTableError(err: unknown, tableName: string): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code : "";
  const msg = typeof o.message === "string" ? o.message : "";
  return code === "PGRST205" && msg.includes(`'public.${tableName}'`);
}

export default function PortalClient({ view }: { view: PortalView }) {
  const isClient = useIsClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const { supabase, supabaseError, supabaseReady } = useMemo(() => {
    if (!isClient) {
      return { supabase: null as ReturnType<typeof getSupabaseBrowserClient> | null, supabaseError: "", supabaseReady: false };
    }
    try {
      const client = getSupabaseBrowserClient();
      return { supabase: client, supabaseError: "", supabaseReady: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase client initialization failed.";
      return { supabase: null, supabaseError: message, supabaseReady: false };
    }
  }, [isClient]);

  const [loading, setLoading] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [contractors, setContractors] = useState<ProfileRecord[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogRecord[]>([]);
  const [training, setTraining] = useState<TrainingRecord[]>([]);
  const [filterContractor, setFilterContractor] = useState<string>("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    phone: "",
  });
  const [leadForm, setLeadForm] = useState({
    customer_name: "",
    customer_phone: "",
    customer_wants: "Phone",
    current_carrier: "",
    budget: "",
    notes: "",
  });
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [creatingTraining, setCreatingTraining] = useState({ title: "", content: "" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaderboardScope, setLeaderboardScope] = useState<"week" | "month">("week");
  const [adminRange, setAdminRange] = useState<"all" | "today" | "7d" | "30d">("30d");
  const [bulkLeadStatus, setBulkLeadStatus] = useState<LeadStatus>("Contacted");
  const [savedReports, setSavedReports] = useState<{ label: string; range: "all" | "today" | "7d" | "30d"; createdAt: string }[]>(
    () => {
      if (typeof window === "undefined") return [];
      try {
        const raw = window.localStorage.getItem("mm_saved_reports");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
      } catch {
        return [];
      }
    },
  );
  const [textCustomerPhone, setTextCustomerPhone] = useState("");

  const isLogin = view === "login";
  const isAdminView = view.startsWith("admin");

  const leadRefFromUrl = view === "submit-lead" ? searchParams.get("ref") : null;

  const loadPortalData = useCallback(async (userId: string) => {
    if (!supabase) {
      throw new Error("Supabase is not initialized.");
    }

    const profileRow = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    if (profileRow.error) {
      if (isMissingTableError(profileRow.error, "profiles")) {
        throw new Error(
          "The `profiles` table is missing. In Supabase → SQL Editor, run `project-dri1j/supabase/magic_mobile_schema.sql`, then run `select pg_notify('pgrst', 'reload schema');`.",
        );
      }
      throw new Error(formatClientError(profileRow.error));
    }

    let currentProfile = profileRow.data as ProfileRecord | null;

    if (!currentProfile) {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw new Error(formatClientError(userErr));
      const user = userData.user;
      if (!user || user.id !== userId) {
        throw new Error("Session user mismatch. Sign in again.");
      }
      const meta = user.user_metadata || {};
      const fullName =
        typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : null;
      const phone = typeof meta.phone === "string" && meta.phone.trim() ? meta.phone.trim() : null;

      const inserted = await supabase
        .from("profiles")
        .insert({
          id: userId,
          full_name: fullName,
          phone,
          role: "contractor",
          referral_code: referralCodeFromUserId(userId),
        })
        .select("*")
        .maybeSingle();

      if (inserted.error) {
        const retry = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
        if (!retry.error && retry.data) {
          currentProfile = retry.data as ProfileRecord;
        } else {
          throw new Error(
            inserted.error.message ||
              "Could not create your profile. Ask an admin to confirm the database schema is installed.",
          );
        }
      } else {
        currentProfile = inserted.data as ProfileRecord | null;
      }
    }

    if (!currentProfile) {
      throw new Error("Profile row not found after create. Check Supabase `profiles` table and RLS policies.");
    }

    if (currentProfile.is_active === false) {
      throw new Error("Your account is currently deactivated. Contact an admin.");
    }

    setProfile(currentProfile);

    const isAdmin = currentProfile.role === "admin";

    try {
      const leadsQuery = isAdmin
        ? await supabase.from("leads").select("*").order("created_at", { ascending: false })
        : await supabase.from("leads").select("*").eq("contractor_id", userId).order("created_at", { ascending: false });
      if (leadsQuery.error) throw new Error(formatClientError(leadsQuery.error));
      setLeads((leadsQuery.data ?? []) as LeadRecord[]);

      const commissionsQuery = isAdmin
        ? await supabase.from("commissions").select("*").order("created_at", { ascending: false })
        : await supabase
            .from("commissions")
            .select("*")
            .eq("contractor_id", userId)
            .order("created_at", { ascending: false });
      if (commissionsQuery.error) throw new Error(formatClientError(commissionsQuery.error));
      setCommissions((commissionsQuery.data ?? []) as CommissionRecord[]);

      const trainingQuery = await supabase.from("training").select("*").order("created_at", { ascending: false });
      if (trainingQuery.error) throw new Error(formatClientError(trainingQuery.error));
      setTraining((trainingQuery.data ?? []) as TrainingRecord[]);

      if (isAdmin) {
        const contractorQuery = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
        if (contractorQuery.error) throw new Error(formatClientError(contractorQuery.error));
        setContractors((contractorQuery.data ?? []) as ProfileRecord[]);
        const auditQuery = await supabase
          .from("admin_audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        if (auditQuery.error) {
          if (isMissingTableError(auditQuery.error, "admin_audit_logs")) {
            setAuditLogs([]);
          } else {
            throw new Error(formatClientError(auditQuery.error));
          }
        } else {
          setAuditLogs((auditQuery.data ?? []) as AdminAuditLogRecord[]);
        }
      } else {
        setContractors([]);
        setAuditLogs([]);
      }
    } catch (secondaryErr) {
      setLeads([]);
      setCommissions([]);
      setTraining([]);
      setContractors([]);
      setStatusMessage(
        `Your profile loaded, but some data failed to load: ${formatClientError(secondaryErr)}`,
      );
    }
  }, [supabase]);

  useEffect(() => {
    if (!isClient) return;

    let ignore = false;

    const run = async () => {
      if (!supabase) {
        if (!ignore) {
          setLoading(false);
          setStatusMessage(
            supabaseError ||
              "Supabase environment variables are missing or invalid. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or ANON_KEY) in .env.local at the project root, then restart the dev server (npm run dev).",
          );
        }
        return;
      }

      try {
        setLoading(true);
        const sessionTimeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Connection timed out. Check NEXT_PUBLIC_SUPABASE_* in .env.local.")),
            15000,
          ),
        );
        const {
          data: { session },
        } = await Promise.race([supabase.auth.getSession(), sessionTimeout]);
        const sessionUserId = session?.user?.id ?? null;
        if (ignore) return;
        setAuthUserId(sessionUserId);

        if (!sessionUserId) {
          if (!isLogin) router.push("/magic-mobile/login");
          return;
        }

        await loadPortalData(sessionUserId);
      } catch (error) {
        setStatusMessage(formatClientError(error));
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => {
      ignore = true;
    };
  }, [isClient, isLogin, loadPortalData, router, supabase, supabaseError]);

  const visibleLeads = useMemo(() => {
    const base = filterContractor === "all" ? leads : leads.filter((lead) => lead.contractor_id === filterContractor);
    const q = leadSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (lead) =>
        lead.customer_name.toLowerCase().includes(q) ||
        lead.customer_phone.toLowerCase().includes(q) ||
        (contractors.find((c) => c.id === lead.contractor_id)?.full_name ?? lead.contractor_id).toLowerCase().includes(q),
    );
  }, [contractors, filterContractor, leadSearch, leads]);

  const myClosedThisWeek = useMemo(() => {
    if (!profile) return 0;
    const weekStart = startOfWeek(new Date());
    return leads.filter(
      (lead) =>
        lead.contractor_id === profile.id &&
        lead.status === "Closed" &&
        new Date(lead.created_at).toISOString() >= weekStart,
    ).length;
  }, [leads, profile]);

  const stats = useMemo(() => {
    const closedSales = leads.filter((lead) => lead.status === "Closed").length;
    const newLeads = leads.filter((lead) => lead.status === "New").length;
    const contactedLeads = leads.filter((lead) => lead.status === "Contacted").length;
    const lostLeads = leads.filter((lead) => lead.status === "Lost").length;
    const commissionOwed = commissions.filter((item) => !item.paid).reduce((acc, item) => acc + item.amount, 0);
    const commissionPaid = commissions.filter((item) => item.paid).reduce((acc, item) => acc + item.amount, 0);
    const unpaidCommissionCount = commissions.filter((item) => !item.paid).length;
    const conversionRate = leads.length > 0 ? Math.round((closedSales / leads.length) * 100) : 0;
    return {
      totalLeads: leads.length,
      closedSales,
      newLeads,
      contactedLeads,
      lostLeads,
      commissionOwed,
      commissionPaid,
      unpaidCommissionCount,
      conversionRate,
    };
  }, [commissions, leads]);

  const greetingName = useMemo(() => {
    if (profile?.role === "admin") return "Sheridan";
    const raw = profile?.full_name?.trim();
    if (!raw) return "Consultant";
    return raw.split(/\s+/)[0] ?? "Consultant";
  }, [profile?.full_name, profile?.role]);

  const roleBadge = useMemo(() => {
    if (profile?.role === "admin") return "CEO";
    if (profile?.role === "sale_manager") return "Sale Manager";
    return "Sale Agent";
  }, [profile?.role]);

  const referralLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const code = profile?.referral_code?.trim() ?? "";
    const base = `${window.location.origin}/magic-mobile/submit-lead?ref=`;
    return code ? `${base}${encodeURIComponent(code)}` : base;
  }, [profile?.referral_code]);

  const supabaseProjectRef = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const m = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
    return m?.[1] ?? "unknown";
  }, []);

  const navLinks = useMemo(() => {
    if (!profile) return contractorNav;
    return profile.role === "admin" || profile.role === "sale_manager" ? [...contractorNav, ...adminNav] : contractorNav;
  }, [profile]);

  const contractorNameById = useMemo(() => {
    return new Map(contractors.map((c) => [c.id, c.full_name?.trim() || c.id]));
  }, [contractors]);

  const adminRangeSince = useMemo(() => {
    const now = new Date();
    if (adminRange === "all") return null;
    if (adminRange === "today") {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (adminRange === "7d") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }, [adminRange]);

  const filteredAdminLeads = useMemo(() => {
    if (!adminRangeSince) return leads;
    const sinceMs = adminRangeSince.getTime();
    return leads.filter((lead) => new Date(lead.created_at).getTime() >= sinceMs);
  }, [adminRangeSince, leads]);

  const filteredAdminCommissions = useMemo(() => {
    if (!adminRangeSince) return commissions;
    const sinceMs = adminRangeSince.getTime();
    return commissions.filter((item) => new Date(item.created_at).getTime() >= sinceMs);
  }, [adminRangeSince, commissions]);

  const topAgents = useMemo(() => {
    const tally = new Map<string, { closed: number; commission: number }>();
    for (const lead of filteredAdminLeads) {
      if (lead.status !== "Closed") continue;
      const current = tally.get(lead.contractor_id) ?? { closed: 0, commission: 0 };
      current.closed += 1;
      current.commission += lead.commission_amount ?? 0;
      tally.set(lead.contractor_id, current);
    }
    return [...tally.entries()]
      .map(([id, data]) => ({
        id,
        name: contractorNameById.get(id) ?? id,
        closed: data.closed,
        commission: data.commission,
      }))
      .sort((a, b) => b.closed - a.closed || b.commission - a.commission)
      .slice(0, 5);
  }, [contractorNameById, filteredAdminLeads]);

  const monthTrend = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const prevMonthEnd = monthStart;
    const thisMonthClosed = leads.filter(
      (lead) => lead.status === "Closed" && new Date(lead.created_at).getTime() >= monthStart,
    ).length;
    const prevMonthClosed = leads.filter((lead) => {
      const ts = new Date(lead.created_at).getTime();
      return lead.status === "Closed" && ts >= prevMonthStart && ts < prevMonthEnd;
    }).length;
    const thisMonthPayout = commissions
      .filter((item) => new Date(item.created_at).getTime() >= monthStart)
      .reduce((acc, item) => acc + item.amount, 0);
    const prevMonthPayout = commissions
      .filter((item) => {
        const ts = new Date(item.created_at).getTime();
        return ts >= prevMonthStart && ts < prevMonthEnd;
      })
      .reduce((acc, item) => acc + item.amount, 0);
    return { thisMonthClosed, prevMonthClosed, thisMonthPayout, prevMonthPayout };
  }, [commissions, leads]);

  const closedThisWeek = useMemo(() => countClosedSince(leads, startOfWeek(new Date())), [leads]);
  const closedThisMonth = useMemo(() => countClosedSince(leads, startOfMonth(new Date())), [leads]);
  const leaderboardClosed = leaderboardScope === "week" ? closedThisWeek : closedThisMonth;

  const smsHref = useMemo(() => {
    const digits = textCustomerPhone.replace(/\D/g, "");
    if (digits.length < 10) return "";
    const body = encodeURIComponent(
      "Hi! This is your Magic Mobile consultant. When is a good time for a quick call about your wireless upgrade?",
    );
    return `sms:${digits}?body=${body}`;
  }, [textCustomerPhone]);

  async function refreshAll() {
    if (!supabase) return;
    if (authUserId) await loadPortalData(authUserId);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/magic-mobile/login");
  }

  async function requestPasswordReset() {
    if (!supabase) return;
    setStatusMessage("");
    const email = resetEmail.trim() || authForm.email.trim();
    if (!email) {
      setStatusMessage("Enter your email address first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/magic-mobile/login` : undefined,
    });
    if (error) {
      setStatusMessage(error.message);
      return;
    }
    setStatusMessage("Password reset email sent. Check your inbox.");
    setAuthMode("login");
  }

  async function writeAuditLog(
    action: string,
    targetTable: string,
    targetId: string | null,
    metadata: Record<string, unknown> = {},
  ) {
    if (!supabase || !authUserId) return;
    const { error } = await supabase.from("admin_audit_logs").insert({
      actor_id: authUserId,
      action,
      target_table: targetTable,
      target_id: targetId,
      metadata,
    });
    if (error && !isMissingTableError(error, "admin_audit_logs")) {
      // Keep user flow working; surface non-schema problems for visibility.
      setStatusMessage(`Audit log write failed: ${formatClientError(error)}`);
    }
  }

  async function queueNotification(
    recipientId: string | null,
    eventType: string,
    payload: Record<string, unknown>,
    channel: "email" | "sms" | "in_app" = "in_app",
  ) {
    if (!supabase) return;
    const { error } = await supabase.from("notification_events").insert({
      recipient_id: recipientId,
      channel,
      event_type: eventType,
      payload,
    });
    if (error && !isMissingTableError(error, "notification_events")) {
      setStatusMessage(`Notification queue failed: ${formatClientError(error)}`);
    }
  }

  async function handleRegister() {
    if (!supabase) return;
    setStatusMessage("");
    const email = authForm.email.trim();
    const password = authForm.password.trim();
    const confirmPassword = authForm.confirmPassword.trim();
    const fullName = authForm.fullName.trim();
    const phone = authForm.phone.trim();
    if (!email || !password || !fullName || !phone) {
      setStatusMessage("Full name, mobile phone, email, and password are required.");
      return;
    }
    if (password.length < 6) {
      setStatusMessage("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setStatusMessage("Passwords do not match.");
      return;
    }

    const authResponse = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
        },
      },
    });
    if (authResponse.error || !authResponse.data.user) {
      setStatusMessage(authResponse.error?.message ?? "Registration failed.");
      return;
    }

    const userId = authResponse.data.user.id;
    if (authResponse.data.session) {
      const { error: profileErr } = await supabase.from("profiles").update({ phone }).eq("id", userId);
      if (profileErr) {
        setStatusMessage(`Account created. Update phone in your profile if needed: ${profileErr.message}`);
        return;
      }
    }

    setStatusMessage("Registration submitted. If email confirmation is on, check your inbox—then sign in.");
    setAuthMode("login");
    setAuthForm((prev) => ({
      ...prev,
      password: "",
      confirmPassword: "",
      fullName: "",
      phone: "",
    }));
  }

  async function handleLogin() {
    if (!supabase) return;
    setStatusMessage("");
    const email = authForm.email.trim();
    const password = authForm.password.trim();
    if (!email || !password) {
      setStatusMessage("Enter your email and password.");
      return;
    }
    const authResponse = await supabase.auth.signInWithPassword({ email, password });
    if (authResponse.error) {
      setStatusMessage(authResponse.error.message);
      return;
    }
    router.push("/magic-mobile/dashboard");
  }

  async function submitLead() {
    if (!supabase) return;
    if (!profile) return;
    const result = await supabase.from("leads").insert({
      contractor_id: profile.id,
      customer_name: leadForm.customer_name.trim(),
      customer_phone: leadForm.customer_phone.trim(),
      customer_wants: leadForm.customer_wants,
      current_carrier: leadForm.current_carrier.trim() || null,
      budget: leadForm.budget.trim() || null,
      notes: leadForm.notes.trim() || null,
      status: "New",
      commission_paid: false,
    });
    if (result.error) {
      setStatusMessage(result.error.message);
      return;
    }
    setLeadForm({
      customer_name: "",
      customer_phone: "",
      customer_wants: "Phone",
      current_carrier: "",
      budget: "",
      notes: "",
    });
    setStatusMessage("Lead submitted successfully.");
    await queueNotification(profile.id, "lead_submitted", { customer_name: leadForm.customer_name.trim() }, "in_app");
    await refreshAll();
  }

  async function updateLeadAdmin(leadId: string, patch: Partial<LeadRecord>) {
    if (!supabase) return;
    const commissionAmount = calculateCommission({
      includesPhone: Boolean(patch.phone_sold),
      includesPlan: Boolean(patch.plan_sold),
      accessoryAmount: patch.accessory_amount ?? 0,
    });
    const updatePayload = { ...patch, commission_amount: commissionAmount };

    const updateResult = await supabase.from("leads").update(updatePayload).eq("id", leadId).select("*").single();
    if (updateResult.error) {
      setStatusMessage(updateResult.error.message);
      return;
    }

    const updatedLead = updateResult.data as LeadRecord;
    const upsertResult = await supabase.from("commissions").upsert(
      {
        contractor_id: updatedLead.contractor_id,
        lead_id: updatedLead.id,
        amount: commissionAmount,
        type: "Lead Commission",
        paid: updatedLead.commission_paid,
        paid_at: updatedLead.commission_paid ? new Date().toISOString() : null,
      },
      { onConflict: "lead_id" },
    );
    if (upsertResult.error) {
      setStatusMessage(upsertResult.error.message);
      return;
    }

    await writeAuditLog("lead_updated", "leads", leadId, {
      patch,
      commissionAmount,
    });
    if (patch.status === "Closed") {
      await queueNotification(updatedLead.contractor_id, "lead_closed", { lead_id: leadId }, "in_app");
    }
    await refreshAll();
    setStatusMessage("Lead and commission updated.");
  }

  async function addTraining() {
    if (!supabase) return;
    if (!creatingTraining.title.trim() || !creatingTraining.content.trim()) {
      setStatusMessage("Training title and content are required.");
      return;
    }
    const result = await supabase.from("training").insert({
      title: creatingTraining.title.trim(),
      content: creatingTraining.content.trim(),
    });
    if (result.error) {
      setStatusMessage(result.error.message);
      return;
    }
    setCreatingTraining({ title: "", content: "" });
    await refreshAll();
  }

  async function markCommissionPaid(commissionId: string, paid: boolean) {
    if (!supabase) return;
    const result = await supabase
      .from("commissions")
      .update({ paid, paid_at: paid ? new Date().toISOString() : null })
      .eq("id", commissionId);
    if (result.error) {
      setStatusMessage(result.error.message);
      return;
    }
    await writeAuditLog(paid ? "commission_marked_paid" : "commission_marked_unpaid", "commissions", commissionId, {
      paid,
    });
    if (paid) {
      const row = commissions.find((c) => c.id === commissionId);
      await queueNotification(row?.contractor_id ?? null, "commission_paid", { commission_id: commissionId }, "in_app");
    }
    await refreshAll();
  }

  async function toggleContractorRole(contractorId: string, nextRole: "admin" | "sale_manager" | "contractor") {
    if (!supabase) return;
    const result = await supabase.from("profiles").update({ role: nextRole }).eq("id", contractorId);
    if (result.error) {
      setStatusMessage(result.error.message);
      return;
    }
    await writeAuditLog("role_changed", "profiles", contractorId, { role: nextRole });
    setStatusMessage(`Role updated to ${nextRole}.`);
    await refreshAll();
  }

  async function toggleContractorActive(contractorId: string, isActive: boolean) {
    if (!supabase) return;
    const result = await supabase.from("profiles").update({ is_active: isActive }).eq("id", contractorId);
    if (result.error) {
      setStatusMessage(result.error.message);
      return;
    }
    await writeAuditLog(isActive ? "contractor_activated" : "contractor_deactivated", "profiles", contractorId, {
      is_active: isActive,
    });
    setStatusMessage(isActive ? "Contractor activated." : "Contractor deactivated.");
    await refreshAll();
  }

  async function softDeleteLead(leadId: string, restore: boolean) {
    if (!supabase || !authUserId) return;
    const patch = restore ? { deleted_at: null, deleted_by: null } : { deleted_at: new Date().toISOString(), deleted_by: authUserId };
    const result = await supabase.from("leads").update(patch).eq("id", leadId);
    if (result.error) {
      setStatusMessage(result.error.message);
      return;
    }
    await writeAuditLog(restore ? "lead_restored" : "lead_soft_deleted", "leads", leadId, {});
    await refreshAll();
  }

  async function softDeleteCommission(commissionId: string, restore: boolean) {
    if (!supabase || !authUserId) return;
    const patch = restore ? { deleted_at: null, deleted_by: null } : { deleted_at: new Date().toISOString(), deleted_by: authUserId };
    const result = await supabase.from("commissions").update(patch).eq("id", commissionId);
    if (result.error) {
      setStatusMessage(result.error.message);
      return;
    }
    await writeAuditLog(restore ? "commission_restored" : "commission_soft_deleted", "commissions", commissionId, {});
    await refreshAll();
  }

  async function bulkUpdateFilteredLeadsStatus() {
    if (!supabase || !isAdmin) return;
    const targetLeadIds = visibleLeads
      .filter((lead) => !adminRangeSince || new Date(lead.created_at) >= adminRangeSince)
      .map((lead) => lead.id);
    if (targetLeadIds.length === 0) {
      setStatusMessage("No leads in current filters.");
      return;
    }
    const result = await supabase.from("leads").update({ status: bulkLeadStatus }).in("id", targetLeadIds);
    if (result.error) {
      setStatusMessage(result.error.message);
      return;
    }
    await writeAuditLog("bulk_lead_status_update", "leads", null, { count: targetLeadIds.length, status: bulkLeadStatus });
    setStatusMessage(`Updated ${targetLeadIds.length} lead(s) to ${bulkLeadStatus}.`);
    await refreshAll();
  }

  async function bulkMarkFilteredCommissionsPaid(paid: boolean) {
    if (!supabase || !isAdmin) return;
    const target = filteredAdminCommissions.filter((item) => item.deleted_at == null);
    if (target.length === 0) {
      setStatusMessage("No commissions in current filters.");
      return;
    }
    const result = await supabase
      .from("commissions")
      .update({ paid, paid_at: paid ? new Date().toISOString() : null })
      .in("id", target.map((c) => c.id));
    if (result.error) {
      setStatusMessage(result.error.message);
      return;
    }
    await writeAuditLog(paid ? "bulk_commissions_paid" : "bulk_commissions_unpaid", "commissions", null, {
      count: target.length,
      paid,
    });
    setStatusMessage(`Updated ${target.length} commission(s).`);
    await refreshAll();
  }

  function csvEscape(value: string | number | null | undefined): string {
    const str = value == null ? "" : String(value);
    if (/["\n,]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }

  function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const csv = [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportAdminLeadsCsv() {
    const rows = filteredAdminLeads.map((lead) => [
      lead.id,
      contractorNameById.get(lead.contractor_id) ?? lead.contractor_id,
      lead.customer_name,
      lead.customer_phone,
      lead.customer_wants,
      lead.status,
      lead.total_sale_amount ?? 0,
      lead.commission_amount ?? 0,
      lead.commission_paid ? "Paid" : "Unpaid",
      lead.created_at,
    ]);
    downloadCsv(
      `magic-mobile-admin-leads-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Lead ID",
        "Sale Agent",
        "Customer Name",
        "Customer Phone",
        "Wants",
        "Status",
        "Total Sale Amount",
        "Commission Amount",
        "Commission Status",
        "Created At",
      ],
      rows,
    );
    setStatusMessage("Leads CSV exported.");
  }

  function exportAdminCommissionsCsv() {
    const rows = filteredAdminCommissions.map((item) => [
      item.id,
      contractorNameById.get(item.contractor_id) ?? item.contractor_id,
      item.amount,
      item.type,
      item.paid ? "Paid" : "Unpaid",
      item.created_at,
      item.paid_at ?? "",
    ]);
    downloadCsv(
      `magic-mobile-admin-commissions-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Commission ID", "Sale Agent", "Amount", "Type", "Status", "Created At", "Paid At"],
      rows,
    );
    setStatusMessage("Commissions CSV exported.");
  }

  function saveCurrentReport() {
    const next = [
      {
        label: `Range ${adminRange.toUpperCase()}`,
        range: adminRange,
        createdAt: new Date().toISOString(),
      },
      ...savedReports,
    ].slice(0, 10);
    setSavedReports(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("mm_saved_reports", JSON.stringify(next));
    }
    setStatusMessage("Report view saved.");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black p-4 text-white">
        <div className="mx-auto max-w-4xl animate-pulse space-y-3">
          <div className="h-8 w-56 rounded bg-zinc-800" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="h-28 rounded-2xl bg-zinc-900" />
            <div className="h-28 rounded-2xl bg-zinc-900" />
            <div className="h-28 rounded-2xl bg-zinc-900" />
            <div className="h-28 rounded-2xl bg-zinc-900" />
          </div>
          <div className="h-40 rounded-2xl bg-zinc-900" />
        </div>
      </main>
    );
  }

  if (!supabaseReady) {
    return (
      <main className="min-h-screen bg-black px-4 py-8 text-zinc-100">
        <section className="mx-auto max-w-xl rounded-2xl border border-purple-500/40 bg-zinc-950/90 p-6 shadow-[0_0_40px_rgba(168,85,247,0.3)]">
          <h1 className="text-2xl font-semibold text-white">Magic Mobile Portal Setup Required</h1>
          <p className="mt-3 text-sm text-zinc-300">
            Supabase environment variables are missing. Add `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`, then refresh.
          </p>
          {statusMessage && <p className="mt-3 text-sm text-purple-300">{statusMessage}</p>}
        </section>
      </main>
    );
  }

  if (isLogin) {
    const inputClass =
      "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500";

    return (
      <main className="min-h-screen bg-black px-4 py-8 text-zinc-100">
        <section className="mx-auto max-w-md rounded-2xl border border-purple-500/40 bg-zinc-950/90 p-6 shadow-[0_0_40px_rgba(168,85,247,0.3)]">
          <div className="mb-6 flex items-center justify-center gap-2">
            <Image
              src="/magic-mobile-logo-transparent.png"
              alt="Magic Mobile logo"
              width={40}
              height={40}
              className="h-10 w-10 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.4)]"
            />
            <span className="text-xl font-semibold tracking-tight text-white">Magic Mobile</span>
          </div>
          <h1 className="text-center text-2xl font-semibold text-white">Magic Hub Portal</h1>
          <p className="mt-2 text-center text-sm text-zinc-400">Sign in to track leads, sales, and commissions.</p>

          {authMode === "login" ? (
            <>
              <div className="mt-6 space-y-4">
                <div>
                  <label htmlFor="mm-email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Email
                  </label>
                  <input
                    id="mm-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={inputClass}
                    value={authForm.email}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="mm-password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Password
                  </label>
                  <input
                    id="mm-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={inputClass}
                    value={authForm.password}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </div>
              </div>
              <button
                type="button"
                className="mt-6 w-full rounded-lg bg-purple-600 px-3 py-3 text-sm font-semibold text-white hover:bg-purple-500"
                onClick={handleLogin}
              >
                Sign in
              </button>
              <p className="mt-3 text-center text-sm text-zinc-400">
                <button
                  type="button"
                  className="font-medium text-purple-400 underline-offset-2 hover:text-purple-300 hover:underline"
                  onClick={() => {
                    setStatusMessage("");
                    setResetEmail(authForm.email);
                    setAuthMode("forgot");
                  }}
                >
                  Forgot password?
                </button>
              </p>
              <p className="mt-5 text-center text-sm text-zinc-400">
                New Sale Agent?{" "}
                <button
                  type="button"
                  className="font-medium text-purple-400 underline-offset-2 hover:text-purple-300 hover:underline"
                  onClick={() => {
                    setStatusMessage("");
                    setAuthMode("register");
                  }}
                >
                  Create an account
                </button>
              </p>
            </>
          ) : authMode === "forgot" ? (
            <>
              <p className="mt-4 text-center text-sm text-zinc-400">Reset your password by email</p>
              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="mm-reset-email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Email
                  </label>
                  <input
                    id="mm-reset-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={inputClass}
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                className="mt-6 w-full rounded-lg bg-purple-600 px-3 py-3 text-sm font-semibold text-white hover:bg-purple-500"
                onClick={requestPasswordReset}
              >
                Send reset link
              </button>
              <p className="mt-5 text-center text-sm text-zinc-400">
                Remembered your password?{" "}
                <button
                  type="button"
                  className="font-medium text-purple-400 underline-offset-2 hover:text-purple-300 hover:underline"
                  onClick={() => {
                    setStatusMessage("");
                    setAuthMode("login");
                  }}
                >
                  Sign in
                </button>
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-center text-sm text-zinc-400">Create your agent account</p>
              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="mm-fullname" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Full name <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="mm-fullname"
                    autoComplete="name"
                    placeholder="Jane Contractor"
                    className={inputClass}
                    value={authForm.fullName}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="mm-phone" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Mobile phone <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="mm-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="(555) 123-4567"
                    className={inputClass}
                    value={authForm.phone}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="mm-reg-email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="mm-reg-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={inputClass}
                    value={authForm.email}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="mm-reg-password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="mm-reg-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    className={inputClass}
                    value={authForm.password}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="mm-confirm" className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Confirm password <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="mm-confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    className={inputClass}
                    value={authForm.confirmPassword}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  />
                </div>
              </div>
              <button
                type="button"
                className="mt-6 w-full rounded-lg bg-purple-600 px-3 py-3 text-sm font-semibold text-white hover:bg-purple-500"
                onClick={handleRegister}
              >
                Create account
              </button>
              <p className="mt-5 text-center text-sm text-zinc-400">
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-purple-400 underline-offset-2 hover:text-purple-300 hover:underline"
                  onClick={() => {
                    setStatusMessage("");
                    setAuthMode("login");
                  }}
                >
                  Sign in
                </button>
              </p>
            </>
          )}

          {statusMessage && <p className="mt-4 text-sm text-purple-300">{statusMessage}</p>}
        </section>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-black px-4 py-8 text-zinc-100">
        <section className="mx-auto max-w-md rounded-2xl border border-purple-500/30 bg-zinc-950/90 p-6">
          <h1 className="text-lg font-semibold text-white">Couldn’t load your profile</h1>
          {statusMessage ? (
            <p className="mt-3 text-sm text-red-300">{statusMessage}</p>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">
              Try refreshing the page. If this keeps happening, sign out and sign in again after your admin has run the
              database setup.
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  }

  const isAdmin = profile.role === "admin";
  const isSaleManager = profile.role === "sale_manager";
  const canAccessAdmin = isAdmin || isSaleManager;

  if (isAdminView && !canAccessAdmin) {
    return (
      <main className="min-h-screen bg-black p-4 text-zinc-100">
        <p>Only admins and sale managers can view this page.</p>
      </main>
    );
  }

  return (
    <>
      <MagicMobileDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navItems={navLinks}
        pathname={pathname}
        onSignOut={signOut}
      />
      <main className="min-h-screen bg-black text-zinc-100">
        <MagicMobileHeader onMenuClick={() => setMenuOpen(true)} />
        <div className="mx-auto w-full max-w-7xl space-y-5 px-4 pb-12 pt-2 lg:px-8">
          {statusMessage && (
            <p className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm text-purple-100">{statusMessage}</p>
          )}

        {canAccessAdmin && isAdminView ? (
          <AdminAreaTabs isAdmin={isAdmin} managerLimited={isSaleManager && !isAdmin} />
        ) : null}

        {view === "dashboard" && (
          <>
            <section className={`${mmCard} border-purple-500/30 p-5 lg:p-6`}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-white lg:text-3xl">
                    Welcome, {greetingName} <span className="inline-block">⚡</span>
                  </h1>
                  <p className="mt-1 text-sm text-zinc-500">Track your leads, sales, and commissions</p>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:w-96">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Closed This Week</p>
                    <p className="mt-1 text-xl font-semibold text-purple-300">{myClosedThisWeek}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Role</p>
                    <p className="mt-1 text-xl font-semibold text-zinc-100">{roleBadge}</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <section className={`${mmCard} border-purple-500/25 p-4 lg:p-5`}>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                  <span className="text-purple-400">
                    <IconZap className="inline h-4 w-4" />
                  </span>
                  Your Referral Link
                </div>
                <div className="flex gap-2">
                  <input
                    readOnly
                    className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-[13px] text-zinc-300"
                    value={referralLink}
                  />
                  <button
                    type="button"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-purple-500/45 bg-zinc-950 text-purple-400 hover:bg-zinc-900"
                    onClick={() => {
                      if (!referralLink) return;
                      navigator.clipboard.writeText(referralLink);
                      setStatusMessage("Referral link copied.");
                    }}
                    aria-label="Copy referral link"
                  >
                    <IconCopy className="h-5 w-5" />
                  </button>
                </div>
              </section>

              <section className={`${mmCard} p-4 lg:p-5`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                      <IconTrophy className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Sales Leaderboard</h3>
                      <p className="text-xs text-zinc-500">Closed sales ranking</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 rounded-full border border-zinc-700 bg-zinc-950 p-0.5 text-[11px] font-medium">
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 ${
                        leaderboardScope === "week" ? "bg-black text-white" : "text-zinc-500"
                      }`}
                      onClick={() => setLeaderboardScope("week")}
                    >
                      This Week
                    </button>
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 ${
                        leaderboardScope === "month" ? "bg-black text-white" : "text-zinc-500"
                      }`}
                      onClick={() => setLeaderboardScope("month")}
                    >
                      This Month
                    </button>
                  </div>
                </div>
                <div className="mt-6 flex flex-col items-center py-4 text-center">
                  {leaderboardClosed === 0 ? (
                    <>
                      <IconFlame className="mb-2 h-10 w-10 text-zinc-600" />
                      <p className="text-sm text-zinc-500">
                        No closed sales this {leaderboardScope === "week" ? "week" : "month"} yet.
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">Go close some deals! 🔥</p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-300">
                      You closed{" "}
                      <span className="font-semibold text-white">{leaderboardClosed}</span> sale
                      {leaderboardClosed === 1 ? "" : "s"} this {leaderboardScope === "week" ? "week" : "month"}.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Total Leads" value={stats.totalLeads} icon={<IconFile className="h-5 w-5" />} />
              <StatTile
                label="Closed Sales"
                value={stats.closedSales}
                valueClassName="text-purple-400 drop-shadow-[0_0_14px_rgba(168,85,247,0.45)]"
                icon={<IconCheckCircle className="h-5 w-5" />}
              />
              <StatTile label="Owed" value={formatCurrency(stats.commissionOwed)} icon={<IconClock className="h-5 w-5" />} />
              <StatTile
                label="Paid"
                value={formatCurrency(stats.commissionPaid)}
                valueClassName="text-purple-400 drop-shadow-[0_0_14px_rgba(168,85,247,0.45)]"
                icon={<IconDollar className="h-5 w-5" />}
              />
            </div>

            <section>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Quick Actions</p>
              <div className="grid gap-3 md:grid-cols-2">
                <QuickActionLink
                  href="/magic-mobile/submit-lead"
                  title="Submit New Lead"
                  subtitle="Send a new customer referral"
                  accent="purple"
                  onNavigate={() => setMenuOpen(false)}
                  icon={<IconSend className="h-5 w-5" />}
                />
                <QuickActionLink
                  href="/magic-mobile/my-leads"
                  title="View My Leads"
                  subtitle="Track your submissions"
                  accent="zinc"
                  onNavigate={() => setMenuOpen(false)}
                  icon={<IconFile className="h-5 w-5" />}
                />
              </div>
            </section>
          </>
        )}

        {view === "submit-lead" && (
          <section className={`${cardClass} space-y-3`}>
            <div>
              <h1 className="text-xl font-semibold text-white">Submit New Lead</h1>
              <p className="text-sm text-zinc-500">Send a new customer referral</p>
            </div>
            {leadRefFromUrl && (
              <p className="rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2 text-xs text-purple-200">
                Referral detected in URL: <span className="font-mono text-purple-100">{leadRefFromUrl}</span>
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="Customer name"
                value={leadForm.customer_name}
                onChange={(e) => setLeadForm((prev) => ({ ...prev, customer_name: e.target.value }))}
              />
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="Customer phone"
                value={leadForm.customer_phone}
                onChange={(e) => setLeadForm((prev) => ({ ...prev, customer_phone: e.target.value }))}
              />
              <select
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                value={leadForm.customer_wants}
                onChange={(e) => setLeadForm((prev) => ({ ...prev, customer_wants: e.target.value }))}
              >
                <option>Phone</option>
                <option>Plan</option>
                <option>Phone + Plan</option>
                <option>Accessories</option>
              </select>
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="Current carrier"
                value={leadForm.current_carrier}
                onChange={(e) => setLeadForm((prev) => ({ ...prev, current_carrier: e.target.value }))}
              />
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="Desired budget"
                value={leadForm.budget}
                onChange={(e) => setLeadForm((prev) => ({ ...prev, budget: e.target.value }))}
              />
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="Notes"
                value={leadForm.notes}
                onChange={(e) => setLeadForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <button
              className="w-full rounded-xl bg-purple-600 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(168,85,247,0.25)] hover:bg-purple-500 sm:w-auto"
              onClick={submitLead}
            >
              Submit Lead
            </button>
          </section>
        )}

        {view === "text-customer" && (
          <section className={`${cardClass} space-y-4`}>
            <div>
              <h1 className="text-xl font-semibold text-white">Text a Customer</h1>
              <p className="text-sm text-zinc-500">Opens your SMS app with a ready-to-send opener.</p>
            </div>
            <input
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white placeholder:text-zinc-600"
              placeholder="Customer mobile number"
              inputMode="tel"
              autoComplete="tel"
              value={textCustomerPhone}
              onChange={(e) => setTextCustomerPhone(e.target.value)}
            />
            <a
              href={smsHref || undefined}
              className={`block rounded-xl py-3 text-center text-sm font-semibold ${
                smsHref ? "bg-purple-600 text-white hover:bg-purple-500" : "cursor-not-allowed bg-zinc-800 text-zinc-500"
              }`}
              aria-disabled={!smsHref}
              onClick={(e) => {
                if (!smsHref) e.preventDefault();
              }}
            >
              Open Messages
            </a>
            <p className="text-xs text-zinc-600">Enter a valid US-style mobile number (10+ digits).</p>
          </section>
        )}

        {view === "my-leads" && (
          <section className={`${cardClass} overflow-x-auto`}>
            <h2 className="mb-3 text-lg font-medium">My Leads</h2>
            <table className="min-w-full text-left text-sm">
              <thead className="text-zinc-400">
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Wants</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-zinc-800">
                    <td className="py-2">{lead.customer_name}</td>
                    <td>{lead.customer_phone}</td>
                    <td>{lead.customer_wants}</td>
                    <td>{lead.status}</td>
                    <td>{new Date(lead.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {view === "my-commissions" && (
          <>
            <section className={cardClass}>
              <h2 className="text-lg font-medium">My Commissions</h2>
              <p className="mt-2 text-sm text-zinc-300">
                Weekly bonus: {myClosedThisWeek}/{COMMISSION_RULES.weeklyBonusThreshold} closed sales this week.
              </p>
              {myClosedThisWeek >= COMMISSION_RULES.weeklyBonusThreshold && (
                <p className="mt-2 text-sm text-green-300">
                  Bonus unlocked: +{formatCurrency(COMMISSION_RULES.weeklyBonusAmount)}
                </p>
              )}
            </section>
            <section className={`${cardClass} overflow-x-auto`}>
              <table className="min-w-full text-left text-sm">
                <thead className="text-zinc-400">
                  <tr>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Paid</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((item) => (
                    <tr key={item.id} className="border-t border-zinc-800">
                      <td className="py-2">{item.type}</td>
                      <td>{formatCurrency(item.amount)}</td>
                      <td>{item.paid ? "Paid" : "Unpaid"}</td>
                      <td>{new Date(item.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        {view === "training" && (
          <>
            {isAdmin && (
              <section className={`${cardClass} space-y-2`}>
                <h2 className="text-lg font-medium">Post Training Script</h2>
                <input
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                  placeholder="Title"
                  value={creatingTraining.title}
                  onChange={(e) => setCreatingTraining((prev) => ({ ...prev, title: e.target.value }))}
                />
                <textarea
                  className="h-32 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                  placeholder="Script / content"
                  value={creatingTraining.content}
                  onChange={(e) => setCreatingTraining((prev) => ({ ...prev, content: e.target.value }))}
                />
                <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm" onClick={addTraining}>
                  Save Training
                </button>
              </section>
            )}
            <section className="space-y-3">
              {training.map((entry) => (
                <article key={entry.id} className={cardClass}>
                  <h3 className="font-medium text-white">{entry.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{entry.content}</p>
                </article>
              ))}
            </section>
          </>
        )}

        {view === "admin-dashboard" && (
          <>
            <section className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Reporting Window</p>
                <p className="text-sm text-zinc-300">Filter admin metrics and exports by date range.</p>
                <p className="mt-1 text-xs text-zinc-500">Supabase project: {supabaseProjectRef}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  ["today", "Today"],
                  ["7d", "Last 7 days"],
                  ["30d", "Last 30 days"],
                  ["all", "All time"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAdminRange(key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      adminRange === key
                        ? "border-purple-400 bg-purple-600/20 text-purple-100"
                        : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={saveCurrentReport}
                  className="rounded-full border border-purple-500/60 px-3 py-1 text-xs font-medium text-purple-200"
                >
                  Save Report View
                </button>
              </div>
            </section>
            {savedReports.length > 0 && (
              <section className={`${cardClass} space-y-2`}>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Saved Reports</p>
                <div className="flex flex-wrap gap-2">
                  {savedReports.map((r, idx) => (
                    <button
                      key={`${r.createdAt}-${idx}`}
                      type="button"
                      onClick={() => setAdminRange(r.range)}
                      className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
                    >
                      {r.label} · {new Date(r.createdAt).toLocaleDateString()}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <article className={cardClass}>
                <p className="text-xs text-zinc-400">Total leads</p>
                <p className="text-2xl font-semibold">{filteredAdminLeads.length}</p>
              </article>
              <article className={cardClass}>
                <p className="text-xs text-zinc-400">Closed sales</p>
                <p className="text-2xl font-semibold text-purple-300">
                  {filteredAdminLeads.filter((lead) => lead.status === "Closed").length}
                </p>
              </article>
              <article className={cardClass}>
                <p className="text-xs text-zinc-400">Conversion rate</p>
                <p className="text-2xl font-semibold">
                  {filteredAdminLeads.length > 0
                    ? Math.round(
                        (filteredAdminLeads.filter((lead) => lead.status === "Closed").length / filteredAdminLeads.length) *
                          100,
                      )
                    : 0}
                  %
                </p>
              </article>
              <article className={cardClass}>
                <p className="text-xs text-zinc-400">Active agents</p>
                <p className="text-2xl font-semibold">{contractors.length}</p>
              </article>
            </section>

            <section className="grid gap-3 lg:grid-cols-4">
              <article className={cardClass}>
                <p className="text-xs text-zinc-400">New leads</p>
                <p className="text-2xl font-semibold">{filteredAdminLeads.filter((lead) => lead.status === "New").length}</p>
              </article>
              <article className={cardClass}>
                <p className="text-xs text-zinc-400">Contacted</p>
                <p className="text-2xl font-semibold">
                  {filteredAdminLeads.filter((lead) => lead.status === "Contacted").length}
                </p>
              </article>
              <article className={cardClass}>
                <p className="text-xs text-zinc-400">Lost</p>
                <p className="text-2xl font-semibold">{filteredAdminLeads.filter((lead) => lead.status === "Lost").length}</p>
              </article>
              <article className={cardClass}>
                <p className="text-xs text-zinc-400">Unpaid commissions</p>
                <p className="text-lg font-semibold text-amber-300">
                  {formatCurrency(filteredAdminCommissions.filter((item) => !item.paid).reduce((acc, item) => acc + item.amount, 0))}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {filteredAdminCommissions.filter((item) => !item.paid).length} payout item(s)
                </p>
              </article>
            </section>

            <section className="grid gap-3 md:grid-cols-3">
              <QuickActionLink
                href="/magic-mobile/admin/leads"
                title="Lead Pipeline"
                subtitle="Review statuses and update sales details"
                accent="purple"
                icon={<IconFile className="h-5 w-5" />}
                onNavigate={() => setMenuOpen(false)}
              />
              <QuickActionLink
                href="/magic-mobile/admin/commissions"
                title="Commission Payouts"
                subtitle="Mark payouts paid or unpaid"
                accent="zinc"
                icon={<IconDollar className="h-5 w-5" />}
                onNavigate={() => setMenuOpen(false)}
              />
              <QuickActionLink
                href="/magic-mobile/admin/contractors"
                title="Sale Agent Directory"
                subtitle="View every agent profile and referral code"
                accent="zinc"
                icon={<IconCheckCircle className="h-5 w-5" />}
                onNavigate={() => setMenuOpen(false)}
              />
            </section>

            <section className={`${cardClass}`}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Top Sale Agents</h3>
                <p className="text-xs text-zinc-500">By closed sales in selected range</p>
              </div>
              {topAgents.length === 0 ? (
                <p className="text-sm text-zinc-500">No closed sales in this date range yet.</p>
              ) : (
                <div className="space-y-2">
                  {topAgents.map((agent, idx) => (
                    <div key={agent.id} className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2">
                      <p className="text-sm text-zinc-200">
                        <span className="mr-2 text-zinc-500">#{idx + 1}</span>
                        {agent.name}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {agent.closed} closed · {formatCurrency(agent.commission)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-3 md:grid-cols-2">
              <article className={cardClass}>
                <h3 className="text-base font-semibold text-white">Month-over-Month Trend</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-zinc-300">
                    Closed sales: <span className="font-semibold">{monthTrend.thisMonthClosed}</span> this month vs{" "}
                    <span className="font-semibold">{monthTrend.prevMonthClosed}</span> last month
                  </p>
                  <p className="text-zinc-300">
                    Commission volume: <span className="font-semibold">{formatCurrency(monthTrend.thisMonthPayout)}</span>{" "}
                    this month vs <span className="font-semibold">{formatCurrency(monthTrend.prevMonthPayout)}</span> last month
                  </p>
                </div>
              </article>
              <article className={cardClass}>
                <h3 className="text-base font-semibold text-white">Payout Reconciliation</h3>
                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                  <p>
                    Outstanding payouts:{" "}
                    <span className="font-semibold text-amber-300">
                      {formatCurrency(filteredAdminCommissions.filter((c) => !c.paid && !c.deleted_at).reduce((acc, c) => acc + c.amount, 0))}
                    </span>
                  </p>
                  <p>
                    Paid in range:{" "}
                    <span className="font-semibold text-emerald-300">
                      {formatCurrency(filteredAdminCommissions.filter((c) => c.paid && !c.deleted_at).reduce((acc, c) => acc + c.amount, 0))}
                    </span>
                  </p>
                  <p>
                    Archived payouts:{" "}
                    <span className="font-semibold">
                      {filteredAdminCommissions.filter((c) => Boolean(c.deleted_at)).length}
                    </span>
                  </p>
                </div>
              </article>
            </section>

            <section className={cardClass}>
              <h3 className="mb-3 text-base font-semibold text-white">Admin Audit Trail (latest 20)</h3>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-zinc-500">No admin activity logged yet.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="rounded-xl border border-zinc-800 px-3 py-2">
                      <p className="text-zinc-200">
                        <span className="font-medium">{log.action}</span> on {log.target_table}
                        {log.target_id ? ` (${log.target_id})` : ""}
                      </p>
                      <p className="text-xs text-zinc-500">{new Date(log.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {view === "admin-leads" && (
          <section className={`${cardClass} space-y-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium">Admin Leads</h2>
              <button
                type="button"
                onClick={exportAdminLeadsCsv}
                className="rounded-lg border border-purple-500 px-3 py-2 text-xs font-medium text-purple-200"
              >
                Export CSV
              </button>
              <select
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                value={filterContractor}
                onChange={(e) => setFilterContractor(e.target.value)}
              >
                <option value="all">All contractors</option>
                {contractors.map((contractor) => (
                  <option key={contractor.id} value={contractor.id}>
                    {contractor.full_name ?? contractor.id}
                  </option>
                ))}
              </select>
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                placeholder="Search customer/phone/agent"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
              />
              <select
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                value={bulkLeadStatus}
                onChange={(e) => setBulkLeadStatus(e.target.value as LeadStatus)}
              >
                <option>New</option>
                <option>Contacted</option>
                <option>Closed</option>
                <option>Lost</option>
              </select>
              <button
                type="button"
                className="rounded-lg border border-purple-500 px-3 py-2 text-xs font-medium text-purple-200"
                onClick={bulkUpdateFilteredLeadsStatus}
              >
                Bulk set filtered
              </button>
            </div>
            {visibleLeads.filter((lead) => !adminRangeSince || new Date(lead.created_at) >= adminRangeSince).map((lead) => (
              <article key={lead.id} className="rounded-xl border border-zinc-800 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <p className="text-sm text-zinc-300">
                    <span className="text-zinc-500">Customer:</span> {lead.customer_name}
                  </p>
                  <p className="text-sm text-zinc-300">
                    <span className="text-zinc-500">Contractor:</span> {contractorNameById.get(lead.contractor_id) ?? lead.contractor_id}
                  </p>
                  <p className="text-sm text-zinc-300">
                    <span className="text-zinc-500">State:</span> {lead.deleted_at ? "Archived" : "Active"}
                  </p>
                  <select
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    value={lead.status}
                    onChange={(e) => updateLeadAdmin(lead.id, { status: e.target.value as LeadStatus })}
                  >
                    <option>New</option>
                    <option>Contacted</option>
                    <option>Closed</option>
                    <option>Lost</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={lead.commission_paid}
                      onChange={(e) => updateLeadAdmin(lead.id, { commission_paid: e.target.checked })}
                    />
                    Commission paid
                  </label>
                  <input
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    placeholder="Phone sold"
                    defaultValue={lead.phone_sold ?? ""}
                    onBlur={(e) => updateLeadAdmin(lead.id, { phone_sold: e.target.value || null })}
                  />
                  <input
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    placeholder="Plan sold"
                    defaultValue={lead.plan_sold ?? ""}
                    onBlur={(e) => updateLeadAdmin(lead.id, { plan_sold: e.target.value || null })}
                  />
                  <input
                    type="number"
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    placeholder="Accessory amount"
                    defaultValue={lead.accessory_amount ?? 0}
                    onBlur={(e) => updateLeadAdmin(lead.id, { accessory_amount: Number(e.target.value || 0) })}
                  />
                  <input
                    type="number"
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                    placeholder="Total sale amount"
                    defaultValue={lead.total_sale_amount ?? 0}
                    onBlur={(e) => updateLeadAdmin(lead.id, { total_sale_amount: Number(e.target.value || 0) })}
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-xs"
                    onClick={() => softDeleteLead(lead.id, Boolean(lead.deleted_at))}
                  >
                    {lead.deleted_at ? "Undo archive" : "Archive"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {view === "admin-contractors" && (
          <section className={`${cardClass} overflow-x-auto`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium">Admin Contractors</h2>
              <p className="text-xs text-zinc-400">
                Pending signup profiles:{" "}
                {contractors.filter((c) => !c.full_name || !c.phone).length}
              </p>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="text-zinc-400">
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Referral</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((contractor) => (
                  <tr key={contractor.id} className="border-t border-zinc-800">
                    <td className="py-2">{contractor.full_name ?? contractor.id}</td>
                    <td>{contractor.phone ?? "-"}</td>
                    <td className="capitalize">{contractor.role === "sale_manager" ? "Sale Manager" : contractor.role}</td>
                    <td>{contractor.is_active ? "Active" : "Inactive"}</td>
                    <td>{contractor.referral_code ?? "-"}</td>
                    <td>{new Date(contractor.created_at).toLocaleDateString()}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <select
                          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                          value={contractor.role}
                          onChange={(e) =>
                            toggleContractorRole(contractor.id, e.target.value as "admin" | "sale_manager" | "contractor")
                          }
                        >
                          <option value="contractor">Sale Agent</option>
                          <option value="sale_manager">Sale Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          type="button"
                          className="rounded-lg border border-zinc-700 px-2 py-1 text-xs"
                          onClick={() => toggleContractorActive(contractor.id, !contractor.is_active)}
                        >
                          {contractor.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {view === "admin-commissions" && (
          <section className={`${cardClass} overflow-x-auto`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-medium">Admin Commissions</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => bulkMarkFilteredCommissionsPaid(true)}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs"
                >
                  Bulk mark paid
                </button>
                <button
                  type="button"
                  onClick={() => bulkMarkFilteredCommissionsPaid(false)}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs"
                >
                  Bulk mark unpaid
                </button>
                <button
                  type="button"
                  onClick={exportAdminCommissionsCsv}
                  className="rounded-lg border border-purple-500 px-3 py-2 text-xs font-medium text-purple-200"
                >
                  Export CSV
                </button>
              </div>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="text-zinc-400">
                <tr>
                  <th>Contractor</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>State</th>
                  <th>Toggle</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdminCommissions.map((item) => (
                  <tr key={item.id} className="border-t border-zinc-800">
                    <td className="py-2">{contractorNameById.get(item.contractor_id) ?? item.contractor_id}</td>
                    <td>{formatCurrency(item.amount)}</td>
                    <td>{item.paid ? "Paid" : "Unpaid"}</td>
                    <td>{item.deleted_at ? "Archived" : "Active"}</td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="rounded-lg border border-purple-500 px-3 py-1 text-xs"
                          onClick={() => markCommissionPaid(item.id, !item.paid)}
                        >
                          Mark {item.paid ? "Unpaid" : "Paid"}
                        </button>
                        <button
                          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs"
                          onClick={() => softDeleteCommission(item.id, Boolean(item.deleted_at))}
                        >
                          {item.deleted_at ? "Undo archive" : "Archive"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
    </>
  );
}
