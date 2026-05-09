import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Creator Campaign Marketplace",
  description:
    "Self-improving agent marketplace for creator-marketing workflows grounded in Reacher social intelligence and Nia-backed context.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-terminal-bg text-terminal-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
