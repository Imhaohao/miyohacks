"use client";

import { useState } from "react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { ArrowRight } from "@phosphor-icons/react";
import { AgentSuggestions } from "@/components/AgentSuggestions";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";

const DEFAULT_TASK_TYPE = "general";

const EXAMPLE_PROMPT =
  "Plan our first launch campaign. We are a seed-stage startup with a new AI workflow tool, a small budget, and a goal of finding the best growth specialist before we spend credits.";

export function SignedOutTaskComposer() {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPT);

  function rememberPrompt() {
    window.localStorage.setItem("arbor:draft-prompt", prompt);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Describe the launch task" meta="Preview is free" />
        <textarea
          rows={5}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="w-full resize-none rounded-xl border border-line bg-surface-subtle px-4 py-3 text-sm leading-relaxed text-ink outline-none transition focus:border-brand-600 focus:shadow-ring"
          placeholder="Tell Arbor what you need launched, diagnosed, or improved."
        />
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SignUpButton mode="modal">
            <Button
              type="button"
              size="lg"
              className="w-full sm:w-auto"
              onMouseDown={rememberPrompt}
            >
              Continue with this task
              <ArrowRight size={16} weight="bold" />
            </Button>
          </SignUpButton>
          <SignInButton mode="modal">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
              onMouseDown={rememberPrompt}
            >
              Sign in
            </Button>
          </SignInButton>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          Arbor shows fit, capability, and tool status before execution or
          payment. Sign in only when you are ready to save context and approve
          work.
        </p>
      </Card>
      <AgentSuggestions prompt={prompt} taskType={DEFAULT_TASK_TYPE} />
    </div>
  );
}
