"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";

/**
 * Compact post-task entry that lives inside the hero. On submit it hands the
 * typed prompt to the full PostTaskForm lower on the page (via a window event)
 * and smooth-scrolls there, so the hero stays light while the real intake flow
 * takes over. Styled as frosted glass to sit on the dark shader background.
 */
export function HeroQuickPost() {
  const router = useRouter();
  const [value, setValue] = useState("");

  const handToFullForm = (prompt: string) => {
    window.dispatchEvent(
      new CustomEvent("arbor:prefill-task", { detail: prompt }),
    );
    document
      .getElementById("post-task")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handToFullForm(value.trim());
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 pl-4 shadow-xl shadow-brand-500/10 backdrop-blur-md transition-colors focus-within:border-white/40"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe what you need done…"
          aria-label="Describe your task"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none sm:text-base"
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-sky-400 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:from-blue-600 hover:to-sky-500 hover:shadow-lg hover:shadow-blue-500/30"
        >
          Post a task
          <ArrowRight size={15} weight="bold" />
        </button>
      </form>
      <button
        type="button"
        onClick={() => router.push("/agents")}
        className="group inline-flex items-center gap-1 text-sm font-medium text-blue-100/80 transition-colors hover:text-white"
      >
        or browse specialists
        <ArrowRight
          size={13}
          weight="bold"
          className="transition-transform group-hover:translate-x-0.5"
        />
      </button>
    </div>
  );
}

export default HeroQuickPost;
