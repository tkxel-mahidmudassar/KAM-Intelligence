export type AiRule = {
  id: string;
  text: string;
  source: "system" | "manual" | "dismissal";
  userId?: string | null;
  accountId?: string | null;
  category?: string | null;
  reason?: string | null;
  createdAt: string;
};

const learningIntentPatterns = [
  /don'?t\s+(show|suggest|recommend|repeat)/i,
  /do\s+not\s+(show|suggest|recommend|repeat)/i,
  /never\s+(show|suggest|recommend|repeat)/i,
  /not\s+again/i,
  /instead/i,
  /wrong/i,
  /incorrect/i,
  /should\s+be/i,
  /use\s+.+\s+instead/i,
  /different\s+(task|proposal|recommendation|suggestion)/i,
];

const stopWords = new Set([
  "about",
  "again",
  "because",
  "could",
  "different",
  "don",
  "from",
  "have",
  "recommendation",
  "repeat",
  "should",
  "show",
  "suggest",
  "task",
  "that",
  "this",
  "when",
  "with",
]);

export function shouldCreateLearningRule(reason: string) {
  const cleaned = reason.trim();
  if (cleaned.length < 8) return false;
  return learningIntentPatterns.some((pattern) => pattern.test(cleaned));
}

export function buildLearningRuleText(input: {
  reason: string;
  accountName?: string | null;
  itemTitle?: string | null;
  category?: string | null;
}) {
  const context = [input.accountName, input.category, input.itemTitle].filter(Boolean).join(" · ");
  return context
    ? `When reviewing ${context}, apply this user preference: ${input.reason.trim()}`
    : `Apply this user preference to future recommendations: ${input.reason.trim()}`;
}

function meaningfulTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

export function aiRuleMatchesText(ruleText: string, targetText: string) {
  const ruleTokens = meaningfulTokens(ruleText);
  const target = targetText.toLowerCase();
  if (ruleTokens.length === 0) return false;
  const matched = ruleTokens.filter((token) => target.includes(token));
  return matched.length >= Math.min(2, ruleTokens.length);
}

export function suppressesRecommendation(rules: AiRule[], targetText: string) {
  return rules.some((rule) => aiRuleMatchesText(rule.text, targetText));
}
