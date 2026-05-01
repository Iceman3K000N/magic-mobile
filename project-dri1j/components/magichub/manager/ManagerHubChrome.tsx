"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { UserRole } from "@/lib/magic-mobile";

const roleBadge = (r: UserRole) => {
  if (r === "admin") return { label: "Admin", className: "bg-amber-500/20 text-amber-200 ring-amber-500/40" };
  if (r === "sale_manager") return { label: "Manager", className: "bg-sky-500/20 text-sky-200 ring-sky-500/40" };
  return { label: "Consultant", className: "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40" };
};

const bottomItem = (active: boolean) =>
  `flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium sm:text-xs ${active ? "text-fuchsia-300" : "text-zinc-500"}`;

const MANAGER_BOTTOM = [
  { href: "/magichub/manager", short: "Home" },
  { href: "/magichub/sale/1", short: "Sale" },
  { href: "/magichub/team", short: "Team" },
  { href: "/magichub/queue", short: "Queue" },
  { href: "/magichub/profile", short: "You" },
];

const MANAGER_TOP_LINKS = [
  { href: "/magichub/manager", label: "Manager Home" },
  { href: "/magichub/team", label: "Team" },
  { href: "/magichub/queue", label: "Queue" },
  { href: "/magichub/profile", label: "Profile" },
];

export function ManagerHubChrome({
  userRole,
  userName,
  headerActions,
  children,
}: {
  userRole: UserRole;
  userName: string | null;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const badge = roleBadge(userRole);
  return (
    <div className="flex min-h-screen flex-col bg-black pb-20 text-zinc-100 lg:pb-6">
      <header className="sticky top-0 z-40 border-b border-fuchsia-500/20 bg-black/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link href="/magichub/manager" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-600/40 to-purple-900/60 text-xs font-bold">
                MM
              </span>
              <span className="hidden font-semibold sm:inline">Magic Mobile</span>
            </Link>
            <div className="min-w-0 border-l border-zinc-700 pl-3">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-400/90">Manager Panel</p>
              <p className="truncate text-xs text-zinc-500">{userName ?? "Team lead"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 sm:inline-flex ${badge.className}`}>
              {badge.label}
            </span>
            {headerActions}
          </div>
        </div>
        <div className="mx-auto hidden max-w-6xl items-center gap-2 px-4 pb-3 sm:flex">
          {MANAGER_TOP_LINKS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex min-h-[36px] items-center rounded-lg border px-3 text-xs font-medium transition ${
                  active
                    ? "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-200"
                    : "border-fuchsia-500/25 bg-black/40 text-zinc-300 hover:border-fuchsia-400/40 hover:text-fuchsia-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-fuchsia-500/20 bg-black/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg justify-around">
          {MANAGER_BOTTOM.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={bottomItem(active)}>
                <span className="text-lg leading-none">{item.short === "Home" ? "⌂" : item.short === "Sale" ? "+" : item.short === "Team" ? "◎" : item.short === "Queue" ? "☰" : "◉"}</span>
                <span>{item.short}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function ManagerQuickActions() {
  const btn =
    "inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-fuchsia-500/25 bg-zinc-950/90 px-3 py-2 text-center text-xs font-semibold text-fuchsia-100 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/10 sm:text-sm";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Link href="/magichub/sale/1" className={btn}>Start Sale</Link>
      <Link href="/magichub/customers" className={btn}>Add Customer</Link>
      <Link href="/magichub/manager#approvals" className={btn}>Approve Sales</Link>
      <Link href="/magichub/manager#activation" className={btn}>Activation Queue</Link>
    </div>
  );
}
