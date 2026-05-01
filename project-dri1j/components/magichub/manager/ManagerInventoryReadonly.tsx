"use client";

import type { InventoryRecord } from "@/lib/magichub";
import { HubCard } from "@/components/magichub/MagicHubShell";

export function ManagerInventoryReadonly({ inventory }: { inventory: InventoryRecord[] }) {
  return (
    <HubCard>
      <h2 className="text-lg font-semibold text-white">Inventory</h2>
      <p className="mt-1 text-sm text-zinc-500">Read-only view. No cost or editing access.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-zinc-700 text-left text-xs uppercase text-zinc-500">
              <th className="pb-2">Model</th>
              <th className="pb-2">IMEI</th>
              <th className="pb-2">Serial</th>
              <th className="pb-2">Retail price</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((inv) => (
              <tr key={inv.id} className="border-b border-zinc-800/60">
                <td className="py-2 text-zinc-200">{inv.phone_model}</td>
                <td className="py-2 text-zinc-500">{inv.imei ?? "—"}</td>
                <td className="py-2 text-zinc-500">{inv.serial_number ?? "—"}</td>
                <td className="py-2 text-emerald-200/90">${Number(inv.selling_price).toFixed(2)}</td>
                <td className="py-2 text-fuchsia-200/90">{inv.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HubCard>
  );
}
