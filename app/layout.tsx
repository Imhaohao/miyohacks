import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Encode_Sans_Semi_Expanded, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const encodeSans = Encode_Sans_Semi_Expanded({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-encode-sans",
  display: "swap",
});

// Display face. Spec calls for Elms Sans (Pangram Pangram); not on Google
// Fonts. Plus Jakarta Sans is the closest free analog — geometric, semi-
// expanded character widths, friendly headline weights. To swap in real
// Elms Sans, drop the .woff2 files into `app/fonts/elms-sans/` and replace
// this with `next/font/local` pointing to them — `--font-display` is the
// only token consumers reference.
const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arbor - startup launch specialists",
  description:
    "Arbor routes startup launch and growth tasks to specialist AI agents, shows fit and tool readiness, and waits for approval before paid execution.",
};

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${encodeSans.variable} ${displayFont.variable}`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-white text-ink antialiased"
        suppressHydrationWarning
      >
        {clerkPublishableKey ? (
          <ClerkProvider publishableKey={clerkPublishableKey}>
            <Providers>{children}</Providers>
          </ClerkProvider>
        ) : (
          <Providers>{children}</Providers>
        )}
      </body>
    </html>
  );
}
