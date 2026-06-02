import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { makeStep, type AgentResult, type AgentStep, type AgentSource } from "./types";
import type { Action } from "@prisma/client";
import type { KpiScores } from "@/lib/scoring/triggers";

interface ActionSuggestion {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDays: number;
  rationale: string;
}

export async function runScoreActionsAgent(
  accountId: string,
  scores: KpiScores,
  newSignalTitles: string[],
): Promise<AgentResult<Action[]>> {
  const agentStart = Date.now();
  const steps: AgentStep[] = [];

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      name: true,
      health: true,
      kamScores: { orderBy: { computedAt: "desc" }, take: 3, select: { overall: true, computedAt: true } },
      _count: { select: { actions: true } },
    },
  });
  if (!account) return { output: [], sources: [], steps, model: "skipped", totalLatencyMs: 0 };

  const scoreHistory = account.kamScores.map((s) => s.overall).join(", ");
  const weakDims = Object.entries(scores)
    .filter(([, v]) => v < 60)
    .map(([k, v]) => `${k}: ${v}/100`)
    .join(", ");

  const sources: AgentSource[] = [
    { type: "score", label: "Score history (newest first)", value: scoreHistory || "none" },
    ...(weakDims ? [{ type: "kpi" as const, label: "Weak KPI dimensions", value: weakDims }] : []),
    ...(newSignalTitles.length > 0 ? newSignalTitles.map((t): AgentSource => ({ type: "signal", label: `New signal: ${t}` })) : []),
    { type: "action", label: "Open action count", value: `${account._count.actions} actions` },
  ];

  const prompt = `You are a KAM Intelligence action-planning agent.

Account: ${account.name}
Health: ${account.health}
Score history (newest first): ${scoreHistory || "no history"}
Weak KPI dimensions: ${weakDims || "none"}
New signals raised: ${newSignalTitles.length > 0 ? newSignalTitles.join("; ") : "none"}
Open actions already: ${account._count.actions}

Generate 2-4 specific, actionable tasks for the KAM to address the weakest areas. Avoid vague tasks.
Return a JSON array only:
[
  {
    "title": "concise imperative task title under 80 chars",
    "description": "1-2 sentences with specific context and expected outcome",
    "priority": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "dueDays": <integer days from today>,
    "rationale": "one sentence linking this task to the data above"
  }
]`;

  const t0 = Date.now();
  const response = await complete({
    accountId,
    task: "score-actions-agent",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1024,
    temperature: 0.3,
    jsonMode: true,
  });
  steps.push(makeStep("generate-actions", prompt, response.content, Date.now() - t0));

  let suggestions: ActionSuggestion[] = [];
  try {
    const raw = response.content.replace(/```json|```/g, "").trim();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) suggestions = arr.slice(0, 4);
  } catch {
    return { output: [], sources, steps, model: response.model, totalLatencyMs: Date.now() - agentStart };
  }

  const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
  const created = await Promise.all(
    suggestions.map((s) => {
      const due = new Date();
      due.setDate(due.getDate() + (s.dueDays ?? 7));
      return prisma.action.create({
        data: {
          accountId,
          title:       s.title ?? "AI-suggested action",
          description: `${s.description ?? ""}\n\nRationale: ${s.rationale ?? ""}`.trim(),
          priority:    VALID_PRIORITIES.includes(s.priority as typeof VALID_PRIORITIES[number])
                         ? s.priority
                         : "MEDIUM",
          source:      "AI_PROPOSED",
          status:      "OPEN",
          dueDate:     due,
        },
      });
    }),
  );

  return {
    output: created,
    sources,
    steps,
    model: response.model,
    totalLatencyMs: Date.now() - agentStart,
  };
}
