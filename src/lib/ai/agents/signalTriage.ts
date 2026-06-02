import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { makeStep, type AgentResult, type AgentStep, type AgentSource } from "./types";
import type { Action, Signal } from "@prisma/client";

interface TriageResult {
  signal: Signal;
  suggestedAction?: Action;
}

export async function runSignalTriageAgent(
  accountId: string,
  signalId: string,
): Promise<AgentResult<TriageResult>> {
  const agentStart = Date.now();
  const steps: AgentStep[] = [];

  const [signal, account] = await Promise.all([
    prisma.signal.findUnique({ where: { id: signalId } }),
    prisma.account.findUnique({
      where: { id: accountId },
      include: {
        kamScores: { orderBy: { computedAt: "desc" }, take: 3, select: { overall: true, health: true } },
        actions:   { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { title: true }, take: 5 },
      },
    }),
  ]);

  if (!signal || !account) {
    return { output: { signal: signal!, suggestedAction: undefined }, sources: [], steps, model: "skipped", totalLatencyMs: 0 };
  }

  const scoreHistory = account.kamScores.map((s) => `${s.overall}/100 (${s.health})`).join(", ");
  const openActions  = account.actions.map((a) => a.title).join("; ") || "none";

  const sources: AgentSource[] = [
    { type: "signal",  label: `Signal being triaged: ${signal.title}`, value: `${signal.severity} | ${signal.type}` },
    { type: "score",   label: "Account score history", value: scoreHistory || "none" },
    { type: "action",  label: "Open actions", value: openActions },
  ];

  // Step A: assess signal validity
  const promptA = `You are a KAM signal triage agent assessing whether a newly raised signal represents a genuine risk.

Account: ${account.name} | Health: ${account.health}
Score history (newest first): ${scoreHistory}
Open actions: ${openActions}

Signal to triage:
  Type: ${signal.type}
  Severity: ${signal.severity}
  Title: ${signal.title}
  Description: ${signal.description ?? "N/A"}
  Source: ${signal.source ?? "system"}

Return JSON only: { "genuine": true/false, "confidence": 0.0-1.0, "reasoning": "one sentence" }`;

  const tA = Date.now();
  const responseA = await complete({
    accountId,
    task: "signal-triage-assess",
    messages: [{ role: "user", content: promptA }],
    maxTokens: 256,
    temperature: 0.1,
    jsonMode: true,
  });
  steps.push(makeStep("assess-signal", promptA, responseA.content, Date.now() - tA));

  let assessment = { genuine: true, confidence: 0.5, reasoning: "" };
  try {
    const raw = responseA.content.replace(/```json|```/g, "").trim();
    assessment = { ...assessment, ...JSON.parse(raw) };
  } catch { /* keep defaults */ }

  // Mark signal as triaged (pendingReview: false)
  const updatedSignal = await prisma.signal.update({
    where: { id: signalId },
    data: { pendingReview: false },
  });

  if (!assessment.genuine || assessment.confidence < 0.5) {
    return {
      output: { signal: updatedSignal, suggestedAction: undefined },
      sources,
      steps,
      model: responseA.model,
      totalLatencyMs: Date.now() - agentStart,
    };
  }

  // Step B: draft a recommended action
  const promptB = `You are a KAM action-planning agent. A signal has been triaged as genuine.

Account: ${account.name} | Signal: ${signal.title}
Triage reasoning: ${assessment.reasoning}

Draft exactly one concrete recommended action for the KAM to take in response to this signal.
Return JSON only: { "title": "imperative title under 80 chars", "description": "1-2 sentences", "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "dueDays": <integer> }`;

  const tB = Date.now();
  const responseB = await complete({
    accountId,
    task: "signal-triage-action",
    messages: [{ role: "user", content: promptB }],
    maxTokens: 256,
    temperature: 0.2,
    jsonMode: true,
  });
  steps.push(makeStep("suggest-action", promptB, responseB.content, Date.now() - tB));

  let actionData: { title: string; description: string; priority: string; dueDays: number } | null = null;
  try {
    const raw = responseB.content.replace(/```json|```/g, "").trim();
    actionData = JSON.parse(raw);
  } catch { /* no action */ }

  let suggestedAction: Action | undefined;
  if (actionData?.title) {
    const due = new Date();
    due.setDate(due.getDate() + (actionData.dueDays ?? 7));
    const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    suggestedAction = await prisma.action.create({
      data: {
        accountId,
        title:       actionData.title,
        description: actionData.description ?? "",
        priority:    VALID_PRIORITIES.includes(actionData.priority) ? actionData.priority as any : "MEDIUM",
        source:      "AI_PROPOSED",
        status:      "OPEN",
        dueDate:     due,
      },
    });
  }

  return {
    output: { signal: updatedSignal, suggestedAction },
    sources,
    steps,
    model: responseB.model,
    totalLatencyMs: Date.now() - agentStart,
  };
}
