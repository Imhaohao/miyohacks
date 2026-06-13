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
        className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 pl-5 shadow-2xl shadow-black/30 backdrop-blur-xl transition-all duration-200 focus-within:border-white/35 focus-within:bg-white/[0.13] focus-within:shadow-brand-500/20"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="What do you need done today?"
          aria-label="Describe your task"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none sm:text-base"
        />
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-all duration-200 hover:scale-[1.02] hover:bg-white/95 hover:shadow-md hover:shadow-white/25 active:scale-100"
        >
          Post task
          <ArrowRight size={15} weight="bold" />
        </button>
      </form>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/agents")}
          className="group inline-flex items-center gap-1 text-sm font-medium text-white/50 transition-colors hover:text-white/80"
        >
          Browse specialists
          <ArrowRight
            size={13}
            weight="bold"
            className="transition-transform group-hover:translate-x-0.5"
          />
        </button>
        <span className="text-white/20">·</span>
        <button
          type="button"
          onClick={() => handToFullForm("Write a marketing email series for our product launch")}
          className="text-sm text-white/40 transition-colors hover:text-white/70"
        >
          Try an example
        </button>
      </div>
    </div>
  );
}

export default HeroQuickPost;
