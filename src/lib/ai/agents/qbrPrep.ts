import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { makeStep, type AgentResult, type AgentStep } from "./types";
import type { QbrSession } from "@prisma/client";

type QbrSessionWithItems = QbrSession & { items: { id: string; order: number; category: string | null; title: string; content: string | null; status: string | null }[] };

export async function runQbrPrepAgent(
  accountId: string,
  sessionType: string,
  requestedTitle?: string,
): Promise<AgentResult<QbrSessionWithItems>> {
  const agentStart = Date.now();
  const steps: AgentStep[] = [];

  const nintyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      kamScores:    { orderBy: { computedAt: "desc" }, take: 3 },
      kpiDimensions:{ orderBy: { recordedAt: "desc" } },
      signals:      { where: { isResolved: false }, take: 10 },
      actions:      { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, take: 10 },
      touchpoints:  { where: { date: { gte: nintyDaysAgo } }, orderBy: { date: "desc" }, take: 8 },
      qbrSessions:  { orderBy: { createdAt: "desc" }, take: 1, include: { items: { orderBy: { order: "asc" } } } },
      kycVersions:  { orderBy: { version: "desc" }, take: 1, select: { executiveSummary: true, strategicGoals: true } },
    },
  });

  if (!account) throw new Error("Account not found");

  const scores = account.kamScores.map((s) => `${s.overall}/100 (${s.health})`).join(", ");
  const lastSession = account.qbrSessions[0];
  const monthYear   = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const sessionTitle = requestedTitle || `${account.name} ${sessionType} - ${monthYear}`;

  // Step A: account state summary
  const promptA = `You are a QBR preparation agent. Summarise the state of this account.

Account: ${account.name} | Health: ${account.health} | ARR: $${account.arr.toLocaleString()}
Score history: ${scores}
Contract end: ${account.contractEnd?.toISOString().split("T")[0] ?? "N/A"}
KYC summary: ${account.kycVersions[0]?.executiveSummary ?? "N/A"}
Strategic goals: ${account.kycVersions[0]?.strategicGoals ?? "N/A"}
Open signals: ${account.signals.map((s) => `[${s.severity}] ${s.title}`).join("; ") || "none"}
Open actions: ${account.actions.map((a) => a.title).join("; ") || "none"}
Recent touchpoints: ${account.touchpoints.map((t) => `${t.type} (${new Date(t.date).toLocaleDateString()})`).join(", ") || "none"}
Previous session: ${lastSession ? `"${lastSession.title}" (${lastSession.status})` : "none"}

Return JSON only:
{
  "stateSummary": ["bullet 1", "bullet 2", "bullet 3"],
  "keyIssues": ["issue 1", "issue 2", "issue 3"]
}`;

  const tA = Date.now();
  const responseA = await complete({
    accountId,
    task: "qbr-agent-summary",
    messages: [{ role: "user", content: promptA }],
    maxTokens: 512,
    temperature: 0.2,
    jsonMode: true,
  });
  steps.push(makeStep("account-state-summary", promptA, responseA.content, Date.now() - tA));

  let stateData: { stateSummary: string[]; keyIssues: string[] } = { stateSummary: [], keyIssues: [] };
  try {
    const raw = responseA.content.replace(/```json|```/g, "").trim();
    stateData = { ...stateData, ...JSON.parse(raw) };
  } catch { /* keep defaults */ }

  // Step B: generate structured agenda
  const promptB = `You are a QBR agenda generator for a ${sessionType === "QBR" ? "Quarterly Business Review" : sessionType === "DBR" ? "Daily Business Review" : "Executive Business Review"}.

Account: ${account.name} | Health: ${account.health}
State summary:
${stateData.stateSummary.map((b) => `- ${b}`).join("\n")}
Key issues to address:
${stateData.keyIssues.map((i) => `- ${i}`).join("\n")}

Generate 5-8 agenda items. Return JSON only:
{
  "items": [
    { "order": 1, "category": "REVIEW"|"RISK"|"ACTION"|"EXPANSION"|"WRAP_UP", "title": "under 80 chars", "content": "2-3 sentence talking notes with data points", "status": "OPEN" }
  ],
  "suggestedAttendees": ["Role 1", "Role 2"],
  "executiveSummary": "1 sentence session framing"
}`;

  const tB = Date.now();
  const responseB = await complete({
    accountId,
    task: "qbr-agent-agenda",
    messages: [{ role: "user", content: promptB }],
    maxTokens: 2048,
    temperature: 0.4,
    jsonMode: true,
  });
  steps.push(makeStep("generate-agenda", promptB, responseB.content, Date.now() - tB));

  let parsed: {
    items: Array<{ order: number; category: string; title: string; content: string; status: string }>;
    suggestedAttendees: string[];
    executiveSummary: string;
  } = {
    items: [
      { order: 1, category: "REVIEW",   title: "Account Health & Score Review",    content: `Review ${account.name} health (${account.health}).`, status: "OPEN" },
      { order: 2, category: "RISK",     title: "Open Signals & Risks",             content: `${account.signals.length} unresolved signal(s).`, status: "OPEN" },
      { order: 3, category: "ACTION",   title: "Action Items Review",              content: `${account.actions.length} open action(s).`, status: "OPEN" },
      { order: 4, category: "EXPANSION",title: "Growth Opportunities",             content: "Identify expansion potential.", status: "OPEN" },
      { order: 5, category: "WRAP_UP",  title: "Next Steps & Commitments",         content: "Agree on owners and dates.", status: "OPEN" },
    ],
    suggestedAttendees: ["Account Executive", "KAM", "Customer Success"],
    executiveSummary: `${sessionType} for ${account.name}`,
  };

  try {
    const raw = responseB.content.replace(/```json|```/g, "").trim();
    const p = JSON.parse(raw);
    if (Array.isArray(p.items) && p.items.length > 0) parsed = p;
  } catch { /* use fallback */ }

  const sessionNotes = [
    `State summary:\n${stateData.stateSummary.map((b) => `- ${b}`).join("\n")}`,
    `\nKey issues:\n${stateData.keyIssues.map((i) => `- ${i}`).join("\n")}`,
    parsed.executiveSummary ? `\n\n${parsed.executiveSummary}` : "",
  ].join("").trim();

  const session = await prisma.$transaction(async (tx) => {
    const newSession = await tx.qbrSession.create({
      data: {
        accountId,
        type:        sessionType as any,
        status:      "DRAFT",
        title:       sessionTitle,
        scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        attendees:   JSON.stringify(parsed.suggestedAttendees ?? []),
        notes:       sessionNotes || null,
      },
    });
    await tx.qbrItem.createMany({
      data: parsed.items.map((item) => ({
        sessionId: newSession.id,
        order:     item.order,
        category:  item.category,
        title:     item.title,
        content:   item.content,
        status:    item.status ?? "OPEN",
      })),
    });
    return tx.qbrSession.findUnique({
      where: { id: newSession.id },
      include: { items: { orderBy: { order: "asc" } } },
    });
  });

  return {
    output: session as QbrSessionWithItems,
    steps,
    model: responseB.model,
    totalLatencyMs: Date.now() - agentStart,
  };
}
