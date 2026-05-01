"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BadgeDollarSign, Bell, LifeBuoy, Megaphone, MessageSquare, PhoneCall, PieChart, Rocket, Users } from "lucide-react";

const NAV = [
  { id: "dashboard", label: "Dashboard", href: "/magichub/manager", icon: BarChart3 },
  { id: "team", label: "My Team", href: "/magichub/team", icon: Users },
  { id: "sales", label: "Sales", href: "/magichub/sales", icon: BadgeDollarSign },
  { id: "leads", label: "Leads", href: "/magichub/leads", icon: PhoneCall },
  { id: "activations", label: "Activations", href: "/magichub/activation", icon: Rocket },
  { id: "commissions", label: "Commissions", href: "/magichub/commissions", icon: PieChart },
  /** Payout admin screen is restricted; payment tracker is manager-safe. */
  { id: "payouts", label: "Payouts", href: "/magichub/payments", icon: BadgeDollarSign },
  /** Managers cannot open admin; plans catalog carries promo/plan context. */
  { id: "promotions", label: "Promotions", href: "/magichub/plans", icon: Megaphone },
  { id: "reports", label: "Reports", href: "/magichub/reports", icon: BarChart3 },
  { id: "messages", label: "Messages", href: "/magichub/queue", icon: MessageSquare },
  { id: "support", label: "Support", href: "/magichub/profile", icon: LifeBuoy },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="rounded-3xl border border-blue-500/20 bg-slate-950/80 p-4 backdrop-blur xl:sticky xl:top-24 xl:h-[calc(100vh-8rem)]">
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2">
        <div className="rounded-lg border border-blue-400/40 bg-blue-500/20 px-2 py-1 text-xs font-bold text-blue-100">MM</div>
        <div>
          <p className="text-sm font-semibold text-white">Magic Mobile</p>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Manager Suite</p>
        </div>
      </div>
      <nav className="space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                isActive
                  ? "border-blue-400/50 bg-blue-500/20 text-blue-100 shadow-[0_0_20px_rgba(37,99,235,0.2)]"
                  : "border-transparent text-zinc-300 hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
        <p className="text-[10px] uppercase tracking-[0.15em] text-amber-300">Top Performer Bonus</p>
        <p className="mt-1 text-sm font-semibold text-white">Unlock +$250 team bonus</p>
        <p className="mt-1 text-xs text-amber-100/80">Hit 40 approved team sales this month.</p>
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-200">
          <Bell className="h-3.5 w-3.5" /> Progress tracked live
        </div>
      </div>
    </aside>
  );
}
