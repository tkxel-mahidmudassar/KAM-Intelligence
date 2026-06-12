import { prisma } from "@/lib/prisma";
import { buildLearningRuleText, shouldCreateLearningRule, type AiRule } from "@/lib/v2/aiRuleHeuristics";

const DEFAULT_AI_RULES: AiRule[] = [
  {
    id: "system-sponsor-engaged",
    text: "Do not repeat a recommendation when the same user dismissed it because the sponsor is already engaged.",
    source: "system",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "system-project-health-recovery",
    text: "When Project Health drops from delivery cadence, prefer pod-level recovery tasks before commercial escalation.",
    source: "system",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "system-arr-evidence",
    text: "If finance denies a document-derived ARR update because invoice evidence is missing, wait for invoice support before proposing it again.",
    source: "system",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

type IntegrationSettingsWithRules = {
  aiRules?: AiRule[];
  [key: string]: unknown;
};

function safeSettings(value: unknown): IntegrationSettingsWithRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as IntegrationSettingsWithRules;
}

async function readStoredRules() {
  const config = await prisma.appConfig.findUnique({ where: { id: "global" } });
  const settings = safeSettings(config?.integrationSettings);
  return Array.isArray(settings.aiRules) ? settings.aiRules : [];
}

async function writeStoredRules(rules: AiRule[], userId?: string | null) {
  const config = await prisma.appConfig.findUnique({ where: { id: "global" } });
  const settings = safeSettings(config?.integrationSettings);
  await prisma.appConfig.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      integrationSettings: { ...settings, aiRules: rules },
      updatedBy: userId ?? undefined,
    },
    update: {
      integrationSettings: { ...settings, aiRules: rules },
      updatedBy: userId ?? undefined,
    },
  });
}

export async function listAiRules(userId?: string | null): Promise<AiRule[]> {
  const storedRules = await readStoredRules();
  const visibleStoredRules = storedRules.filter((rule) => !rule.userId || rule.userId === userId);
  return [...DEFAULT_AI_RULES, ...visibleStoredRules].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createAiRule(input: {
  text: string;
  source?: AiRule["source"];
  userId?: string | null;
  accountId?: string | null;
  category?: string | null;
  reason?: string | null;
}) {
  const text = input.text.trim();
  if (!text) throw new Error("Rule text is required");
  const storedRules = await readStoredRules();
  const rule: AiRule = {
    id: `ai-rule-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    source: input.source ?? "manual",
    userId: input.userId ?? null,
    accountId: input.accountId ?? null,
    category: input.category ?? null,
    reason: input.reason ?? null,
    createdAt: new Date().toISOString(),
  };
  await writeStoredRules([rule, ...storedRules], input.userId);
  return rule;
}

export async function createAiRuleFromFeedback(input: {
  reason: string;
  userId?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  itemTitle?: string | null;
  category?: string | null;
}) {
  if (!shouldCreateLearningRule(input.reason)) return null;
  return createAiRule({
    text: buildLearningRuleText(input),
    source: "dismissal",
    userId: input.userId ?? null,
    accountId: input.accountId ?? null,
    category: input.category ?? null,
    reason: input.reason.trim(),
  });
}
