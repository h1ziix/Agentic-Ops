import type { IcpAgentContext } from "@/types/strategy";

const normalized = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const uncertainWords = new Set(["no", "not", "never", "without", "unknown", "unclear", "unverified", "may", "might", "possibly",
  "не", "нет", "без", "неизвестно", "возможно", "жоқ", "емес"]);

/** Only positive, cited facts can deterministically establish an excluded signal. */
export function matchedExcludedSignals(signals: readonly string[], facts: readonly string[]): string[] {
  return signals.filter((signal) => {
    const phrase = normalized(signal);
    return facts.some((fact) => {
      const value = normalized(fact);
      if (!(` ${value} `).includes(` ${phrase} `)) return false;
      // Negated or uncertain text is not a positive assertion of an exclusion.
      return !value.split(" ").some((word) => uncertainWords.has(word));
    });
  });
}

export function icpQualificationThreshold(context?: IcpAgentContext): number {
  return Math.max(60, context?.minimum_lead_score ?? 60);
}

export function strategyReviewBlockers(context: IcpAgentContext | undefined, score: number, facts: readonly string[]): string[] {
  if (!context) return [];
  const threshold = icpQualificationThreshold(context);
  return [
    ...(score < threshold ? [`Lead score ${score} is below the saved ICP threshold of ${threshold}.`] : []),
    ...matchedExcludedSignals(context.excluded_signals, facts).map((signal) => `Cited evidence matches saved ICP exclusion: ${signal}.`),
  ];
}
