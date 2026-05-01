import type { ReactNode } from "react";
import { Suspense } from "react";

export const metadata = {
  title: "MagicHub · Magic Mobile",
  description: "Operations hub for Magic Mobile — leads, inventory, sales, commissions.",
};

export default function MagicHubLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
          Loading MagicHub…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
