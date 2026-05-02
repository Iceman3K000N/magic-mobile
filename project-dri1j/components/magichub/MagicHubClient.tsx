"use client";

import { startTransition, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  COMMISSION_RULES,
  formatCurrency,
  type CommissionRecord,
  type LeadRecord,
  type LeadStatus,
  type ProfileRecord,
} from "@/lib/magic-mobile";
import {
  type InventoryRecord,
  type SaleRecord,
  inventoryProfit,
  previewSaleTotalsWithCatalogPayouts,
  startOfLocalDayIso,
} from "@/lib/magichub";
import {
  getPlanById,
  planChargeDueToday,
  planLabelForSale,
  planMonthlyRecurringAmount,
} from "@/lib/magichub-catalog";
import { insertHubAuditLog } from "@/lib/magichub-audit";
import { canUseManagerPin } from "@/lib/magichub-pin-api-auth";
import { aggregateCommissionPayoutDashboard, type CommissionPayoutDashboardMetrics } from "@/lib/magichub-commission-payout";
import {
  DEFAULT_PHONE_PRICING_CATALOG,
  DEFAULT_PLAN_PRICING_CATALOG,
  DEFAULT_PRICING_SETTINGS,
  type PlanPricingEntry,
  type PhonePricingEntry,
  type PricingOverrides,
  type PricingSettings,
  canTriggerPayouts,
  computeQuotePricing,
  defaultPricingOverrides,
  mergePricingPayload,
  planPayoutFromRows,
  readPricingOverridesFromStorage,
  savePricingOverridesToStorage,
} from "@/lib/magichub-pricing";
import { SC_TAX_PRESETS } from "@/lib/magichub-sc-tax";
import {
  MAGIC_MOBILE_PROMO_PRESETS,
  aggregatePromoAnalytics,
  defaultPromoDraft,
  presetToPromoDraft,
  type PromoCodeRecord,
  type PromoDraft,
} from "@/lib/magichub-promos";
import { PlanComparisonCards } from "@/components/magichub/MagicMobilePlans";
import {
  HubCard,
  HubStat,
  hubBtnGhost,
  hubBtnPrimary,
  hubInputClass,
  MagicHubShell,
} from "@/components/magichub/MagicHubShell";
import { AdminAreaTabs } from "@/components/magic-mobile/AdminAreaTabs";
import { AdminTeamApprovals } from "@/components/magichub/manager/AdminTeamApprovals";
import type { HubConsultantRequest } from "@/lib/magichub-team";
import { ManagerHubChrome } from "@/components/magichub/manager/ManagerHubChrome";
import { ManagerDashboardContent } from "@/components/magichub/manager/ManagerDashboardContent";
import { ManagerTeamManagement } from "@/components/magichub/manager/ManagerTeamManagement";
import { ManagerInventoryReadonly } from "@/components/magichub/manager/ManagerInventoryReadonly";
import {
  ActivationBoardSection,
  CommissionPayoutSection,
  CustomersSection,
  DocumentsSection,
  ManagerQueueSection,
  OrdersSection,
  PaymentsTrackerSection,
  PlansCatalogSection,
  ReportsSection,
  SavedQuotesSection,
  SettingsSection,
  TasksSection,
} from "@/components/magichub/hubModules";
import { SaleWorkflowClient } from "@/components/magichub/SaleWorkflowClient";
import { ManagerPinProvider, ProfilePinHelp, useManagerPin } from "@/components/magichub/ManagerPinGate";

/** Avoid pulling arbitrary columns from `profiles` (PIN hashes live in a separate table). */
const PROFILE_COLUMNS = "id, full_name, phone, role, is_active, referral_code, created_at, team_manager_id";

export type MagicHubView =
  | "login"
  | "dashboard"
  | "saleWorkflow"
  | "intake"
  | "leads"
  | "customers"
  | "quotes"
  | "plans"
  | "activation"
  | "payments"
  | "orders"
  | "queue"
  | "documents"
  | "tasks"
  | "reports"
  | "settings"
  | "inventory"
  | "sales"
  | "commissions"
  | "commissionPayout"
  | "admin"
  | "adminTeam"
  | "manager"
  | "team"
  | "profile"
  | "managerInventory"
  | "pad";

const emptySubscribe = () => () => {};

function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

function formatClientError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const msg = typeof o.message === "string" ? o.message : "";
    const code = typeof o.code === "string" ? o.code : "";
    return [msg, code && `(${code})`].filter(Boolean).join(" ");
  }
  return String(err);
}

const LEAD_STATUSES: LeadStatus[] = ["New", "Contacted", "Closed", "Lost"];
function isMissingTableError(err: unknown, tableName: string): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as Record<string, unknown>;
  const code = typeof o.code === "string" ? o.code : "";
  const msg = typeof o.message === "string" ? o.message : "";
  return code === "PGRST205" && msg.includes(`'public.${tableName}'`);
}

type HubSupabaseClient = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

async function loadPricingOverridesFromDb(supabase: HubSupabaseClient): Promise<PricingOverrides> {
  const { data, error } = await supabase.from("hub_pricing_config").select("payload").eq("id", "default").maybeSingle();
  if (error) return readPricingOverridesFromStorage();
  const parsed = mergePricingPayload(data?.payload);
  savePricingOverridesToStorage(parsed);
  return parsed;
}

