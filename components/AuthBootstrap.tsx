"use client";

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function AuthBootstrap() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureCurrentUser = useMutation(api.accounts.ensureCurrentUser);
  const hasEnsured = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || hasEnsured.current) return;
    hasEnsured.current = true;
    void ensureCurrentUser().catch(() => {
      hasEnsured.current = false;
    });
  }, [ensureCurrentUser, isAuthenticated, isLoading]);

  return null;
}
