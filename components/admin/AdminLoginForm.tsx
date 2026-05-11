"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { CircleNotch, LockKey } from "@phosphor-icons/react";

export function AdminLoginForm() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) throw new Error("Invalid admin secret");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader title="Admin access" meta="Operator console" />
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-ink">
          Admin secret
          <input
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brand-600 focus:outline-none focus:shadow-ring"
            required
            autoFocus
          />
        </label>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? (
            <CircleNotch size={16} className="animate-spin" />
          ) : (
            <LockKey size={16} weight="bold" />
          )}
          Enter admin
        </Button>
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}