async function savePricingOverridesToDb(supabase: HubSupabaseClient, next: PricingOverrides, updatedBy?: string | null) {
  const { error } = await supabase.from("hub_pricing_config").upsert(
    {
      id: "default",
      payload: next,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  savePricingOverridesToStorage(next);
}

export default function MagicHubClient({
  view,
  saleStep = 1,
  resumeQuoteId = null,
}: {
  view: MagicHubView;
  saleStep?: number;
  /** Open this draft when entering Start Sale (`?quote=`). */
  resumeQuoteId?: string | null;
}) {
  const isClient = useIsClient();
  const router = useRouter();

  const { supabase, supabaseError, supabaseReady } = useMemo(() => {
    if (!isClient) {
      return { supabase: null as ReturnType<typeof getSupabaseBrowserClient> | null, supabaseError: "", supabaseReady: false };
    }
    try {
      return { supabase: getSupabaseBrowserClient(), supabaseError: "", supabaseReady: true };
    } catch (e) {
      return { supabase: null, supabaseError: e instanceof Error ? e.message : "Supabase init failed", supabaseReady: false };
    }
  }, [isClient]);

  const [loading, setLoading] = useState(true);
  /** After first `getSession` / `onAuthStateChange` so we do not treat "null user" as logged-out before hydration. */
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [contractors, setContractors] = useState<ProfileRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const [teamRequests, setTeamRequests] = useState<HubConsultantRequest[]>([]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [signupName, setSignupName] = useState("");
  const [signupRole, setSignupRole] = useState<"Consultant" | "Manager">("Consultant");

  const ceoEmail = "sheridanhart@magicmobilewireless.com";
  const isCeo = (authEmail ?? "").toLowerCase() === ceoEmail;
  const isAdmin = profile?.role === "admin" || isCeo;
  const canManage = profile?.role === "admin" || profile?.role === "sale_manager" || isCeo;
  const pinProviderEnabled = Boolean(supabase && canUseManagerPin(profile?.role, authEmail ?? undefined));

  const navForRole = useMemo(() => {
    if (!profile) return [];
    if (profile.role === "sale_manager" && !isAdmin) {
      return [
        { href: "/magichub/manager", label: "Home" },
        { href: "/magichub/team", label: "Team Management" },
        { href: "/magichub/sale/1", label: "Start Sale" },
        { href: "/magichub/customers", label: "Add Customer" },
        { href: "/magichub/queue", label: "Approval Queue" },
        { href: "/magichub/profile", label: "Profile" },
      ];
    }
    if (profile.role === "contractor" || profile.role === "store_lead") {
      return [
        { href: "/magichub/dashboard", label: "Dashboard" },
        { href: "/magichub/sale/1", label: "Start Sale" },
        { href: "/magichub/customers", label: "Customers" },
        { href: "/magichub/leads", label: "Leads" },
        { href: "/magichub/sales", label: "Submit Sale" },
        { href: "/magichub/tasks", label: "Tasks" },
      ];
    }
    const ops = [
      { href: "/magichub/dashboard", label: "Dashboard" },
      { href: "/magichub/sale/1", label: "Start Sale" },
      { href: "/magichub/intake", label: "Intake" },
      { href: "/magichub/leads", label: "Leads" },
      { href: "/magichub/customers", label: "Customers" },
      { href: "/magichub/quotes", label: "Quotes" },
      { href: "/magichub/pad", label: "Pad" },
      { href: "/magichub/plans", label: "Plans" },
      { href: "/magichub/activation", label: "Activation" },
      { href: "/magichub/sales", label: "Sales" },
      { href: "/magichub/orders", label: "Orders" },
      { href: "/magichub/payments", label: "Payments" },
      { href: "/magichub/commissions", label: "Commissions" },
      { href: "/magichub/commission-payout", label: "Payout" },
      { href: "/magichub/tasks", label: "Tasks" },
      { href: "/magichub/reports", label: "Reports" },
      { href: "/magichub/documents", label: "Docs" },
    ];
    if (!canManage) return [...ops, { href: "/magichub/profile", label: "Profile" }];
    const managed = [...ops, { href: "/magichub/inventory", label: "Inventory" }, { href: "/magichub/queue", label: "Queue" }, { href: "/magichub/admin", label: "Admin" }];
    if (isAdmin) managed.push({ href: "/magichub/admin/team", label: "Team Approvals" });
    managed.push({ href: "/magichub/settings", label: "Settings" });
    return managed;
  }, [profile, canManage, isAdmin]);

  const mobileNavForRole = useMemo(() => {
    if (!profile) return [];
    if (profile.role === "sale_manager" && !isAdmin) return [];
    if (profile.role === "contractor" || profile.role === "store_lead") {
      return [
        { href: "/magichub/dashboard", label: "Home", shortLabel: "Home", icon: "⌂" },
        { href: "/magichub/sale/1", label: "Start Sale", shortLabel: "Sale", icon: "+" },
        { href: "/magichub/leads", label: "Leads", shortLabel: "Leads", icon: "◎" },
        { href: "/magichub/tasks", label: "Tasks", shortLabel: "Tasks", icon: "☰" },
        { href: "/magichub/profile", label: "Profile", shortLabel: "You", icon: "◉" },
      ];
    }
    return [
      { href: "/magichub/dashboard", label: "Home", shortLabel: "Home", icon: "⌂" },
      { href: "/magichub/sale/1", label: "Start Sale", shortLabel: "Sale", icon: "+" },
      { href: "/magichub/queue", label: "Queue", shortLabel: "Queue", icon: "☰" },
      { href: "/magichub/admin/team", label: "Approvals", shortLabel: "Team", icon: "◎" },
      { href: "/magichub/profile", label: "Profile", shortLabel: "You", icon: "◉" },
    ];
  }, [profile, isAdmin]);

  const loadData = useCallback(async () => {
    if (!supabase || !authUserId) return;
    setLoading(true);
    setLoadError(null);
    setSecondaryError(null);

    let profileRow: ProfileRecord | null = null;
    try {
      const { data: p, error: pe } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", authUserId).maybeSingle();
      if (pe) throw pe;
      profileRow = p as ProfileRecord | null;
      if (!profileRow) {
        setLoadError("No profile found for this account.");
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(profileRow);
    } catch (e) {
      setLoadError(formatClientError(e));
      setLoading(false);
      return;
    }

    const manage = profileRow.role === "admin" || profileRow.role === "sale_manager" || isCeo;

    const optionalWarnings: string[] = [];

    try {
      const leadQuery = supabase.from("leads").select("*").order("created_at", { ascending: false });
      const { data: leadData, error: leadErr } = manage
        ? await leadQuery
        : await leadQuery.eq("contractor_id", authUserId);
      if (leadErr) throw leadErr;
      setLeads((leadData as LeadRecord[]) ?? []);

      const { data: profData, error: profErr } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .in("role", ["contractor", "sale_manager", "admin", "store_lead"])
        .order("full_name", { ascending: true });
      if (profErr) throw profErr;
      setContractors((profData as ProfileRecord[]) ?? []);

      const commQuery = supabase.from("commissions").select("*").order("created_at", { ascending: false });
      const { data: commData, error: commErr } = manage
        ? await commQuery
        : await commQuery.eq("contractor_id", authUserId);
      if (commErr) {
        if (isMissingTableError(commErr, "commissions")) {
          setCommissions([]);
          optionalWarnings.push("commissions");
        } else {
          throw commErr;
        }
      } else {
        setCommissions((commData as CommissionRecord[]) ?? []);
      }

      const invRes = await supabase.from("inventory").select("*").order("created_at", { ascending: false });
      if (invRes.error) {
        if (isMissingTableError(invRes.error, "inventory")) {
          setInventory([]);
          optionalWarnings.push("inventory");
        } else {
          throw invRes.error;
        }
      } else {
        setInventory((invRes.data as InventoryRecord[]) ?? []);
      }

      const saleQuery = supabase.from("sales").select("*").order("created_at", { ascending: false });
      const saleRes = manage ? await saleQuery : await saleQuery.eq("contractor_id", authUserId);
      if (saleRes.error) {
        if (isMissingTableError(saleRes.error, "sales")) {
          setSales([]);
          optionalWarnings.push("sales");
        } else {
          throw saleRes.error;
        }
      } else {
        setSales((saleRes.data as SaleRecord[]) ?? []);
      }

      const reqQuery = supabase.from("hub_consultant_requests").select("*").order("created_at", { ascending: false });
      const reqRes = manage ? await reqQuery : await reqQuery.eq("manager_id", authUserId);
      if (reqRes.error) {
        if (isMissingTableError(reqRes.error, "hub_consultant_requests")) {
          setTeamRequests([]);
          if (view === "adminTeam") optionalWarnings.push("hub_consultant_requests");
        } else {
          throw reqRes.error;
        }
      } else {
        setTeamRequests((reqRes.data as HubConsultantRequest[]) ?? []);
      }

      if (optionalWarnings.length > 0) {
        setSecondaryError(
          `MagicHub extension tables are missing (${optionalWarnings.join(", ")}). Run the SQL file supabase/magichub_team_approvals.sql in your Supabase SQL Editor, then run: select pg_notify('pgrst', 'reload schema');`,
        );
      }
    } catch (e) {
      setSecondaryError(formatClientError(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, authUserId, isCeo, view]);

  useEffect(() => {
    if (!supabaseReady || !supabase) return;
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setAuthUserId(data.session?.user?.id ?? null);
      setAuthEmail(data.session?.user?.email ?? null);
      setAuthInitialized(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user?.id ?? null);
      setAuthEmail(session?.user?.email ?? null);
      setAuthInitialized(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, supabaseReady]);

  useEffect(() => {
    if (!isClient || !supabaseReady) return;
    if (!authUserId) {
      queueMicrotask(() => {
        setLoading(false);
        setProfile(null);
      });
      return;
    }
    startTransition(() => {
      void loadData();
    });
  }, [authUserId, loadData, isClient, supabaseReady]);

  useEffect(() => {
    if (view === "login" && authUserId) {
      router.replace("/magichub/dashboard");
    }
  }, [view, authUserId, router]);

  /** Never call `router` during render — only after we know the session. */
  useEffect(() => {
    if (!isClient || !supabaseReady || !authInitialized) return;
    if (view === "login") return;
    if (!authUserId) {
      router.replace("/magichub/login");
    }
  }, [isClient, supabaseReady, authInitialized, view, authUserId, router]);

  /** Must run every render — do not place after conditional returns below (Rules of Hooks). */
  const payoutMetrics = useMemo(() => {
    const todayIso = startOfLocalDayIso();
    const salesToday = sales.filter((s) => new Date(s.created_at) >= new Date(todayIso));
    const totalProfitToday = salesToday.reduce((a, s) => a + Number(s.profit), 0);
    return aggregateCommissionPayoutDashboard(totalProfitToday, sales, commissions);
  }, [sales, commissions]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoadError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setLoadError(error.message);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoadError(null);
    if (!signupName.trim()) {
      setLoadError("Full name is required.");
      return;
    }
    const role = signupRole === "Manager" ? "sale_manager" : "contractor";
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: signupName.trim(),
          requested_role: role,
        },
      },
    });
    if (error) {
      setLoadError(error.message);
      return;
    }
    const uid = data.user?.id;
    if (uid) {
      // Best-effort metadata/profile sync. DB signup trigger is source of truth for role assignment.
      await supabase.from("profiles").upsert(
        {
          id: uid,
          full_name: signupName.trim(),
          role,
          is_active: true,
        },
        { onConflict: "id" },
      );
    }
    setLoadError("Account created. If email confirmation is enabled, verify your inbox before signing in.");
    setAuthMode("signin");
  }

  async function handleLogout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/magichub/login");
  }

  if (!isClient || !supabaseReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-500">
        Loading MagicHub…
      </div>
    );
  }

  if (supabaseError || !supabase) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-black px-4 text-center text-zinc-300">
        <p className="text-lg font-semibold text-white">MagicHub needs Supabase configuration</p>
        <p className="max-w-md text-sm text-zinc-500">{supabaseError || "Missing client"}</p>
      </div>
    );
  }

  if (view === "login") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
        <div className="w-full max-w-md rounded-2xl border border-purple-500/25 bg-zinc-950/90 p-8 shadow-[0_0_40px_-10px_rgba(147,51,234,0.45)]">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-purple-400">Magic Mobile</p>
          <h1 className="mt-2 text-center text-2xl font-bold text-white">MagicHub</h1>
          <p className="mt-1 text-center text-sm text-zinc-500">
            {authMode === "signin" ? "Sign in to MagicHub" : "Create your MagicHub account"}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`${authMode === "signin" ? hubBtnPrimary : hubBtnGhost} w-full`}
              onClick={() => setAuthMode("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`${authMode === "signup" ? hubBtnPrimary : hubBtnGhost} w-full`}
              onClick={() => setAuthMode("signup")}
            >
              Sign up
            </button>
          </div>
          <form className="mt-6 space-y-4" onSubmit={authMode === "signin" ? handleLogin : handleSignup}>
            {authMode === "signup" ? (
              <>
                <div>
                  <label className="text-xs text-zinc-500">Full name</label>
                  <input
                    type="text"
                    autoComplete="name"
                    className={`mt-1 ${hubInputClass}`}
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500">Role</label>
                  <select
                    className={`mt-1 ${hubInputClass}`}
                    value={signupRole}
                    onChange={(e) => setSignupRole(e.target.value as "Consultant" | "Manager")}
                  >
                    <option value="Consultant">Sales Consultant</option>
                    <option value="Manager">Manager</option>
                  </select>
                </div>
              </>
            ) : null}
            <div>
              <label className="text-xs text-zinc-500">Email</label>
              <input
                type="email"
                autoComplete="email"
                className={`mt-1 ${hubInputClass}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                className={`mt-1 ${hubInputClass}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
            <button type="submit" className={`${hubBtnPrimary} w-full`}>
              {authMode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!authInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-500">
        Checking session…
      </div>
    );
  }

  if (!authUserId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-500">
        Redirecting to sign in…
      </div>
    );
  }
  const currentUserId = authUserId;

  if (loading && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-500">
        Loading your workspace…
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-black px-4 text-center">
        <p className="text-red-400">{loadError}</p>
        <button type="button" className={hubBtnGhost} onClick={() => void loadData()}>
          Retry
        </button>
      </div>
    );
  }

  if (
    (view === "inventory" || view === "admin" || view === "adminTeam" || view === "queue" || view === "settings") &&
    !canManage
  ) {
    return (
      <MagicHubShell
        title="MagicHub"
        subtitle="Managers only"
        navItems={navForRole}
        actions={
          <button type="button" className={hubBtnGhost} onClick={() => void handleLogout()}>
            Sign out
          </button>
        }
      >
        <HubCard>
          <p className="text-zinc-300">This area is restricted to admins and sale managers.</p>
        </HubCard>
      </MagicHubShell>
    );
  }

  if (
    (profile.role === "contractor" || profile.role === "store_lead") &&
    ["admin", "adminTeam", "reports", "commissions", "commissionPayout", "inventory", "settings", "queue", "documents"].includes(view)
  ) {
    return (
      <MagicHubShell
        title="MagicHub"
        subtitle="Consultant mode"
        navItems={navForRole}
        actions={
          <button type="button" className={hubBtnGhost} onClick={() => void handleLogout()}>
            Sign out
          </button>
        }
      >
        <HubCard>
          <p className="text-zinc-300">Consultant mode allows Start Sale, Customers, Leads, Submit Sale, and Tasks only.</p>
          <Link href="/magichub/dashboard" className={`${hubBtnPrimary} mt-4 inline-block`}>
            Back to dashboard
          </Link>
        </HubCard>
      </MagicHubShell>
    );
  }

  if (
    profile.role === "sale_manager" &&
    !isAdmin &&
    (view === "inventory" || view === "admin" || view === "adminTeam" || view === "settings" || view === "commissionPayout")
  ) {
    return (
      <MagicHubShell
        title="MagicHub"
        subtitle="Manager permissions"
        navItems={navForRole}
        actions={
          <button type="button" className={hubBtnGhost} onClick={() => void handleLogout()}>
            Sign out
          </button>
        }
      >
        <HubCard>
          <p className="text-zinc-300">Managers can sell and approve, but cannot edit pricing, payouts, or admin settings.</p>
        </HubCard>
      </MagicHubShell>
    );
  }

  if (
    (view === "manager" || view === "team" || view === "managerInventory") &&
    profile.role !== "sale_manager" &&
    !isAdmin
  ) {
    return (
      <MagicHubShell
        title="MagicHub"
        subtitle="Manager only"
        navItems={navForRole}
        actions={
          <button type="button" className={hubBtnGhost} onClick={() => void handleLogout()}>
            Sign out
          </button>
        }
      >
        <HubCard>
          <p className="text-zinc-300">This area is limited to managers and admins.</p>
        </HubCard>
      </MagicHubShell>
    );
  }

  const todayIso = startOfLocalDayIso();
  const salesToday = sales.filter((s) => new Date(s.created_at) >= new Date(todayIso));
  const leadsToday = leads.filter((l) => new Date(l.created_at) >= new Date(todayIso));

  const totalSalesToday = salesToday.reduce((a, s) => a + Number(s.total_sale), 0);
  const totalProfitToday = salesToday.reduce((a, s) => a + Number(s.profit), 0);
  const phoneRevenueToday = salesToday.reduce((a, s) => a + Number(s.phone_price), 0);
  const planRevenueToday = salesToday.reduce(
    (a, s) => a + Math.max(0, Number(s.total_sale) - Number(s.phone_price) - Number(s.accessory_amount)),
    0,
  );
  const bestSellingPlan = (() => {
    const map: Record<string, number> = {};
    for (const s of salesToday) {
      const key = s.plan_name || "Unknown";
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  })();
  const bestSellingPhone = (() => {
    const map: Record<string, number> = {};
    for (const s of salesToday) {
      const key = `${formatCurrency(Number(s.phone_price))} tier`;
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  })();
  const topManagerName = contractors.find((c) => c.role === "sale_manager")?.full_name ?? "—";

  const contractorTotals: Record<string, number> = {};
  for (const s of salesToday) {
    contractorTotals[s.contractor_id] = (contractorTotals[s.contractor_id] ?? 0) + Number(s.total_sale);
  }
  let topContractorId: string | null = null;
  let topContractorAmount = 0;
  for (const [cid, amt] of Object.entries(contractorTotals)) {
    if (amt > topContractorAmount) {
      topContractorAmount = amt;
      topContractorId = cid;
    }
  }
  const topContractorName =
    topContractorId != null
      ? contractors.find((c) => c.id === topContractorId)?.full_name ?? "Contractor"
      : "—";
  const topRevenueName = topContractorName;
  const topSellerTodayName = topContractorName;
  const topUpgradesName = (() => {
    const counts: Record<string, number> = {};
    for (const s of salesToday) {
      const p = (s.plan_name ?? "").toLowerCase();
      if (!(p.includes("plus") || p.includes("max") || p.includes("unlimited"))) continue;
      counts[s.contractor_id] = (counts[s.contractor_id] ?? 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return top ? contractors.find((c) => c.id === top)?.full_name ?? "—" : "—";
  })();

  /** Matches contractor portal: admins show as CEO, not generic “Admin”. */
  const roleLabel = isAdmin
    ? "CEO"
    : profile.role === "sale_manager"
      ? "Sale Manager"
      : profile.role === "store_lead"
        ? "Store Lead"
        : "Sale Agent";
  const managerPanelView = view === "manager" || view === "team" || view === "profile" || view === "managerInventory";
  const missingTeamApprovalsTable =
    view === "adminTeam" && (secondaryError ?? "").toLowerCase().includes("hub_consultant_requests");

  if (profile.role === "sale_manager" && !isAdmin && managerPanelView) {
    const managerChrome = (
      <ManagerHubChrome
        userRole={profile.role}
        userName={profile.full_name}
        headerActions={
          <>
            <Link href="/magichub/manager#activity" className={hubBtnGhost}>
              Notifications
            </Link>
            <button type="button" className={hubBtnGhost} onClick={() => void handleLogout()}>
              Sign out
            </button>
          </>
        }
      >
        {view === "manager" ? (
          <ManagerDashboardContent
            supabase={supabase}
            managerId={profile.id}
            sales={sales}
            commissions={commissions}
            leads={leads}
            contractors={contractors}
            teamRequests={teamRequests}
            inventoryRows={inventory.map((i) => ({ id: i.id, phone_model: i.phone_model, status: i.status, imei: i.imei ?? null }))}
            onRefresh={() => void loadData()}
          />
        ) : null}
        {view === "team" ? (
          <ManagerTeamManagement
            supabase={supabase}
            managerId={profile.id}
            managerName={profile.full_name ?? "Manager"}
            teamRequests={teamRequests}
            contractors={contractors}
            sales={sales}
            onRefresh={() => void loadData()}
          />
        ) : null}
        {view === "profile" ? (
          <HubCard>
            <h2 className="text-lg font-semibold text-white">Profile</h2>
            <p className="mt-2 text-sm text-zinc-300">{profile.full_name}</p>
            <p className="text-xs text-zinc-500">{roleLabel}</p>
            <p className="mt-1 font-mono text-[11px] text-zinc-600">{profile.id}</p>
            <ProfilePinHelp enabled={pinProviderEnabled} />
            <button type="button" className={`${hubBtnGhost} mt-6`} onClick={() => void handleLogout()}>
              Sign out
            </button>
          </HubCard>
        ) : null}
        {view === "managerInventory" ? <ManagerInventoryReadonly inventory={inventory} /> : null}
      </ManagerHubChrome>
    );
    return pinProviderEnabled ? (
      <ManagerPinProvider enabled supabase={supabase}>
        {managerChrome}
      </ManagerPinProvider>
    ) : (
      managerChrome
    );
  }

  const shell = (
    <MagicHubShell
      title={view === "pad" ? "Quote Pad" : "MagicHub"}
      subtitle={`${profile.full_name ?? "User"} · ${roleLabel}`}
      variant={view === "pad" ? "pad" : "default"}
      navItems={navForRole}
      mobileNavItems={mobileNavForRole}
      actions={
        <button type="button" className={hubBtnGhost} onClick={() => void handleLogout()}>
          Sign out
        </button>
      }
      footer={
        view === "pad" ? undefined : (
          <span>Sale commission rows use MagicHub catalog payouts (consultant + manager). Run latest SQL to sync RPC.</span>
        )
      }
    >
      {secondaryError && !missingTeamApprovalsTable ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {secondaryError}
        </div>
      ) : null}

      {view === "profile" ? (
        <HubCard>
          <h2 className="text-lg font-semibold text-white">Profile</h2>
          <p className="mt-2 text-sm text-zinc-300">{profile.full_name}</p>
          <p className="text-xs text-zinc-500">{roleLabel}</p>
          <p className="mt-1 font-mono text-[11px] text-zinc-600">{profile.id}</p>
          <ProfilePinHelp enabled={pinProviderEnabled} />
          <button type="button" className={`${hubBtnGhost} mt-6`} onClick={() => void handleLogout()}>
            Sign out
          </button>
        </HubCard>
      ) : null}

      {missingTeamApprovalsTable ? (
        <HubCard className="mb-5 border-amber-500/40 bg-amber-500/10">
          <h2 className="text-lg font-semibold text-white">Team Approvals Setup Required</h2>
          <p className="mt-2 text-sm text-amber-100/90">
            Team Approvals is ready in the app, but your database is missing the onboarding table.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-amber-100/85">
            <li>Run <code className="text-amber-50">supabase/magichub_team_approvals.sql</code> in Supabase SQL Editor.</li>
            <li>Run <code className="text-amber-50">{"select pg_notify('pgrst', 'reload schema');"}</code>.</li>
            <li>Refresh this page.</li>
          </ol>
          <p className="mt-3 text-xs text-amber-200/80">
            Until this is applied, pending approvals cannot be loaded.
          </p>
        </HubCard>
      ) : null}

      {canManage && view !== "saleWorkflow" && view !== "pad" ? (
        <div className="mb-5">
          <AdminAreaTabs />
        </div>
      ) : null}

      {view === "saleWorkflow" && supabase ? (
        <SaleWorkflowClient
          step={Math.min(8, Math.max(1, saleStep))}
          resumeQuoteId={resumeQuoteId}
          supabase={supabase}
          profile={profile}
          inventory={inventory}
          leads={leads}
          contractors={contractors}
          canManage={canManage}
          authEmail={authEmail}
          onRefresh={() => void loadData()}
        />
      ) : null}

      {view === "dashboard" ? (
        <DashboardSection
          canManage={canManage}
          isManager={profile.role === "sale_manager" && !isAdmin}
          isConsultant={profile.role === "contractor" || profile.role === "store_lead"}
          sales={sales}
          commissions={commissions}
          contractors={contractors}
          roleLabel={roleLabel}
          totalSalesToday={totalSalesToday}
          totalProfitToday={totalProfitToday}
          phoneRevenueToday={phoneRevenueToday}
          planRevenueToday={planRevenueToday}
          payoutMetrics={payoutMetrics}
          leadsTodayCount={leadsToday.length}
          topContractorName={topContractorName}
          topSellerTodayName={topSellerTodayName}
          topRevenueName={topRevenueName}
          topUpgradesName={topUpgradesName}
          bestSellingPhone={bestSellingPhone}
          bestSellingPlan={bestSellingPlan}
          topManagerName={topManagerName}
          profile={profile}
        />
      ) : null}

      {view === "customers" ? (
        <CustomersSection supabase={supabase} leads={leads} canManage={canManage} authUserId={currentUserId} />
      ) : null}

      {view === "quotes" ? (
        <>
          <SavedQuotesSection supabase={supabase} profile={profile} />
          <SalesSection
            quoteOnly
            supabase={supabase}
            profile={profile}
            leads={leads}
            contractors={contractors}
            canManage={canManage}
            inventory={inventory.filter((i) => i.status === "Available")}
            onDone={() => void loadData()}
          />
        </>
      ) : null}

      {view === "pad" ? (
        <>
          <SavedQuotesSection supabase={supabase} profile={profile} />
          <SalesSection
            quoteOnly
            padLayout
            supabase={supabase}
            profile={profile}
            leads={leads}
            contractors={contractors}
            canManage={canManage}
            inventory={inventory.filter((i) => i.status === "Available")}
            onDone={() => void loadData()}
          />
        </>
      ) : null}

      {view === "plans" ? <PlansCatalogSection /> : null}

      {view === "activation" ? (
        <ActivationBoardSection supabase={supabase} sales={sales} profile={profile} canManage={canManage} />
      ) : null}

      {view === "orders" ? (
        <OrdersSection
          supabase={supabase}
          sales={sales}
          profile={profile}
          canManage={canManage}
          contractors={contractors}
          onRefresh={() => void loadData()}
        />
      ) : null}

      {view === "payments" ? (
        <PaymentsTrackerSection
          supabase={supabase}
          sales={sales}
          commissions={commissions}
          profile={profile}
          canManage={canManage}
          contractors={contractors}
        />
      ) : null}

      {view === "queue" && canManage ? (
        <ManagerQueueSection
          supabase={supabase}
          leads={leads}
          commissions={commissions}
          contractors={contractors}
          onRefresh={() => void loadData()}
        />
      ) : null}

      {view === "documents" ? <DocumentsSection supabase={supabase} profile={profile} /> : null}

      {view === "tasks" ? (
        <TasksSection leads={leads} canManage={canManage} authUserId={currentUserId} />
      ) : null}

      {view === "reports" ? (
        <ReportsSection sales={sales} leads={leads} profile={profile} canManage={canManage} />
      ) : null}

      {view === "settings" && canManage ? <SettingsSection /> : null}

      {view === "intake" ? (
        <IntakeSection
          supabase={supabase}
          profile={profile}
          contractors={contractors}
          canManage={canManage}
          onDone={() => void loadData()}
        />
      ) : null}

      {view === "leads" ? (
        <LeadsSection
          supabase={supabase}
          leads={leads}
          contractors={contractors}
          canManage={canManage}
          authUserId={currentUserId}
          onRefresh={() => void loadData()}
        />
      ) : null}

      {view === "inventory" && canManage ? (
        <InventorySection supabase={supabase} inventory={inventory} onRefresh={() => void loadData()} />
      ) : null}

      {view === "sales" ? (
        <SalesSection
          supabase={supabase}
          profile={profile}
          leads={leads}
          contractors={contractors}
          canManage={canManage}
          inventory={inventory.filter((i) => i.status === "Available")}
          onDone={() => void loadData()}
        />
      ) : null}

      {view === "commissions" ? (
        <CommissionsSection commissions={commissions} canManage={canManage} contractors={contractors} />
      ) : null}

      {view === "commissionPayout" ? (
        <CommissionPayoutSection
          supabase={supabase}
          sales={sales}
          commissions={commissions}
          contractors={contractors}
          profile={profile}
          onRefresh={() => void loadData()}
        />
      ) : null}

      {view === "admin" && canManage ? (
        <AdminSection
          supabase={supabase}
          commissions={commissions}
          sales={sales}
          leads={leads}
          contractors={contractors}
          actorId={authUserId ?? profile.id}
          onRefresh={() => void loadData()}
        />
      ) : null}
      {view === "adminTeam" ? (
        isAdmin ? (
          <AdminTeamApprovals
            supabase={supabase}
            requests={teamRequests}
            contractors={contractors}
            actorId={authUserId ?? profile.id}
            onRefresh={() => void loadData()}
          />
        ) : (
          <HubCard>
            <p className="text-sm text-zinc-400">Team Approvals is limited to admins.</p>
          </HubCard>
        )
      ) : null}
    </MagicHubShell>
  );

  return pinProviderEnabled ? (
    <ManagerPinProvider enabled supabase={supabase}>
      {shell}
    </ManagerPinProvider>
  ) : (
    shell
  );
}

function DashboardSection({
  canManage,
  isManager,
  isConsultant,
  sales,
  commissions,
  contractors,
  roleLabel,
  totalSalesToday,
  totalProfitToday,
  phoneRevenueToday,
  planRevenueToday,
  payoutMetrics,
  leadsTodayCount,
  topContractorName,
  topSellerTodayName,
  topRevenueName,
  topUpgradesName,
  bestSellingPhone,
  bestSellingPlan,
  topManagerName,
  profile,
}: {
  canManage: boolean;
  isManager: boolean;
  isConsultant: boolean;
  sales: SaleRecord[];
  commissions: CommissionRecord[];
  contractors: ProfileRecord[];
  roleLabel: string;
  totalSalesToday: number;
  totalProfitToday: number;
  phoneRevenueToday: number;
  planRevenueToday: number;
  payoutMetrics: CommissionPayoutDashboardMetrics;
  leadsTodayCount: number;
  topContractorName: string;
  topSellerTodayName: string;
  topRevenueName: string;
  topUpgradesName: string;
  bestSellingPhone: string;
  bestSellingPlan: string;
  topManagerName: string;
  profile: ProfileRecord;
}) {
  const [copied, setCopied] = useState(false);
  const [leaderboardWindow, setLeaderboardWindow] = useState<"daily" | "weekly">("daily");
  const referralHref = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/magic-mobile/refer?ref=${encodeURIComponent(profile.referral_code ?? "")}`;
  }, [profile.referral_code]);

  const quickLinks = useMemo(() => {
    if (isConsultant) {
      return [
        { href: "/magichub/sale/1", label: "Start Sale" },
        { href: "/magichub/customers", label: "Customers" },
        { href: "/magichub/leads", label: "Leads" },
        { href: "/magichub/sales", label: "Submit Sale" },
        { href: "/magichub/tasks", label: "Tasks" },
      ];
    }
    const all = [
      { href: "/magichub/sale/1", label: "Start Sale" },
      { href: "/magichub/intake", label: "Intake" },
      { href: "/magichub/leads", label: "Leads" },
      { href: "/magichub/customers", label: "Customers" },
      { href: "/magichub/quotes", label: "Quotes" },
      { href: "/magichub/pad", label: "Pad" },
      { href: "/magichub/plans", label: "Plans" },
      { href: "/magichub/activation", label: "Activation" },
      { href: "/magichub/sales", label: "Sales" },
      { href: "/magichub/orders", label: "Orders" },
      { href: "/magichub/payments", label: "Payments" },
      { href: "/magichub/tasks", label: "Tasks" },
      { href: "/magichub/documents", label: "Documents" },
    ];
    if (isManager) {
      return [
        ...all,
        { href: "/magichub/orders", label: "Team Sales" },
        { href: "/magichub/activation", label: "Activation Status" },
        { href: "/magichub/queue", label: "Approval Queue" },
        { href: "/magichub/commissions", label: "Commissions (view)" },
      ];
    }
    if (!canManage) return all;
    return [
      ...all,
      { href: "/magichub/reports", label: "Reports" },
      { href: "/magichub/commissions", label: "Commissions" },
      { href: "/magichub/commission-payout", label: "Payout" },
      { href: "/magichub/inventory", label: "Inventory" },
      { href: "/magichub/queue", label: "Queue" },
      { href: "/magichub/admin", label: "Admin" },
      { href: "/magichub/settings", label: "Settings" },
    ];
  }, [canManage, isConsultant, isManager]);
  const safeQuickLinks = useMemo(
    () =>
      Array.from(
        new Map(
          (Array.isArray(quickLinks) ? quickLinks : [])
            .filter(
              (l): l is { href: string; label: string } =>
                Boolean(l) && typeof l.href === "string" && l.href.length > 0 && typeof l.label === "string",
            )
            .map((l) => [`${l.href}::${l.label}`, l]),
        ).values(),
      ),
    [quickLinks],
  );

  const leaderboardRows = useMemo(() => {
    const cutoff = new Date();
    if (leaderboardWindow === "daily") {
      cutoff.setHours(0, 0, 0, 0);
    } else {
      const day = cutoff.getDay();
      const diff = cutoff.getDate() - day + (day === 0 ? -6 : 1);
      cutoff.setDate(diff);
      cutoff.setHours(0, 0, 0, 0);
    }
    const scopedSales = sales.filter((s) => new Date(s.created_at) >= cutoff);
    const scopedComms = commissions.filter((c) => new Date(c.created_at) >= cutoff);

    function pointsForPlan(planName: string) {
      const p = (planName || "").toLowerCase();
      if (p.includes("250") || p.includes("promo")) return 6;
      if (p.includes("70") || p.includes("unlimited")) return 4;
      if (p.includes("55") || p.includes("max")) return 3;
      if (p.includes("35") || p.includes("plus")) return 2;
      return 1;
    }
    const byId: Record<
      string,
      { sales: number; points: number; revenue: number; profit: number; commission: number; upgrades: number; streak: number }
    > = {};
    for (const s of scopedSales) {
      const id = s.contractor_id;
      if (!byId[id]) byId[id] = { sales: 0, points: 0, revenue: 0, profit: 0, commission: 0, upgrades: 0, streak: 0 };
      byId[id].sales += 1;
      const pts = pointsForPlan(s.plan_name || "");
      byId[id].points += pts;
      byId[id].revenue += Number(s.total_sale);
      byId[id].profit += Number(s.profit);
      if (pts >= 2) byId[id].upgrades += 1;
    }
    for (const c of scopedComms) {
      if (!byId[c.contractor_id]) continue;
      byId[c.contractor_id].commission += Number(c.amount);
    }
    // Hot streak: longest consecutive sale days in current window.
    const salesByContractor = new Map<string, Date[]>();
    for (const s of scopedSales) {
      const arr = salesByContractor.get(s.contractor_id) ?? [];
      arr.push(new Date(s.created_at));
      salesByContractor.set(s.contractor_id, arr);
    }
    for (const [id, dates] of salesByContractor.entries()) {
      const days = Array.from(
        new Set(dates.map((d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)),
      )
        .map((k) => new Date(k))
        .sort((a, b) => a.getTime() - b.getTime());
      let best = 1;
      let cur = 1;
      for (let i = 1; i < days.length; i++) {
        const delta = (days[i].getTime() - days[i - 1].getTime()) / (1000 * 60 * 60 * 24);
        if (delta === 1) {
          cur += 1;
          if (cur > best) best = cur;
        } else {
          cur = 1;
        }
      }
      if (byId[id]) byId[id].streak = best;
    }

    const rows = Object.entries(byId)
      .map(([id, v]) => ({
        id,
        name: contractors.find((c) => c.id === id)?.full_name ?? id.slice(0, 8),
        ...v,
      }))
      .sort((a, b) => b.points - a.points || b.sales - a.sales);
    const topSellerId = rows[0]?.id;
    const topUpgradesId = [...rows].sort((a, b) => b.upgrades - a.upgrades)[0]?.id;
    const hotStreakId = [...rows].sort((a, b) => b.streak - a.streak)[0]?.id;
    return rows.map((r) => ({
      ...r,
      badges: [
        r.id === topSellerId ? "Top Seller" : null,
        r.id === topUpgradesId && r.upgrades > 0 ? "Most Upgrades" : null,
        r.id === hotStreakId && r.streak > 1 ? "Hot Streak" : null,
      ].filter(Boolean) as string[],
    }));
  }, [leaderboardWindow, sales, commissions, contractors]);

  return (
    <div className="space-y-6">
      <HubCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Primary action</p>
            <p className="text-sm text-zinc-400">Launch a new sale workflow instantly.</p>
          </div>
          <Link href="/magichub/sale/1" className={`${hubBtnPrimary} !text-base`}>
            + START NEW SALE
          </Link>
        </div>
      </HubCard>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HubStat label="Sales today" value={formatCurrency(totalSalesToday)} />
        <HubStat label="Phone revenue" value={formatCurrency(phoneRevenueToday)} />
        <HubStat label="Plan revenue" value={formatCurrency(planRevenueToday)} />
        {!isConsultant ? <HubStat label="Gross profit" value={formatCurrency(totalProfitToday)} /> : <HubStat label="Your role" value={roleLabel} />}
      </div>
      {!isConsultant ? <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Commission payout</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <HubStat
            label="Pending payout"
            value={formatCurrency(payoutMetrics.pendingPayout)}
            hint="Unpaid & not yet eligible (gates)"
          />
          <HubStat
            label="Approved payout"
            value={formatCurrency(payoutMetrics.approvedPayout)}
            hint="Eligible & unpaid — ready to pay"
          />
          <HubStat label="Paid payout" value={formatCurrency(payoutMetrics.paidPayout)} hint="Marked paid" />
          <HubStat
            label="Consultant payout total"
            value={formatCurrency(payoutMetrics.consultantPayoutTotal)}
            hint="Eligible unpaid + paid (sale splits)"
          />
          <HubStat
            label="Manager payout total"
            value={formatCurrency(payoutMetrics.managerPayoutTotal)}
            hint="Eligible unpaid + paid (sale splits)"
          />
          <HubStat
            label="Net profit after payout"
            value={formatCurrency(payoutMetrics.netProfitAfterPayoutToday)}
            hint="Today gross profit − paid commissions"
          />
        </div>
      </div> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HubStat label="Leads today" value={String(leadsTodayCount)} />
        {canManage ? (
          <HubStat label="Top contractor (today)" value={topContractorName} hint="By sales volume" />
        ) : (
          <HubStat label="Your role" value={roleLabel} hint="Use Sales to log deals" />
        )}
        <HubStat label="Best-selling phone" value={bestSellingPhone} />
        <HubStat label="Best-selling plan" value={bestSellingPlan} />
        {!isConsultant ? <HubStat label="Top manager" value={topManagerName} /> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <HubStat label="Top seller today" value={topSellerTodayName} />
        <HubStat label="Top revenue" value={topRevenueName} />
        <HubStat label="Top upgrades" value={topUpgradesName} />
      </div>

      <HubCard>
        <p className="text-sm font-semibold text-white">Retail modules</p>
        <p className="mt-1 text-xs text-zinc-500">Jump to workflow areas.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {safeQuickLinks.map((l) => (
            <Link
              key={`${l.href}::${l.label}`}
              href={l.href}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-purple-500/25 bg-black/40 px-3 py-2 text-center text-xs font-medium text-purple-200 transition hover:border-purple-400/50 hover:bg-purple-500/10"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </HubCard>

      <HubCard>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white">Leaderboard</p>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              className={`${leaderboardWindow === "daily" ? hubBtnPrimary : hubBtnGhost} w-full`}
              onClick={() => setLeaderboardWindow("daily")}
            >
              Daily
            </button>
            <button
              type="button"
              className={`${leaderboardWindow === "weekly" ? hubBtnPrimary : hubBtnGhost} w-full`}
              onClick={() => setLeaderboardWindow("weekly")}
            >
              Weekly
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Seller</th>
                <th className="pb-2 pr-3">Sales</th>
                <th className="pb-2 pr-3">Points</th>
                {!isConsultant ? <th className="pb-2 pr-3">Revenue</th> : null}
                {!isConsultant ? <th className="pb-2 pr-3">Profit</th> : null}
                {!isConsultant ? <th className="pb-2 pr-3">Commission</th> : null}
                <th className="pb-2">Badges</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardRows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-800/70">
                  <td className="py-2 pr-3 text-white">{r.name}</td>
                  <td className="py-2 pr-3 text-zinc-300">{r.sales}</td>
                  <td className="py-2 pr-3 text-fuchsia-200">{r.points}</td>
                  {!isConsultant ? <td className="py-2 pr-3 text-emerald-200">{formatCurrency(r.revenue)}</td> : null}
                  {!isConsultant ? <td className="py-2 pr-3 text-zinc-200">{formatCurrency(r.profit)}</td> : null}
                  {!isConsultant ? <td className="py-2 pr-3 text-blue-200">{formatCurrency(r.commission)}</td> : null}
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.badges.map((b) => (
                        <span key={b} className="rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-200">
                          {b}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leaderboardRows.length === 0 ? <p className="mt-2 text-sm text-zinc-600">No sales in selected window.</p> : null}
      </HubCard>

      <HubCard>
        <p className="text-sm font-semibold text-white">Referral link</p>
        <p className="mt-1 text-xs text-zinc-500">Share this URL so customers can submit a lead under your code.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 truncate rounded-lg border border-purple-500/20 bg-black/50 px-3 py-2 text-xs text-purple-200">
            {referralHref || "…"}
          </code>
          <button
            type="button"
            className={`${hubBtnPrimary} w-full sm:w-auto`}
            onClick={() => {
              if (!referralHref) return;
              void navigator.clipboard.writeText(referralHref).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-600">Code: {profile.referral_code ?? "—"}</p>
      </HubCard>
    </div>
  );
}

function IntakeSection({
  supabase,
  profile,
  contractors,
  canManage,
  onDone,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  profile: ProfileRecord;
  contractors: ProfileRecord[];
  canManage: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [carrier, setCarrier] = useState("");
  const [budget, setBudget] = useState("");
  const [want, setWant] = useState("");
  const [notes, setNotes] = useState("");
  const [assign, setAssign] = useState(profile.id);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const contractor_id = canManage ? assign : profile.id;
    const { error } = await supabase.from("leads").insert({
      contractor_id,
      customer_name: name.trim(),
      customer_phone: phone.trim(),
      customer_wants: "Phone + Plan",
      current_carrier: carrier.trim() || null,
      budget: budget.trim() || null,
      notes: notes.trim() || null,
      what_they_want: want.trim() || null,
      status: "New",
      commission_paid: false,
    });
    setSaving(false);
    if (error) {
      setMsg(formatClientError(error));
      return;
    }
    setName("");
    setPhone("");
    setCarrier("");
    setBudget("");
    setWant("");
    setNotes("");
    setMsg("Lead saved.");
    onDone();
  }

  return (
    <HubCard>
      <h2 className="text-lg font-semibold text-white">Customer intake</h2>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        {canManage ? (
          <label className="sm:col-span-2">
            <span className="text-xs text-zinc-500">Assign contractor</span>
            <select className={`mt-1 ${hubInputClass}`} value={assign} onChange={(e) => setAssign(e.target.value)}>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span className="text-xs text-zinc-500">Name</span>
          <input className={`mt-1 ${hubInputClass}`} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          <span className="text-xs text-zinc-500">Phone</span>
          <input className={`mt-1 ${hubInputClass}`} value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label>
          <span className="text-xs text-zinc-500">Current carrier</span>
          <input className={`mt-1 ${hubInputClass}`} value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </label>
        <label>
          <span className="text-xs text-zinc-500">Budget</span>
          <input className={`mt-1 ${hubInputClass}`} value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
        <label className="sm:col-span-2">
          <span className="text-xs text-zinc-500">What they want</span>
          <textarea className={`mt-1 ${hubInputClass}`} rows={2} value={want} onChange={(e) => setWant(e.target.value)} />
        </label>
        <label className="sm:col-span-2">
          <span className="text-xs text-zinc-500">Notes</span>
          <textarea className={`mt-1 ${hubInputClass}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {msg ? <p className="sm:col-span-2 text-sm text-purple-300">{msg}</p> : null}
        <div className="sm:col-span-2">
          <button type="submit" className={hubBtnPrimary} disabled={saving}>
            {saving ? "Saving…" : "Submit lead"}
          </button>
        </div>
      </form>
    </HubCard>
  );
}

function LeadsSection({
  supabase,
  leads,
  contractors,
  canManage,
  authUserId,
  onRefresh,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  leads: LeadRecord[];
  contractors: ProfileRecord[];
  canManage: boolean;
  authUserId: string;
  onRefresh: () => void;
}) {
  const [updating, setUpdating] = useState<string | null>(null);

  async function patchLead(id: string, patch: Partial<LeadRecord>) {
    setUpdating(id);
    const { error } = await supabase.from("leads").update(patch).eq("id", id);
    setUpdating(null);
    if (error) {
      alert(formatClientError(error));
      return;
    }
    onRefresh();
  }

  return (
    <div className="space-y-4">
      {leads.map((lead) => (
        <HubCard key={lead.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-white">{lead.customer_name}</p>
              <p className="text-sm text-zinc-400">{lead.customer_phone}</p>
              {lead.what_they_want ? <p className="mt-2 text-sm text-zinc-300">{lead.what_they_want}</p> : null}
            </div>
            <label className="text-xs text-zinc-500">
              Status
              <select
                className={`mt-1 block ${hubInputClass}`}
                disabled={updating === lead.id}
                value={lead.status}
                onChange={(e) =>
                  void patchLead(lead.id, { status: e.target.value as LeadStatus })
                }
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {canManage ? (
            <label className="mt-3 block text-xs text-zinc-500">
              Contractor
              <select
                className={`mt-1 block ${hubInputClass}`}
                disabled={updating === lead.id}
                value={lead.contractor_id}
                onChange={(e) => void patchLead(lead.id, { contractor_id: e.target.value })}
              >
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name || c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="mt-3 block text-xs text-zinc-500">
            Notes
            <textarea
              className={`mt-1 block ${hubInputClass}`}
              rows={2}
              defaultValue={lead.notes ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (lead.notes ?? "")) void patchLead(lead.id, { notes: v || null });
              }}
            />
          </label>
          {!canManage && lead.contractor_id !== authUserId ? (
            <p className="mt-2 text-xs text-amber-400">Read-only: assigned to another agent.</p>
          ) : null}
        </HubCard>
      ))}
      {leads.length === 0 ? <p className="text-zinc-500">No leads yet.</p> : null}
    </div>
  );
}

function InventorySection({
  supabase,
  inventory,
  onRefresh,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  inventory: InventoryRecord[];
  onRefresh: () => void;
}) {
  const [model, setModel] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const c = Number(cost);
    const p = Number(price);
    const { error } = await supabase.from("inventory").insert({
      phone_model: model.trim(),
      cost: c,
      selling_price: p,
      status: "Available",
    });
    setSaving(false);
    if (error) {
      alert(formatClientError(error));
      return;
    }
    setModel("");
    setCost("");
    setPrice("");
    onRefresh();
  }

  return (
    <div className="space-y-6">
      <HubCard>
        <h2 className="text-lg font-semibold text-white">Add inventory</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={add}>
          <label className="sm:col-span-3">
            <span className="text-xs text-zinc-500">Phone model</span>
            <input className={`mt-1 ${hubInputClass}`} value={model} onChange={(e) => setModel(e.target.value)} required />
          </label>
          <label>
            <span className="text-xs text-zinc-500">Cost</span>
            <input
              className={`mt-1 ${hubInputClass}`}
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              required
            />
          </label>
          <label>
            <span className="text-xs text-zinc-500">Selling price</span>
            <input
              className={`mt-1 ${hubInputClass}`}
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className={hubBtnPrimary} disabled={saving}>
              Add
            </button>
          </div>
        </form>
      </HubCard>

      <div className="space-y-3">
        {inventory.map((row) => (
          <HubCard key={row.id}>
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium text-white">{row.phone_model}</p>
                <p className="text-xs text-zinc-500">
                  Cost {formatCurrency(row.cost)} · Price {formatCurrency(row.selling_price)} · Profit{" "}
                  {formatCurrency(inventoryProfit(row))}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  row.status === "Available" ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-700 text-zinc-300"
                }`}
              >
                {row.status}
              </span>
            </div>
          </HubCard>
        ))}
      </div>
    </div>
  );
}

function SalesSection({
  supabase,
  profile,
  leads,
  contractors,
  canManage,
  inventory,
  onDone,
  quoteOnly = false,
  padLayout = false,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  profile: ProfileRecord;
  leads: LeadRecord[];
  contractors: ProfileRecord[];
  canManage: boolean;
  inventory: InventoryRecord[];
  onDone: () => void;
  /** Same form as Sales but no submit — use to build a quote, then finalize on Sales. */
  quoteOnly?: boolean;
  /** Tablet floor quote layout (royal blue / silver accents). */
  padLayout?: boolean;
}) {
  const [pricingSettings, setPricingSettings] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS);
  const [phoneRows, setPhoneRows] = useState<PhonePricingEntry[]>(DEFAULT_PHONE_PRICING_CATALOG);
  const [planRows, setPlanRows] = useState<PlanPricingEntry[]>(DEFAULT_PLAN_PRICING_CATALOG);
  const [leadId, setLeadId] = useState<string>("");
  const [invId, setInvId] = useState<string>("");
  const [phoneCatalogId, setPhoneCatalogId] = useState<string>(DEFAULT_PHONE_PRICING_CATALOG[0]?.id ?? "");
  const [planId, setPlanId] = useState<string | null>("mm-starter");
  const [firstMonthFree, setFirstMonthFree] = useState(false);
  const [includeCase, setIncludeCase] = useState(false);
  const [includeCharger, setIncludeCharger] = useState(false);
  const [includeScreenProtector, setIncludeScreenProtector] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [taxPresetId, setTaxPresetId] = useState(SC_TAX_PRESETS[0]?.id ?? "sc-state-only");
  const [taxPercent, setTaxPercent] = useState(String(SC_TAX_PRESETS[0]?.totalPercent ?? 6));
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [incPhone, setIncPhone] = useState(true);
  const [incPlan, setIncPlan] = useState(true);
  const preferredContractorId =
    canManage && contractors.length > 0 ? contractors[0].id : profile.id;
  const [saleAgentOverride, setSaleAgentOverride] = useState<string | null>(null);
  const saleAgentId = saleAgentOverride ?? preferredContractorId;
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const persisted = await loadPricingOverridesFromDb(supabase);
      if (cancelled) return;
      setPricingSettings(persisted.settings);
      setPhoneRows(persisted.phoneRows);
      setPlanRows(persisted.planRows);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const selectedInv = inventory.find((i) => i.id === invId);
  const selectedPhoneCatalog = phoneRows.find((p) => p.id === phoneCatalogId);
  const planEntry = getPlanById(planId);
  const selectedPlanOverride = planRows.find((p) => p.id === planId);
  const planChargeToday =
    selectedPlanOverride?.oneTimePrice != null
      ? selectedPlanOverride.oneTimePrice
      : firstMonthFree
        ? 0
        : (selectedPlanOverride?.priceMonthly ?? planChargeDueToday(planEntry, firstMonthFree));
  const planMrc =
    selectedPlanOverride?.oneTimePrice != null
      ? 0
      : (selectedPlanOverride?.priceMonthly ?? planMonthlyRecurringAmount(planEntry));
  const caseAmount = includeCase ? pricingSettings.addons.casePrice : 0;
  const chargerAmount = includeCharger ? pricingSettings.addons.chargerPrice : 0;
  const screenAmount = includeScreenProtector ? pricingSettings.addons.screenProtectorPrice : 0;
  const accessoryAmount = caseAmount + chargerAmount + screenAmount;
  const selectedPhoneSell = selectedInv?.selling_price ?? selectedPhoneCatalog?.sellPriceHigh ?? 0;
  const selectedPhoneBuy = selectedInv?.cost ?? selectedPhoneCatalog?.buyPriceHigh ?? 0;
  const phoneCommission = selectedPhoneCatalog
    ? { consultant: selectedPhoneCatalog.consultantPayout, manager: selectedPhoneCatalog.managerPayout }
    : { consultant: 0, manager: 0 };
  const planCommission = selectedPlanOverride
    ? { consultant: selectedPlanOverride.consultantPayout, manager: selectedPlanOverride.managerPayout }
    : planPayoutFromRows(planId, planRows);
  const accessoryCommission =
    accessoryAmount > 0 ? Number((accessoryAmount * COMMISSION_RULES.accessoriesRate).toFixed(2)) : 0;
  const payoutByCatalog = {
    consultant:
      (incPhone ? phoneCommission.consultant : 0) +
      (incPlan ? planCommission.consultant : 0) +
      accessoryCommission,
    manager: (incPhone ? phoneCommission.manager : 0) + (incPlan ? planCommission.manager : 0),
  };
  const quote = computeQuotePricing({
    phoneSellPrice: selectedPhoneSell,
    phoneBuyPrice: selectedPhoneBuy,
    planChargeToday,
    planMonthlyRecurring: planMrc,
    activationFee: pricingSettings.activationFee,
    casePrice: caseAmount,
    chargerPrice: chargerAmount,
    screenProtectorPrice: screenAmount,
    discount: Number(discount) || 0,
    taxPercent: Number(taxPercent) || 0,
    consultantPayout: payoutByCatalog.consultant,
    managerPayout: payoutByCatalog.manager,
  });
  const payoutLifecycleEligible = canTriggerPayouts({
    saleStatus: "approved",
    activationStatus: "completed",
    paymentStatus: "paid",
    bundledWithService: Boolean(planId && incPlan),
    phoneReturned: false,
  });
  const preview =
    selectedPhoneSell > 0
      ? previewSaleTotalsWithCatalogPayouts({
          sellingPrice: selectedPhoneSell,
          inventoryCost: selectedPhoneBuy,
          accessoryAmount,
          planChargeToday,
          consultantPayout: payoutByCatalog.consultant,
          managerPayout: payoutByCatalog.manager,
        })
      : null;

  function applyLead(id: string) {
    setLeadId(id);
    const L = leads.find((l) => l.id === id);
    if (L) {
      setCustName(L.customer_name);
      setCustPhone(L.customer_phone);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (quoteOnly) {
      setMsg("Preview only — go to Sales to record the deal in the system.");
      return;
    }
    if (!quoteOnly && !invId) {
      setMsg("Select a phone from inventory.");
      return;
    }
    setSaving(true);
    setMsg(null);
    const { data, error } = await supabase.rpc("create_magichub_sale", {
      p_inventory_id: invId,
      p_lead_id: leadId || null,
      p_plan_name: planLabelForSale(planEntry),
      p_accessory_amount: accessoryAmount,
      p_includes_phone: incPhone,
      p_includes_plan: incPlan,
      p_customer_name: custName.trim(),
      p_customer_phone: custPhone.trim(),
      p_contractor_id: canManage ? saleAgentId : null,
      p_discount: Number(discount) || 0,
      p_plan_charge_today: planChargeToday,
      p_consultant_payout: payoutByCatalog.consultant,
      p_manager_payout: payoutByCatalog.manager,
      p_bundled_with_service: Boolean(planId && incPlan),
      p_tax_rate_percent: Number(taxPercent) || 0,
      p_taxable_subtotal: quote.taxableSubtotalBeforeTax,
      p_total_tax: quote.taxes,
    });
    setSaving(false);
    if (error) {
      setMsg(formatClientError(error));
      return;
    }
    setMsg(`Sale recorded (${String(data).slice(0, 8)}…)`);
    onDone();
  }

  const myLeads = leads.filter((l) => l.contractor_id === profile.id);

  return (
    <HubCard
      className={
        padLayout
          ? "border-blue-500/30 bg-gradient-to-b from-slate-950/90 to-[#0a1628]/90 p-5 shadow-[0_0_32px_-8px_rgba(59,130,246,0.25)] md:p-8"
          : ""
      }
    >
      <h2 className={`font-semibold text-white ${padLayout ? "text-2xl" : "text-lg"}`}>
        {quoteOnly ? "Quote builder" : "New sale"}
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        {quoteOnly
          ? "Build a customer-facing quote. Nothing is saved until you complete a sale on the Sales tab."
          : "Payouts follow Admin pricing (phone + plan rows) plus 10% on accessories. SC tax preset below. Totals update live."}
      </p>
      {quoteOnly ? (
        <p className="mt-2 text-sm text-purple-300/90">
          <Link href="/magichub/sales" className="underline decoration-purple-500/50 underline-offset-2">
            Open Sales to finalize →
          </Link>
        </p>
      ) : null}
      <form className="mt-6 space-y-4" onSubmit={submit}>
        {canManage ? (
          <label className="block">
            <span className="text-xs text-zinc-500">Credit sale to</span>
            <select
              className={`mt-1 ${hubInputClass}`}
              value={saleAgentId}
              onChange={(e) => setSaleAgentOverride(e.target.value)}
            >
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block">
          <span className="text-xs text-zinc-500">Customer (lead)</span>
          <select className={`mt-1 ${hubInputClass}`} value={leadId} onChange={(e) => applyLead(e.target.value)}>
            <option value="">— Optional —</option>
            {(profile.role === "contractor" || profile.role === "store_lead" ? myLeads : leads).map((l) => (
              <option key={l.id} value={l.id}>
                {l.customer_name} · {l.customer_phone}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-zinc-500">Customer name</span>
          <input className={`mt-1 ${hubInputClass}`} value={custName} onChange={(e) => setCustName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-500">Customer phone</span>
          <input className={`mt-1 ${hubInputClass}`} value={custPhone} onChange={(e) => setCustPhone(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-500">Phone catalog (pricing reference)</span>
          <select className={`mt-1 ${hubInputClass}`} value={phoneCatalogId} onChange={(e) => setPhoneCatalogId(e.target.value)}>
            {phoneRows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.brand} · {p.model} · {formatCurrency(p.sellPriceLow)}-{formatCurrency(p.sellPriceHigh)} · {p.status}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-zinc-500">Phone (inventory for finalized sales)</span>
          <select className={`mt-1 ${hubInputClass}`} value={invId} onChange={(e) => setInvId(e.target.value)} required={!quoteOnly}>
            <option value="">{quoteOnly ? "Optional for quote" : "Select device"}</option>
            {inventory.map((i) => (
              <option key={i.id} value={i.id}>
                {i.phone_model} · {formatCurrency(i.selling_price)}
              </option>
            ))}
          </select>
        </label>
        <div className="block">
          <span className="text-xs text-zinc-500">Plan — select one</span>
          <div className="mt-3">
            <PlanComparisonCards
              selectedId={planId}
              onSelect={(p) => {
                setPlanId(p.id);
                if (p.billing === "prepaid_term") setFirstMonthFree(false);
              }}
            />
          </div>
          {planEntry?.billing !== "prepaid_term" ? (
            <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={firstMonthFree}
                onChange={(e) => setFirstMonthFree(e.target.checked)}
              />
              First month free (waives plan charge from due today)
            </label>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">Prepaid plan: one-time plan amount is due today; no monthly plan charge from this promo.</p>
          )}
        </div>
        <label className="block">
          <span className="text-xs text-zinc-500">Activation fee</span>
          <input className={`mt-1 ${hubInputClass}`} value={pricingSettings.activationFee} readOnly />
        </label>
        <div className="grid gap-2 rounded-xl border border-blue-500/20 bg-blue-950/20 p-3 text-sm text-zinc-200">
          <label className="flex items-center justify-between gap-2">
            <span>Case ({formatCurrency(pricingSettings.addons.casePrice)})</span>
            <input type="checkbox" checked={includeCase} onChange={(e) => setIncludeCase(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Charger ({formatCurrency(pricingSettings.addons.chargerPrice)})</span>
            <input type="checkbox" checked={includeCharger} onChange={(e) => setIncludeCharger(e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>Screen protector ({formatCurrency(pricingSettings.addons.screenProtectorPrice)})</span>
            <input
              type="checkbox"
              checked={includeScreenProtector}
              onChange={(e) => setIncludeScreenProtector(e.target.checked)}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-zinc-500">Discount ($)</span>
          <input className={`mt-1 ${hubInputClass}`} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-500">SC sales tax (state + local presets — verify at sale time)</span>
          <select
            className={`mt-1 ${hubInputClass}`}
            value={taxPresetId}
            onChange={(e) => {
              const nextId = e.target.value;
              setTaxPresetId(nextId);
              if (nextId !== "sc-custom") {
                const preset = SC_TAX_PRESETS.find((p) => p.id === nextId);
                if (preset) setTaxPercent(String(preset.totalPercent));
              }
            }}
          >
            {SC_TAX_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {taxPresetId === "sc-custom" ? (
          <label className="block">
            <span className="text-xs text-zinc-500">Custom tax %</span>
            <input
              className={`mt-1 ${hubInputClass}`}
              inputMode="decimal"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
            />
          </label>
        ) : null}
        <div className="flex flex-wrap gap-4 text-sm text-zinc-300">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={incPhone} onChange={(e) => setIncPhone(e.target.checked)} />
            Count phone row toward commission
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={incPlan} onChange={(e) => setIncPlan(e.target.checked)} />
            Count plan row toward commission
          </label>
        </div>

        {preview ? (
          <div className="rounded-xl border border-blue-500/30 bg-gradient-to-br from-black via-blue-950/20 to-black p-4 text-sm text-zinc-200">
            <p className="font-medium text-white">
              Plan: {planEntry ? planLabelForSale(planEntry) : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Plan due today: {formatCurrency(planChargeToday)}
              {planMrc > 0 ? (
                <>
                  {" "}
                  · Monthly recurring: {formatCurrency(planMrc)}
                </>
              ) : planEntry?.billing === "prepaid_term" ? (
                <> · Monthly recurring: prepaid (no MRC)</>
              ) : null}
            </p>
            <p className="mt-3">Selected customer: {custName || "—"}</p>
            <p>Selected phone: {selectedInv?.phone_model ?? selectedPhoneCatalog?.model ?? "—"}</p>
            <p>Taxable subtotal (before tax): {formatCurrency(quote.taxableSubtotalBeforeTax)}</p>
            <p>Activation + add-ons: {formatCurrency(pricingSettings.activationFee + accessoryAmount)}</p>
            <p>Discount: {formatCurrency(Number(discount) || 0)} · Sales tax: {formatCurrency(quote.taxes)}</p>
            <p className="text-lg font-semibold text-white">Total due today: {formatCurrency(quote.totalDueToday)}</p>
            <p>Monthly recurring total: {formatCurrency(quote.monthlyRecurringTotal)}</p>
            <p>Estimated gross profit: {formatCurrency(quote.grossProfit)}</p>
            <p>Consultant payout: {formatCurrency(quote.consultantPayout)}</p>
            <p>Manager payout: {formatCurrency(quote.managerPayout)}</p>
            <p>Net profit after payout: {formatCurrency(quote.netProfitAfterPayout)}</p>
            <p className="text-xs text-blue-200/90">
              Payout gate (DB): {payoutLifecycleEligible ? "Would be eligible at approved + completed activation + paid" : "Not eligible under current rules preview"}
            </p>
          </div>
        ) : null}

        {msg ? <p className="text-sm text-purple-300">{msg}</p> : null}

        {quoteOnly ? (
          <p className="text-sm text-zinc-500">This screen is for pricing preview only.</p>
        ) : (
          <button type="submit" className={hubBtnPrimary} disabled={saving || inventory.length === 0}>
            {saving ? "Saving…" : "Complete sale"}
          </button>
        )}
        {!quoteOnly && inventory.length === 0 ? (
          <p className="text-xs text-amber-400">No phones in stock. Ask a manager to add inventory.</p>
        ) : null}
      </form>
    </HubCard>
  );
}

function CommissionsSection({
  commissions,
  canManage,
  contractors,
}: {
  commissions: CommissionRecord[];
  canManage: boolean;
  contractors: ProfileRecord[];
}) {
  const name = (id: string) => contractors.find((c) => c.id === id)?.full_name ?? id.slice(0, 8);
  return (
    <div className="space-y-3">
      {commissions.map((c) => (
        <HubCard key={c.id}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-white">{formatCurrency(c.amount)}</p>
              <p className="text-xs text-zinc-500">
                {c.type}
                {canManage ? ` · ${name(c.contractor_id)}` : ""} · {c.paid ? "Paid" : "Unpaid"}
              </p>
              <p className="text-xs text-zinc-600">{new Date(c.created_at).toLocaleString()}</p>
            </div>
          </div>
        </HubCard>
      ))}
      {commissions.length === 0 ? <p className="text-zinc-600">No commission records yet.</p> : null}
    </div>
  );
}

function AdminSection({
  supabase,
  commissions,
  sales,
  leads,
  contractors,
  actorId,
  onRefresh,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  commissions: CommissionRecord[];
  sales: SaleRecord[];
  leads: LeadRecord[];
  contractors: ProfileRecord[];
  actorId: string;
  onRefresh: () => void;
}) {
  const { ensureUnlocked } = useManagerPin();
  const [filter, setFilter] = useState<string>("all");
  const [phoneRows, setPhoneRows] = useState<PhonePricingEntry[]>(defaultPricingOverrides().phoneRows);
  const [planRows, setPlanRows] = useState<PlanPricingEntry[]>(defaultPricingOverrides().planRows);
  const [pricingSettings, setPricingSettings] = useState<PricingSettings>(defaultPricingOverrides().settings);
  const [promoRows, setPromoRows] = useState<PromoCodeRecord[]>([]);
  const [promoDraft, setPromoDraft] = useState<PromoDraft>(() => defaultPromoDraft());

  const contractorName = (id: string) => contractors.find((c) => c.id === id)?.full_name ?? id.slice(0, 8);

  const filteredSales =
    filter === "all" ? sales : sales.filter((s) => s.contractor_id === filter);
  const filteredCommissions =
    filter === "all" ? commissions : commissions.filter((c) => c.contractor_id === filter);
  const filteredLeads =
    filter === "all" ? leads : leads.filter((l) => l.contractor_id === filter);
  const promoAnalytics = useMemo(() => aggregatePromoAnalytics(promoRows, sales), [promoRows, sales]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const persisted = await loadPricingOverridesFromDb(supabase);
      if (cancelled) return;
      setPhoneRows(persisted.phoneRows);
      setPlanRows(persisted.planRows);
      setPricingSettings(persisted.settings);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("hub_promo_codes").select("*").order("created_at", { ascending: false });
      if (cancelled || error) return;
      setPromoRows((data ?? []) as PromoCodeRecord[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function savePricingOverrides() {
    if (!(await ensureUnlocked())) return;
    try {
      const { data: row } = await supabase.from("hub_pricing_config").select("payload").eq("id", "default").maybeSingle();
      const before = mergePricingPayload(row?.payload);
      const after = { phoneRows, planRows, settings: pricingSettings };
      await savePricingOverridesToDb(supabase, after);
      await insertHubAuditLog(supabase, actorId, {
        action: "hub_pricing_config_upsert",
        entity_type: "hub_pricing_config",
        entity_id: "default",
        before,
        after,
      });
      alert("Pricing overrides saved to Supabase.");
    } catch (e) {
      alert(`Failed to save pricing to Supabase: ${formatClientError(e)}`);
    }
  }

  async function togglePaid(c: CommissionRecord, paid: boolean) {
    if (!(await ensureUnlocked())) return;
    const { error } = await supabase
      .from("commissions")
      .update({
        paid,
        paid_at: paid ? new Date().toISOString() : null,
      })
      .eq("id", c.id);
    if (error) {
      alert(formatClientError(error));
      return;
    }
    onRefresh();
  }

  async function selectPromoPreset(code: string) {
    if (!(await ensureUnlocked())) return;
    const preset = presetToPromoDraft(code);
    if (!preset) return;
    setPromoDraft(preset);
    await insertHubAuditLog(supabase, actorId, {
      action: "promo_preset_selected",
      entity_type: "hub_promo_codes",
      entity_id: code,
      after: preset,
    });
  }

  async function savePromo(status: "active" | "draft") {
    if (!(await ensureUnlocked())) return;
    if (!promoDraft.code.trim()) {
      alert("Promo code is required.");
      return;
    }
    const payload = {
      code: promoDraft.code.trim().toUpperCase(),
      type: promoDraft.type,
      status,
      amount_off: Number(promoDraft.amount_off ?? 0),
      free_month: Boolean(promoDraft.free_month),
      free_addon_case: Boolean(promoDraft.free_addon_case),
      applies_to: promoDraft.applies_to,
      rule_text: promoDraft.rule_text ?? "",
      starts_at: promoDraft.starts_at,
      expires_at: promoDraft.expires_at,
      usage_limit: promoDraft.usage_limit,
      notes: promoDraft.notes ?? "",
      admin_approval_required: Boolean(promoDraft.admin_approval_required),
      manager_only: Boolean(promoDraft.manager_only),
      customer_type: promoDraft.customer_type ?? "all",
      allow_stacking: Boolean(promoDraft.allow_stacking),
      max_stack_count: Number(promoDraft.max_stack_count ?? 1),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("hub_promo_codes")
      .upsert(payload, { onConflict: "code" })
      .select("*")
      .single();
    if (error) {
      alert(formatClientError(error));
      return;
    }
    setPromoRows((prev) => [data as PromoCodeRecord, ...prev.filter((p) => p.code !== data.code)]);
    await insertHubAuditLog(supabase, actorId, {
      action: "promo_saved",
      entity_type: "hub_promo_codes",
      entity_id: String((data as PromoCodeRecord).id),
      after: data as Record<string, unknown>,
    });
    alert(`Promo ${payload.code} saved as ${status.toUpperCase()}.`);
  }

  return (
    <div className="space-y-8">
      <HubCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Admin editable pricing</h2>
            <p className="text-xs text-zinc-500">Update phone/plan pricing, payouts, add-ons, activation, badges, and special order statuses.</p>
          </div>
          <button type="button" className={hubBtnPrimary} onClick={savePricingOverrides}>
            Save pricing overrides
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <label className="text-xs text-zinc-500">
            Activation fee
            <input
              className={`mt-1 ${hubInputClass}`}
              inputMode="decimal"
              value={pricingSettings.activationFee}
              onChange={(e) => setPricingSettings((p) => ({ ...p, activationFee: Number(e.target.value) || 0 }))}
            />
          </label>
          <label className="text-xs text-zinc-500">
            Case price
            <input
              className={`mt-1 ${hubInputClass}`}
              inputMode="decimal"
              value={pricingSettings.addons.casePrice}
              onChange={(e) =>
                setPricingSettings((p) => ({ ...p, addons: { ...p.addons, casePrice: Number(e.target.value) || 0 } }))
              }
            />
          </label>
          <label className="text-xs text-zinc-500">
            Charger price
            <input
              className={`mt-1 ${hubInputClass}`}
              inputMode="decimal"
              value={pricingSettings.addons.chargerPrice}
              onChange={(e) =>
                setPricingSettings((p) => ({ ...p, addons: { ...p.addons, chargerPrice: Number(e.target.value) || 0 } }))
              }
            />
          </label>
          <label className="text-xs text-zinc-500">
            Screen protector
            <input
              className={`mt-1 ${hubInputClass}`}
              inputMode="decimal"
              value={pricingSettings.addons.screenProtectorPrice}
              onChange={(e) =>
                setPricingSettings((p) => ({
                  ...p,
                  addons: { ...p.addons, screenProtectorPrice: Number(e.target.value) || 0 },
                }))
              }
            />
          </label>
        </div>
      </HubCard>
      <HubCard>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-fuchsia-200">Promo Codes Tab</h3>
        <p className="mt-1 text-xs text-zinc-500">Magic Mobile Promo Presets + advanced promo controls.</p>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Magic Mobile Promo Presets</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MAGIC_MOBILE_PROMO_PRESETS.map((p) => (
              <button key={p.code} type="button" className={hubBtnGhost} onClick={() => void selectPromoPreset(p.code)}>
                {p.code}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">
            Code
            <input className={`mt-1 ${hubInputClass}`} value={promoDraft.code} onChange={(e) => setPromoDraft((p) => ({ ...p, code: e.target.value.toUpperCase() }))} />
          </label>
          <label className="text-xs text-zinc-400">
            Type
            <select className={`mt-1 ${hubInputClass}`} value={promoDraft.type} onChange={(e) => setPromoDraft((p) => ({ ...p, type: e.target.value as PromoDraft["type"] }))}>
              <option value="dollar_off">Dollar Off</option>
              <option value="free_month">Free Month</option>
              <option value="free_addon">Free Add-On</option>
              <option value="multi_line">Multi-Line Discount</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Discount amount
            <input className={`mt-1 ${hubInputClass}`} inputMode="decimal" value={Number(promoDraft.amount_off ?? 0)} onChange={(e) => setPromoDraft((p) => ({ ...p, amount_off: Number(e.target.value) || 0 }))} />
          </label>
          <label className="text-xs text-zinc-400">
            Applies to
            <select className={`mt-1 ${hubInputClass}`} value={promoDraft.applies_to} onChange={(e) => setPromoDraft((p) => ({ ...p, applies_to: e.target.value as PromoDraft["applies_to"] }))}>
              <option value="phone_bundle">Phone Bundle</option>
              <option value="plan">Plan</option>
              <option value="add_ons">Add-ons</option>
              <option value="plan_55_magic_max">$55 Magic Max Plan</option>
              <option value="multi_line">2+ Lines</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Start date/time
            <input className={`mt-1 ${hubInputClass}`} type="datetime-local" value={promoDraft.starts_at ? promoDraft.starts_at.slice(0, 16) : ""} onChange={(e) => setPromoDraft((p) => ({ ...p, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
          </label>
          <label className="text-xs text-zinc-400">
            Expiration date/time
            <input className={`mt-1 ${hubInputClass}`} type="datetime-local" value={promoDraft.expires_at ? promoDraft.expires_at.slice(0, 16) : ""} onChange={(e) => setPromoDraft((p) => ({ ...p, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null }))} />
          </label>
          <label className="text-xs text-zinc-400">
            Usage limit
            <input className={`mt-1 ${hubInputClass}`} inputMode="numeric" value={promoDraft.usage_limit ?? ""} onChange={(e) => setPromoDraft((p) => ({ ...p, usage_limit: e.target.value ? Number(e.target.value) : null }))} />
          </label>
          <label className="text-xs text-zinc-400">
            Customer type rule
            <select className={`mt-1 ${hubInputClass}`} value={promoDraft.customer_type ?? "all"} onChange={(e) => setPromoDraft((p) => ({ ...p, customer_type: e.target.value as PromoDraft["customer_type"] }))}>
              <option value="all">All customers</option>
              <option value="first_time">First-time only</option>
              <option value="returning">Returning only</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={Boolean(promoDraft.manager_only)} onChange={(e) => setPromoDraft((p) => ({ ...p, manager_only: e.target.checked }))} />
            Manager-only promo (hidden from consultants)
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={Boolean(promoDraft.admin_approval_required)} onChange={(e) => setPromoDraft((p) => ({ ...p, admin_approval_required: e.target.checked }))} />
            Require admin approval
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={Boolean(promoDraft.allow_stacking)} onChange={(e) => setPromoDraft((p) => ({ ...p, allow_stacking: e.target.checked }))} />
            Allow stacking
          </label>
          <label className="text-xs text-zinc-400">
            Max stack count
            <input className={`mt-1 ${hubInputClass}`} inputMode="numeric" value={promoDraft.max_stack_count ?? 1} onChange={(e) => setPromoDraft((p) => ({ ...p, max_stack_count: Math.max(1, Number(e.target.value) || 1) }))} />
          </label>
        </div>
        <label className="mt-3 block text-xs text-zinc-400">
          Rule/notes
          <textarea className={`mt-1 min-h-[72px] ${hubInputClass}`} value={promoDraft.rule_text ?? ""} onChange={(e) => setPromoDraft((p) => ({ ...p, rule_text: e.target.value, notes: e.target.value }))} />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={hubBtnGhost} onClick={() => void savePromo("draft")}>
            Save Draft
          </button>
          <button type="button" className={hubBtnPrimary} onClick={() => void savePromo("active")}>
            Save Active
          </button>
        </div>
        {promoRows.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs text-zinc-300">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-2">Code</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Uses</th>
                  <th className="pb-2">Revenue</th>
                  <th className="pb-2">Profit impact</th>
                  <th className="pb-2">Visibility</th>
                </tr>
              </thead>
              <tbody>
                {promoRows.map((row) => {
                  const a = promoAnalytics.get(row.code);
                  return (
                    <tr key={row.id} className="border-t border-zinc-800">
                      <td className="py-2">{row.code}</td>
                      <td className="py-2">{row.status}</td>
                      <td className="py-2">{row.type}</td>
                      <td className="py-2">{a?.usage ?? 0}</td>
                      <td className="py-2">{formatCurrency(a?.revenue ?? 0)}</td>
                      <td className="py-2">{formatCurrency(a?.netProfit ?? 0)}</td>
                      <td className="py-2">{row.manager_only ? "Manager/Admin" : "All roles"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </HubCard>
      <HubCard>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-200">Plan pricing catalog</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs text-zinc-300">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2">Plan</th>
                <th className="pb-2">Monthly</th>
                <th className="pb-2">One-time</th>
                <th className="pb-2">Consultant payout</th>
                <th className="pb-2">Manager payout</th>
                <th className="pb-2">Badge</th>
              </tr>
            </thead>
            <tbody>
              {planRows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-800">
                  <td className="py-2">{row.name}</td>
                  <td className="py-2 pr-2">
                    <input
                      className={hubInputClass}
                      inputMode="decimal"
                      value={row.priceMonthly}
                      onChange={(e) =>
                        setPlanRows((prev) => prev.map((p) => (p.id === row.id ? { ...p, priceMonthly: Number(e.target.value) || 0 } : p)))
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={hubInputClass}
                      inputMode="decimal"
                      value={row.oneTimePrice ?? 0}
                      onChange={(e) =>
                        setPlanRows((prev) =>
                          prev.map((p) => (p.id === row.id ? { ...p, oneTimePrice: Number(e.target.value) || undefined } : p)),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={hubInputClass}
                      inputMode="decimal"
                      value={row.consultantPayout}
                      onChange={(e) =>
                        setPlanRows((prev) =>
                          prev.map((p) => (p.id === row.id ? { ...p, consultantPayout: Number(e.target.value) || 0 } : p)),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={hubInputClass}
                      inputMode="decimal"
                      value={row.managerPayout}
                      onChange={(e) =>
                        setPlanRows((prev) =>
                          prev.map((p) => (p.id === row.id ? { ...p, managerPayout: Number(e.target.value) || 0 } : p)),
                        )
                      }
                    />
                  </td>
                  <td className="py-2">
                    {(() => {
                      const badgeValue = row.badge ?? "";
                      return (
                    <input
                      className={hubInputClass}
                      value={badgeValue}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const badge =
                          v === "Best Value" || v === "Promo" || v === "Unlimited"
                            ? v
                            : undefined;
                        setPlanRows((prev) => prev.map((p) => (p.id === row.id ? { ...p, badge } : p)));
                      }}
                    />
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HubCard>
      <HubCard>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-200">Phone pricing catalog</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-xs text-zinc-300">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2">Brand</th>
                <th className="pb-2">Model</th>
                <th className="pb-2">Category</th>
                <th className="pb-2">Buy low/high</th>
                <th className="pb-2">Sell low/high</th>
                <th className="pb-2">Consultant</th>
                <th className="pb-2">Manager</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {phoneRows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-800">
                  <td className="py-2">{row.brand}</td>
                  <td className="py-2">{row.model}</td>
                  <td className="py-2">{row.category}</td>
                  <td className="py-2 pr-2">
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        className={hubInputClass}
                        inputMode="decimal"
                        value={row.buyPriceLow}
                        onChange={(e) =>
                          setPhoneRows((prev) =>
                            prev.map((p) => (p.id === row.id ? { ...p, buyPriceLow: Number(e.target.value) || 0 } : p)),
                          )
                        }
                      />
                      <input
                        className={hubInputClass}
                        inputMode="decimal"
                        value={row.buyPriceHigh}
                        onChange={(e) =>
                          setPhoneRows((prev) =>
                            prev.map((p) => (p.id === row.id ? { ...p, buyPriceHigh: Number(e.target.value) || 0 } : p)),
                          )
                        }
                      />
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        className={hubInputClass}
                        inputMode="decimal"
                        value={row.sellPriceLow}
                        onChange={(e) =>
                          setPhoneRows((prev) =>
                            prev.map((p) => (p.id === row.id ? { ...p, sellPriceLow: Number(e.target.value) || 0 } : p)),
                          )
                        }
                      />
                      <input
                        className={hubInputClass}
                        inputMode="decimal"
                        value={row.sellPriceHigh}
                        onChange={(e) =>
                          setPhoneRows((prev) =>
                            prev.map((p) => (p.id === row.id ? { ...p, sellPriceHigh: Number(e.target.value) || 0 } : p)),
                          )
                        }
                      />
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={hubInputClass}
                      inputMode="decimal"
                      value={row.consultantPayout}
                      onChange={(e) =>
                        setPhoneRows((prev) =>
                          prev.map((p) => (p.id === row.id ? { ...p, consultantPayout: Number(e.target.value) || 0 } : p)),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={hubInputClass}
                      inputMode="decimal"
                      value={row.managerPayout}
                      onChange={(e) =>
                        setPhoneRows((prev) =>
                          prev.map((p) => (p.id === row.id ? { ...p, managerPayout: Number(e.target.value) || 0 } : p)),
                        )
                      }
                    />
                  </td>
                  <td className="py-2">
                    <select
                      className={hubInputClass}
                      value={row.status}
                      onChange={(e) =>
                        setPhoneRows((prev) =>
                          prev.map((p) => (p.id === row.id ? { ...p, status: e.target.value as PhonePricingEntry["status"] } : p)),
                        )
                      }
                    >
                      <option value="In Stock">In Stock</option>
                      <option value="Special Order">Special Order</option>
                      <option value="Not Available">Not Available</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HubCard>
      <HubCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Filter</h2>
            <p className="text-xs text-zinc-500">Scope lists by contractor.</p>
          </div>
          <select className={`max-w-xs ${hubInputClass}`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All contractors</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || c.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </HubCard>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Commissions</h3>
        <div className="space-y-2">
          {filteredCommissions.map((c) => (
            <HubCard key={c.id}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-white">{formatCurrency(c.amount)}</p>
                  <p className="text-xs text-zinc-500">
                    {contractorName(c.contractor_id)} · {c.type}
                    {c.paid ? " · Paid" : " · Unpaid"}
                  </p>
                </div>
                <button
                  type="button"
                  className={hubBtnGhost}
                  onClick={() => void togglePaid(c, !c.paid)}
                >
                  Mark {c.paid ? "unpaid" : "paid"}
                </button>
              </div>
            </HubCard>
          ))}
          {filteredCommissions.length === 0 ? <p className="text-zinc-600">No commissions.</p> : null}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Sales</h3>
        <div className="space-y-2">
          {filteredSales.map((s) => (
            <HubCard key={s.id}>
              <p className="font-medium text-white">{formatCurrency(s.total_sale)}</p>
              <p className="text-xs text-zinc-500">
                {s.customer_name} · Profit {formatCurrency(s.profit)} · Comm est. {formatCurrency(s.commission_amount)} ·{" "}
                {contractorName(s.contractor_id)}
              </p>
            </HubCard>
          ))}
          {filteredSales.length === 0 ? <p className="text-zinc-600">No sales.</p> : null}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Leads snapshot</h3>
        <p className="text-xs text-zinc-600">{filteredLeads.length} leads in filter</p>
      </section>
    </div>
  );
}
