"use client";

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

export const mmCard =
  "rounded-2xl border border-zinc-800/80 bg-zinc-900/80 shadow-[0_0_0_1px_rgba(168,85,247,0.08)]";

export function IconZap({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  );
}

export function IconCopy({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

export function IconFile({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" />
    </svg>
  );
}

export function IconCheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" />
      <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" strokeLinecap="round" />
    </svg>
  );
}

export function IconDollar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconTrophy({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 4H5a2 2 0 00-2 2v1a2 2 0 002 2h2M17 4h2a2 2 0 012 2v1a2 2 0 01-2 2h-2" strokeLinecap="round" />
    </svg>
  );
}

export function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconFlame({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2c0 4-4 5-4 10a4 4 0 108 0c0-3-2-4-2-7 3 2 4 5 4 7a7 7 0 11-14 0c0-5 4-8 4-10z" />
    </svg>
  );
}

type NavItem = { href: string; label: string };

export function MagicMobileHeader({
  onMenuClick,
  title = "Magic Mobile",
}: {
  onMenuClick: () => void;
  title?: string;
}) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-900 bg-black/95 px-4 py-3 backdrop-blur-md">
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-white hover:bg-zinc-900"
        aria-label="Open menu"
      >
        <IconMenu className="h-6 w-6" />
      </button>
      <div className="flex flex-1 justify-center pr-10">
        <div className="flex items-center gap-2">
          <Image
            src="/magic-mobile-logo-transparent.png"
            alt="Magic Mobile logo"
            width={32}
            height={32}
            className="h-8 w-8 object-contain drop-shadow-[0_0_10px_rgba(168,85,247,0.4)]"
          />
          <span className="text-lg font-semibold tracking-tight text-white">{title}</span>
        </div>
      </div>
    </header>
  );
}

export function MagicMobileDrawer({
  open,
  onClose,
  navItems,
  pathname,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
  pathname: string;
  onSignOut: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close menu" />
      <aside className="absolute left-0 top-0 flex h-full w-[min(100%,320px)] flex-col border-r border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="border-b border-zinc-800 px-4 py-4">
          <div className="flex items-center gap-2">
            <IconZap className="h-7 w-7 text-purple-500" />
            <div>
              <p className="text-base font-semibold text-white">Magic Mobile</p>
              <p className="text-xs text-zinc-500">Sales Consultant Portal</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`mb-1 block rounded-xl px-3 py-3 text-sm font-medium ${
                pathname === item.href ? "bg-purple-600/20 text-purple-100" : "text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-zinc-800 p-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="w-full rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
          >
            Sign Out
          </button>
        </div>
      </aside>
    </div>
  );
}

export function StatTile({
  label,
  value,
  valueClassName = "text-white",
  icon,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
  icon: ReactNode;
}) {
  return (
    <article className={`${mmCard} relative overflow-hidden p-4`}>
      <div className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${valueClassName}`}>{value}</p>
    </article>
  );
}

export function QuickActionLink({
  href,
  title,
  subtitle,
  icon,
  accent = "purple",
  onNavigate,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  accent?: "purple" | "zinc";
  onNavigate?: () => void;
}) {
  const ring = accent === "purple" ? "border-purple-500/35 shadow-[0_0_24px_rgba(168,85,247,0.12)]" : "border-zinc-700/80";
  const iconBg = accent === "purple" ? "bg-purple-600 text-white" : "bg-zinc-800 text-white";

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-start gap-3 rounded-2xl border p-4 transition hover:border-purple-500/50 ${ring}`}
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-sm text-zinc-500">{subtitle}</span>
      </span>
    </Link>
  );
}
