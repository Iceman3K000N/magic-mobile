"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tab =
  "inline-flex shrink-0 items-center rounded-lg px-3 py-2 text-xs font-medium transition sm:text-sm";
const tabIdle = "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200";
const tabActive = "bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/40";

type Props = {
  /** CEO / admin profile — show Team Approvals tab */
  isAdmin: boolean;
  /** Sale manager without admin CEO elevation — hide pricing, inventory, payout, settings */
  managerLimited: boolean;
};

export function AdminAreaTabs({ isAdmin, managerLimited }: Props) {
  const pathname = usePathname();

  const teamTab = isAdmin ? ([{ href: "/magichub/admin/team", label: "Team" }] as { href: string; label: string }[]) : [];

  const links: { href: string; label: string }[] = managerLimited
    ? [
        { href: "/magichub/queue", label: "Queue" },
        { href: "/magichub/reports", label: "Reports" },
        { href: "/magichub/commissions", label: "Commissions" },
      ]
    : [
        { href: "/magichub/inventory", label: "Inventory" },
        { href: "/magichub/queue", label: "Queue" },
        { href: "/magichub/admin", label: "Admin" },
        ...teamTab,
        { href: "/magichub/reports", label: "Reports" },
        { href: "/magichub/commissions", label: "Commissions" },
        { href: "/magichub/commission-payout", label: "Payout" },
        { href: "/magichub/settings", label: "Settings" },
      ];

  return (
    <nav className="flex flex-wrap gap-1 border-b border-zinc-800 pb-2" aria-label="Admin shortcuts">
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className={`${tab} ${active ? tabActive : tabIdle}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
