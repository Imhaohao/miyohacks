"use client";

import { useCallback, useEffect, useState } from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type AccountBootstrap = {
  account_id: string;
  project_id: Id<"projects">;
  project: Doc<"projects">;
  product_context: Doc<"product_context_profiles"> | null;
  wallet: {
    buyer_id: string;
    available_credits: number;
    reserved_credits: number;
    lifetime_purchased: number;
    lifetime_granted?: number;
    lifetime_spent: number;
    updated_at: number;
  };
  trial: {
    granted: boolean;
    idempotent: boolean;
    amount?: number;
  };
};

export const ACCOUNT_BOOTSTRAP_REFRESH_EVENT = "arbor:account-bootstrap-refresh";

export function refreshAccountBootstrap() {
  window.dispatchEvent(new Event(ACCOUNT_BOOTSTRAP_REFRESH_EVENT));
}

export function useAccountBootstrap(enabled: boolean) {
  const [data, setData] = useState<AccountBootstrap | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/bootstrap", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Unable to load account");
      }
      setData(json as AccountBootstrap);
      return json as AccountBootstrap;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener(ACCOUNT_BOOTSTRAP_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(ACCOUNT_BOOTSTRAP_REFRESH_EVENT, onRefresh);
    };
  }, [enabled, refresh]);

  return { data, loading, error, refresh, setData };
}
