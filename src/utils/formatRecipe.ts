/**
 * Formatting helpers for recipe data.
 */

/** Join an array of strings into a single block of text (one item per line). */
export function joinLines(items: string[] | null | undefined): string {
  if (!items || !Array.isArray(items)) return "";
  return items.join("\n");
}

/** Split a multi-line string into a trimmed, non-empty array. */
export function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Split a comma-separated string into a trimmed, non-empty array. */
export function splitComma(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Map known difficulty keys to normalised English values. */
const DIFFICULTY_MAP: Record<string, string> = {
  легко: "easy", easy: "easy", простой: "easy", просто: "easy",
  средне: "medium", medium: "medium", средний: "medium",
  сложно: "hard", hard: "hard", сложный: "hard",
};

export function normalizeDifficulty(raw: string | null | undefined): string {
  if (!raw) return "medium";
  return DIFFICULTY_MAP[raw.toLowerCase()] || "medium";
}
