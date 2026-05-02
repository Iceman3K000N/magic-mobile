"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hubBtnGhost, hubBtnPrimary, hubInputClass } from "@/components/magichub/MagicHubShell";

const SESSION_KEY = "magichub_pin_sess_v1";
const SESSION_MS = 15 * 60 * 1000;

export type EnsurePinOptions = {
  /** If true, always show PIN entry (e.g. every sale) instead of reusing the short session unlock. */
  forceVerify?: boolean;
};

type Ctx = {
  ensureUnlocked: (opts?: EnsurePinOptions) => Promise<boolean>;
  needsSetup: boolean;
  pinLoading: boolean;
  pinStatusError: string | null;
  refreshPinStatus: () => Promise<void>;
};

const ManagerPinContext = createContext<Ctx | null>(null);

export function useManagerPin(): Ctx {
  const x = useContext(ManagerPinContext);
  return (
    x ?? {
      ensureUnlocked: async () => true,
      needsSetup: false,
      pinLoading: false,
      pinStatusError: null,
      refreshPinStatus: async () => {},
    }
  );
}

async function apiPin(supabase: SupabaseClient, init: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  return fetch("/api/magichub/pin", {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
}

function readSessionExp(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { exp?: number };
    return typeof j.exp === "number" ? j.exp : null;
  } catch {
    return null;
  }
}

function writeSession() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ exp: Date.now() + SESSION_MS }));
}

function sessionValid(): boolean {
  const exp = readSessionExp();
  return exp !== null && Date.now() < exp;
}

