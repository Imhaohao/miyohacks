"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sticky-to-latest scroll behavior for a streaming list of cards.
 *
 * - On mount, does nothing (lets the user land where the browser put them).
 * - When `dep` changes (a new event lands, a card mounts), checks how far
 *   the user is from the bottom of the page. If within `threshold` px,
 *   smooth-scrolls the sentinel into view so they always see the latest.
 *   If they've scrolled up to read something older, sets `hasNewBelow` so
 *   the caller can render a floating "See latest" pill they can click.
 */
export function useStickToLatest<T>(dep: T, threshold = 240) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const distance =
      document.documentElement.scrollHeight -
      window.scrollY -
      window.innerHeight;
    if (distance <= threshold) {
      sentinel.scrollIntoView({ behavior: "smooth", block: "end" });
      setHasNewBelow(false);
    } else {
      setHasNewBelow(true);
    }
  }, [dep, threshold]);

  useEffect(() => {
    function onScroll() {
      const distance =
        document.documentElement.scrollHeight -
        window.scrollY -
        window.innerHeight;
      if (distance <= threshold) setHasNewBelow(false);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  function scrollToLatest() {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setHasNewBelow(false);
  }

  return { sentinelRef, hasNewBelow, scrollToLatest };
}
