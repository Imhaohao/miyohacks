import Link from "next/link";
import { Tree } from "@phosphor-icons/react/dist/ssr";

export function ArborMark({
  as = "div",
  tone = "dark",
}: {
  as?: "link" | "div";
  /** `light` renders the wordmark in white for use over dark surfaces. */
  tone?: "dark" | "light";
}) {
  const inner = (
    <span
      className={`inline-flex items-center gap-2 ${tone === "light" ? "text-white" : "text-ink"}`}
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Tree size={16} weight="fill" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">
        Arbor
      </span>
    </span>
  );
  if (as === "link") {
    return (
      <Link href="/" className="inline-flex items-center">
        {inner}
      </Link>
    );
  }
  return inner;
}
