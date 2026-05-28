export type IntakeModelResult =
  | { status: "questions"; questions: string[] }
  | { status: "ready"; final_prompt: string };

const MAX_QUESTIONS = 3;
const MAX_TEXT = 6000;

function cleanText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+\n/g, "\n").slice(0, max).trim();
}

function cleanQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((question) => cleanText(question, 280))
        .filter((question) => question.length > 0),
    ),
  ).slice(0, MAX_QUESTIONS);
}

export function normalizeIntakeModelResult(
  value: unknown,
): IntakeModelResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const status = cleanText(raw.status, 32).toLowerCase();
  const finalPrompt = cleanText(raw.final_prompt ?? raw.finalBrief);

  if ((status === "ready" || finalPrompt) && finalPrompt.length > 0) {
    return { status: "ready", final_prompt: finalPrompt };
  }

  const questions = cleanQuestions(raw.questions);
  if ((status === "questions" || questions.length > 0) && questions.length > 0) {
    return { status: "questions", questions };
  }

  return null;
}

export function buildFallbackFinalPrompt(
  initialPrompt: string,
  answers: string[] = [],
): string {
  const parts = [cleanText(initialPrompt)];
  const cleanedAnswers = answers.map((answer) => cleanText(answer)).filter(Boolean);
  if (cleanedAnswers.length > 0) {
    parts.push("User-provided clarification:", cleanedAnswers.join("\n\n"));
  }
  return parts.filter(Boolean).join("\n\n");
}
