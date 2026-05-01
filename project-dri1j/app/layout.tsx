import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Magic Mobile Contractor Portal",
  description: "Magic Mobile contractor sales portal.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black font-sans text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
