export type RequiredContext = "hyperspell" | "nia_repo";

const SOFTWARE_TASK_PATTERNS = [
  /\bapi\b/i,
  /\bbug(s)?\b/i,
  /\bbuild\b/i,
  /\bcode\b/i,
  /\bconvex\b/i,
  /\bdebug\b/i,
  /\bdeploy\b/i,
  /\bgithub\b/i,
  /\bnext\.?js\b/i,
  /\brepo(sitory)?\b/i,
  /\bstripe\b/i,
  /\btest(s|ing)?\b/i,
];

export function isSoftwareEngineeringTask(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return SOFTWARE_TASK_PATTERNS.some((pattern) => pattern.test(text));
}

export function requiredContextForPrompt(prompt: string): RequiredContext[] {
  return isSoftwareEngineeringTask(prompt)
    ? ["hyperspell", "nia_repo"]
    : ["hyperspell"];
}
