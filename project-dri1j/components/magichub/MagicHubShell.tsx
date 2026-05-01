"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navLink =
  "inline-flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-purple-500/10 hover:text-purple-200";
const navActive = "bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/40";

export function MagicHubShell({
  title,
  subtitle,
  children,
  navItems,
  mobileNavItems,
  footer,
  actions,
  variant = "default",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  navItems: { href: string; label: string }[];
  mobileNavItems?: { href: string; label: string; shortLabel?: string; icon?: string }[];
  footer?: ReactNode;
  actions?: ReactNode;
  /** Retail floor layout: larger tap targets, royal blue accents. */
  variant?: "default" | "pad";
}) {
  const pathname = usePathname();
  const pad = variant === "pad";
  const shellBg = pad
    ? "bg-gradient-to-b from-black via-slate-950 to-[#0a1628] text-zinc-100"
    : "bg-black text-zinc-100";
  const headerBorder = pad ? "border-blue-500/25 bg-black/85" : "border-purple-500/20 bg-black/90";
  const brandAccent = pad ? "text-blue-300/90" : "text-purple-400/90";
  const navLinkCls = pad
    ? "rounded-xl border border-blue-500/20 bg-blue-950/20 px-4 py-3 text-base font-medium text-blue-100 transition hover:border-blue-400/40 hover:bg-blue-500/10 min-h-[44px] items-center"
    : navLink;
  const navActiveCls = pad ? "border-blue-400/60 bg-blue-500/20 text-white ring-2 ring-blue-400/30" : navActive;
  const bottomNav = mobileNavItems ?? [];

  return (
    <div className={`flex min-h-screen flex-col ${shellBg} ${bottomNav.length > 0 ? "pb-20 lg:pb-0" : ""}`}>
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md ${headerBorder}`}>
        <div className={`mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${pad ? "max-w-7xl" : "max-w-6xl"}`}>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${brandAccent}`}>Magic Mobile</p>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h1>
              {subtitle ? <p className="text-sm text-zinc-400">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
          {navItems.length > 0 ? (
            <nav className="-mx-1 flex max-w-full flex-nowrap gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:justify-end sm:overflow-visible sm:pb-0 [-webkit-overflow-scrolling:touch]">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex ${navLinkCls} ${pathname === item.href ? navActiveCls : pad ? "text-blue-200/80" : "text-zinc-400"}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-6 ${pad ? "max-w-7xl" : "max-w-6xl"}`}>{children}</main>
      {bottomNav.length > 0 ? (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-purple-500/20 bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto flex max-w-lg justify-around">
            {bottomNav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium sm:text-xs ${
                    active ? "text-purple-300" : "text-zinc-500"
                  }`}
                >
                  <span className="text-lg leading-none">{item.icon ?? "•"}</span>
                  <span>{item.shortLabel ?? item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
      {footer && !pad ? (
        <footer className="border-t border-purple-500/15 py-6 text-center text-xs text-zinc-500">{footer}</footer>
      ) : null}
    </div>
  );
}

export function HubCard({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`rounded-2xl border border-purple-500/20 bg-zinc-950/80 p-4 shadow-[0_0_24px_-8px_rgba(168,85,247,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

export function HubStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <HubCard>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </HubCard>
  );
}

export const hubInputClass =
  "w-full rounded-xl border border-purple-500/25 bg-black/60 px-3 py-2.5 text-white placeholder:text-zinc-600 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30";

export const hubBtnPrimary =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_-4px_rgba(147,51,234,0.6)] transition hover:bg-purple-500 active:scale-[0.99] disabled:opacity-50";

export const hubBtnGhost =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-purple-500/30 bg-transparent px-4 py-2.5 text-sm font-medium text-purple-200 transition hover:bg-purple-500/10";
