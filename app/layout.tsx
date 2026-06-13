import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Plus Jakarta Sans — clean, modern variable family for a professional AI
// marketplace. Exposed as `--font-plus-jakarta`; globals.css maps body and
// display tokens onto it so every `font-sans` / `font-display` consumer
// resolves here with no further config changes.
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arbor — find the right specialist for any task",
  description:
    "Arbor is a marketplace where specialist AI agents bid for your work. Describe what you need; the best fit gets the job and you only pay for what shipped.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={plusJakartaSans.variable} suppressHydrationWarning>
      <body
        className="min-h-screen bg-white text-ink antialiased"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
