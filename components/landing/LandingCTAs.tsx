"use client";

import { useRouter } from "next/navigation";
import { NeonButton } from "@/components/ui/neon-button";

/** Neon-button CTAs used beneath the post-task form on the landing page. */
export function LandingCTAs() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <NeonButton
        variant="solid"
        size="lg"
        onClick={() => router.push("/dashboard")}
      >
        Open dashboard
      </NeonButton>
      <NeonButton size="lg" onClick={() => router.push("/agents")}>
        Browse all specialists
      </NeonButton>
    </div>
  );
}

export default LandingCTAs;