export function ManagerPinProvider({
  enabled,
  supabase,
  children,
}: {
  enabled: boolean;
  supabase: SupabaseClient;
  children: ReactNode;
}) {
  const [pinLoading, setPinLoading] = useState(Boolean(enabled));
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [vpin, setVpin] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [pinStatusError, setPinStatusError] = useState<string | null>(null);
  const verifyDone = useRef<((ok: boolean) => void) | null>(null);

  const refreshPinStatus = useCallback(async () => {
    if (!enabled) {
      setPinLoading(false);
      setNeedsSetup(false);
      setSetupOpen(false);
      setPinStatusError(null);
      return;
    }
    setPinLoading(true);
    setPinStatusError(null);
    try {
      const r = await apiPin(supabase, { method: "GET" });
      const j = (await r.json()) as { pinRequired?: boolean; needsSetup?: boolean; error?: string };
      if (!r.ok) throw new Error(j.error ?? "PIN status failed");
      const req = Boolean(j.pinRequired);
      const setup = req && Boolean(j.needsSetup);
      setNeedsSetup(setup);
      setSetupOpen(setup);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load PIN status.";
      setPinStatusError(msg);
      setNeedsSetup(false);
      setSetupOpen(false);
    } finally {
      setPinLoading(false);
    }
  }, [enabled, supabase]);

  useEffect(() => {
    void refreshPinStatus();
  }, [refreshPinStatus]);

  const ensureUnlocked = useCallback(async (opts?: EnsurePinOptions): Promise<boolean> => {
    if (!enabled) return true;
    if (pinStatusError) {
      setFormErr("PIN status could not be loaded. Use Retry on the error banner or Profile → Refresh PIN status.");
      return false;
    }
    if (needsSetup) {
      setSetupOpen(true);
      setFormErr("Create your 4-digit PIN first.");
      return false;
    }
    if (!opts?.forceVerify && sessionValid()) return true;
    setFormErr(null);
    setVpin("");
    setVerifyOpen(true);
    return await new Promise<boolean>((resolve) => {
      verifyDone.current = resolve;
    });
  }, [enabled, needsSetup, pinStatusError]);

  const submitSetup = async () => {
    setFormErr(null);
    try {
      const r = await apiPin(supabase, {
        method: "POST",
        body: JSON.stringify({ action: "set", pin: pin1, confirmPin: pin2 }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not save PIN");
      setNeedsSetup(false);
      setSetupOpen(false);
      setPin1("");
      setPin2("");
      setPinStatusError(null);
      writeSession();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : String(e));
    }
  };

  const submitVerify = async () => {
    setFormErr(null);
    try {
      const r = await apiPin(supabase, {
        method: "POST",
        body: JSON.stringify({ action: "verify", pin: vpin }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Incorrect PIN");
      writeSession();
      setVerifyOpen(false);
      setVpin("");
      verifyDone.current?.(true);
      verifyDone.current = null;
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : String(e));
    }
  };

  const cancelVerify = () => {
    setVerifyOpen(false);
    setVpin("");
    verifyDone.current?.(false);
    verifyDone.current = null;
  };

  const value = useMemo(
    () => ({ ensureUnlocked, needsSetup, pinLoading, pinStatusError, refreshPinStatus }),
    [ensureUnlocked, needsSetup, pinLoading, pinStatusError, refreshPinStatus],
  );

  return (
    <ManagerPinContext.Provider value={value}>
      {children}
      {enabled && pinLoading ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70">
          <p className="text-sm text-zinc-300">Checking PIN status…</p>
        </div>
      ) : null}
      {enabled && setupOpen ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-950 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">Create your 4-digit PIN</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Managers, admins, and store leads use this PIN to confirm sales and sensitive actions in MagicHub.
            </p>
            <label className="mt-4 block text-xs text-zinc-500">
              PIN (4 digits)
              <input
                className={`mt-1 ${hubInputClass}`}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin1}
                onChange={(e) => setPin1(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-500">
              Confirm PIN
              <input
                className={`mt-1 ${hubInputClass}`}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </label>
            {formErr ? <p className="mt-3 text-sm text-red-400">{formErr}</p> : null}
            <button type="button" className={`${hubBtnPrimary} mt-6 w-full`} onClick={() => void submitSetup()}>
              Save PIN
            </button>
          </div>
        </div>
      ) : null}
      {enabled && pinStatusError && !pinLoading ? (
        <div className="fixed bottom-4 left-1/2 z-[205] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-xl border border-red-500/40 bg-red-950/95 px-4 py-3 shadow-xl">
          <p className="text-sm text-red-100">{pinStatusError}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={`${hubBtnGhost} text-xs`} onClick={() => void refreshPinStatus()}>
              Retry
            </button>
            <span className="self-center text-[11px] text-red-200/70">
              If this persists, confirm <code className="text-red-100">manager_auth_pins</code> exists and the service role key is set.
            </span>
          </div>
        </div>
      ) : null}
      {enabled && verifyOpen ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-950 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">Enter PIN</h2>
            <p className="mt-2 text-sm text-zinc-400">Confirm your identity to continue.</p>
            <label className="mt-4 block text-xs text-zinc-500">
              4-digit PIN
              <input
                className={`mt-1 ${hubInputClass}`}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={vpin}
                onChange={(e) => setVpin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                autoFocus
              />
            </label>
            {formErr ? <p className="mt-3 text-sm text-red-400">{formErr}</p> : null}
            <div className="mt-6 flex gap-2">
              <button type="button" className={`${hubBtnGhost} flex-1`} onClick={cancelVerify}>
                Cancel
              </button>
              <button type="button" className={`${hubBtnPrimary} flex-1`} onClick={() => void submitVerify()}>
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ManagerPinContext.Provider>
  );
}

/** Shown on Profile for PIN-eligible accounts (wrap with `ManagerPinProvider` + `enabled` when `canUseManagerPin`). */
export function ProfilePinHelp({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  const { needsSetup, pinLoading, pinStatusError, refreshPinStatus } = useManagerPin();
  return (
    <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-white">4-digit PIN</h3>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
        This PIN confirms sales and other sensitive actions. The first time you need one, MagicHub shows a full-screen &quot;Create your 4-digit PIN&quot;
        prompt after sign-in.
      </p>
      {pinStatusError ? <p className="mt-2 text-sm text-red-400">{pinStatusError}</p> : null}
      {needsSetup ? (
        <p className="mt-2 text-sm text-amber-200">
          Your PIN isn&apos;t saved yet — complete the setup prompt, or refresh status below if it didn&apos;t appear.
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">PIN status loaded — you&apos;re ready for gated actions.</p>
      )}
      <button
        type="button"
        className={`${hubBtnGhost} mt-3 text-sm`}
        onClick={() => void refreshPinStatus()}
        disabled={pinLoading}
      >
        {pinLoading ? "Checking…" : "Refresh PIN status"}
      </button>
    </div>
  );
}
