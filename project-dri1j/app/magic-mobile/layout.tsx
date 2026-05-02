import type { ReactNode } from "react";
import { Suspense } from "react";

export const metadata = {
  title: "Magic Mobile Contractor Portal",
  description: "Magic Mobile black + purple contractor sales portal.",
};

export default function MagicMobileLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-zinc-400">
          Loading portal…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
