"use client";

import { useLayoutEffect } from "react";
import { SingularityBackground } from "@/components/SingularityBackground";

/**
 * Full-viewport singularity backdrop for the home route only. Renders a
 * fixed-position layer behind the page content and toggles the dark Arbor
 * surface on html/body while mounted.
 */
export function HomeSingularityLayer() {
  useLayoutEffect(() => {
    document.documentElement.classList.add("home-singularity");
    document.body.classList.add("home-singularity");
    return () => {
      document.documentElement.classList.remove("home-singularity");
      document.body.classList.remove("home-singularity");
    };
  }, []);

  return (
    <div className="home-singularity-root" aria-hidden>
      <SingularityBackground />
      <div className="home-singularity-veil" />
    </div>
  );
}
