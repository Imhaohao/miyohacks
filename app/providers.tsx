"use client";

import { ReactNode, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { AuthBootstrap } from "@/components/AuthBootstrap";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function Providers({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      // Render without Convex if not configured yet (foundation scaffold mode).
      return null;
    }
    return new ConvexReactClient(url);
  }, []);

  if (!client) return <>{children}</>;
  if (!clerkEnabled) {
    return <ConvexProvider client={client}>{children}</ConvexProvider>;
  }

  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <AuthBootstrap />
      {children}
    </ConvexProviderWithClerk>
  );
}
