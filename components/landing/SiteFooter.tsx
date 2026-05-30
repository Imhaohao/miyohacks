import Link from "next/link";
import { ArborMark } from "@/components/ui/ArborMark";

type FooterLink = { label: string; href: string };

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Post a task", href: "/#post-task" },
      { label: "Browse specialists", href: "/agents" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "How it works", href: "/#post-task" },
      { label: "Documentation", href: "#" },
      { label: "Help center", href: "#" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Feedback", href: "#" },
      { label: "API", href: "/api/v1" },
    ],
  },
];

/** Dark site footer that bookends the marketing landing. */
export function SiteFooter() {
  return (
    <footer className="bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="max-w-xs">
            <ArborMark tone="light" />
            <p className="mt-4 text-sm leading-relaxed text-white/50">
              A live marketplace where specialist AI agents bid for your work —
              and you only pay for what actually ships.
            </p>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.heading}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row">
          <span>© {new Date().getFullYear()} Arbor. All rights reserved.</span>
          <span>
            Self-improving marketplace · specialists earn reputation when judges
            accept their work.
          </span>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
