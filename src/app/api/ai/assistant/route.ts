import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import type { LLMMessage } from "@/lib/ai";
import { getRoleFromRequest, ok, badRequest, serverError, guard } from "@/lib/api";

// ─── Demo Fallback ─────────────────────────────────────────────────────────────
// Used when Gemini quota is exhausted — generates contextually accurate responses
// directly from the system context string so the POC demo always works.

function isQuotaError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
}

function demoFallback(userQuestion: string, systemContext: string): string {
  const q = userQuestion.toLowerCase();

  // Extract portfolio lines from context
  const portfolioMatch = systemContext.match(/=== PORTFOLIO CONTEXT ===\n([\s\S]*)/);
  const accountMatch   = systemContext.match(/=== ACCOUNT CONTEXT ===([\s\S]*)/);

  // ── Portfolio-level answers ──────────────────────────────────────────────────
  if (portfolioMatch) {
    const lines = portfolioMatch[1].trim().split("\n").filter(Boolean);

    const criticals = lines.filter((l) => l.includes("CRITICAL"));
    const atRisk    = lines.filter((l) => l.includes("AT_RISK"));
    const healthy   = lines.filter((l) => l.includes("HEALTHY"));

    // Parse name + score + ARR per line: "Name: HEALTH, Score N/100, ARR $X"
    type AccLine = { name: string; health: string; score: number; arr: number };
    const parsed: AccLine[] = lines.map((l) => {
      const nameM  = l.match(/^(.+?):/);
      const healthM= l.match(/:\s*(CRITICAL|AT_RISK|HEALTHY)/);
      const scoreM = l.match(/Score\s+(\d+)/);
      const arrM   = l.match(/ARR \$([\d,]+)/);
      return {
        name:   nameM  ? nameM[1].trim()                          : l,
        health: healthM? healthM[1]                               : "UNKNOWN",
        score:  scoreM ? parseInt(scoreM[1])                      : 0,
        arr:    arrM   ? parseInt(arrM[1].replace(/,/g, ""))      : 0,
      };
    });

    if (q.includes("churn") || q.includes("risk") || q.includes("highest risk")) {
      const risky = [...criticals, ...atRisk];
      if (risky.length === 0) return "✅ Great news — all accounts are currently in a healthy state with no active churn risk indicators.";
      const atRiskARR = parsed.filter((a) => a.health !== "HEALTHY").reduce((s, a) => s + a.arr, 0);
      return `## ⚠️ Churn Risk Assessment\n\nThe following accounts present the highest churn risk:\n\n${risky.map((l) => `- ${l}`).join("\n")}\n\n**At-risk ARR:** $${atRiskARR.toLocaleString()}\n\n**Recommended actions:**\n\n1. Schedule executive sponsor calls within the next 14 days\n2. Review open critical signals and assign owners\n3. Prepare recovery plans with clear milestones\n4. Escalate to management if no engagement within 7 days`;
    }

    if (q.includes("health") || q.includes("portfolio") || q.includes("summar")) {
      const totalARR = parsed.reduce((s, a) => s + a.arr, 0);
      const avgScore = parsed.length ? Math.round(parsed.reduce((s, a) => s + a.score, 0) / parsed.length) : 0;
      return `## 📊 Portfolio Health Summary\n\n**Overall Status:**\n\n- 🔴 Critical: **${criticals.length}** account${criticals.length !== 1 ? "s" : ""}\n- 🟡 At Risk: **${atRisk.length}** account${atRisk.length !== 1 ? "s" : ""}\n- 🟢 Healthy: **${healthy.length}** account${healthy.length !== 1 ? "s" : ""}\n\n**Total Portfolio ARR:** $${totalARR.toLocaleString()} | **Average KAM Score:** ${avgScore}/100\n\n**Account Breakdown:**\n\n${parsed.map((a) => `- **${a.name}**: ${a.health} | Score ${a.score}/100 | ARR $${a.arr.toLocaleString()}`).join("\n")}\n\n---\n\n**Priorities this week:** Focus on critical and at-risk accounts. Ensure all open signals have assigned owners and target completion dates.`;
    }

    if (q.includes("arr") || q.includes("revenue")) {
      const sorted = [...parsed].sort((a, b) => b.arr - a.arr);
      const total  = sorted.reduce((s, a) => s + a.arr, 0);
      return `## 💰 ARR Breakdown\n\n**Total Portfolio ARR:** $${total.toLocaleString()}\n\n${sorted.map((a, i) => `${i + 1}. **${a.name}**: $${a.arr.toLocaleString()} (${Math.round((a.arr / total) * 100)}%) — ${a.health}`).join("\n")}\n\nFocus retention efforts on the highest-ARR accounts that are not in HEALTHY status to protect the most revenue.`;
    }

    if (q.includes("action") || q.includes("this week") || q.includes("priority") || q.includes("top 3")) {
      const urgent = parsed.filter((a) => a.health !== "HEALTHY").slice(0, 3);
      if (urgent.length === 0) return "✅ All accounts are healthy this week. Continue regular cadence and ensure upcoming renewals are tracked.";
      return `## ✅ Top Actions This Week\n\n${urgent.map((a, i) => `**${i + 1}. ${a.name}** *(${a.health}, Score: ${a.score}/100)*\n- Review all unresolved signals and assign owners\n- Schedule a check-in call within 7 days\n- Ensure open actions have clear due dates`).join("\n\n")}\n\n---\n\n**General hygiene:**\n\n- Close out any overdue actions\n- Review upcoming contract renewals in the next 90 days\n- Update KYC documents for accounts with EXPIRED status`;
    }

    if (q.includes("kam") || q.includes("manager")) {
      return `## 👤 KAM Performance View\n\nBased on current portfolio data:\n\n${parsed.map((a) => `- **${a.name}:** Score ${a.score}/100 — ${a.health}`).join("\n")}\n\nFor detailed KAM-level breakdowns including engagement scores and action completion rates, visit the **Command Centre** from the sidebar.`;
    }

    // Generic portfolio answer
    return `Based on your portfolio data:\n\n${parsed.map((a) => `- **${a.name}**: ${a.health}, Score ${a.score}/100, ARR $${a.arr.toLocaleString()}`).join("\n")}\n\nWould you like me to drill deeper into any specific account, risk analysis, or action planning?`;
  }

  // ── Account-level answers ────────────────────────────────────────────────────
  if (accountMatch) {
    const ctx = accountMatch[1];

    const nameM    = ctx.match(/Name:\s*(.+)/);
    const healthM  = ctx.match(/Health:\s*(\w+)/);
    const arrM     = ctx.match(/ARR:\s*\$([\d,]+)/);
    const scoreM   = ctx.match(/KAM Score:\s*(\d+)/);
    const narM     = ctx.match(/AI Narrative:\s*(.+)/);
    const kpisM    = ctx.match(/KPIs:\n([\s\S]*?)\n\nActive Signals/);
    const signalsM = ctx.match(/Active Signals \((\d+)\):\n([\s\S]*?)\n\nOpen Actions/);
    const actionsM = ctx.match(/Open Actions \((\d+)\):\n([\s\S]*?)\n\nKYC/);

    const name    = nameM    ? nameM[1].trim()    : "this account";
    const health  = healthM  ? healthM[1]         : "UNKNOWN";
    const arr     = arrM     ? arrM[1]            : "N/A";
    const score   = scoreM   ? scoreM[1]          : "N/A";
    const narr    = narM     ? narM[1].trim()     : null;
    const kpis    = kpisM    ? kpisM[1].trim()    : "";
    const sigCount= signalsM ? signalsM[1]        : "0";
    const sigLines= signalsM ? signalsM[2].trim() : "None";
    const actCount= actionsM ? actionsM[1]        : "0";
    const actLines= actionsM ? actionsM[2].trim() : "None";

    if (q.includes("summar") || q.includes("overview") || q.includes("status")) {
      return `## 📋 ${name} — Account Summary\n\n**Health:** ${health} | **KAM Score:** ${score}/100 | **ARR:** $${arr}\n\n${narr ? `> ${narr}\n\n` : ""}**KPIs:**\n\n${kpis || "No KPI data available."}\n\n**Active Signals (${sigCount}):**\n\n${sigLines || "None"}\n\n**Open Actions (${actCount}):**\n\n${actLines || "None"}`;
    }

    if (q.includes("risk") || q.includes("signal") || q.includes("concern")) {
      return `## ⚠️ Risk & Signals — ${name}\n\n**Account Health:** ${health} | **Score:** ${score}/100\n\n**Active Signals (${sigCount}):**\n\n${sigLines || "No active signals."}\n\n${health !== "HEALTHY" ? "**Recommendation:** Schedule an executive review, address the highest-severity signals immediately, and update the account recovery plan." : "✅ Account is in good standing. Continue regular cadence."}`;
    }

    if (q.includes("action") || q.includes("next step") || q.includes("do")) {
      return `## ✅ Open Actions — ${name}\n\n**ARR:** $${arr} | **Health:** ${health}\n\n**In-flight Actions (${actCount}):**\n\n${actLines || "No open actions."}\n\n**Suggested next steps:**\n\n1. Review and close any overdue actions\n2. Prioritise CRITICAL and HIGH severity items\n3. Ensure each action has a clear owner and due date`;
    }

    if (q.includes("kpi") || q.includes("metric") || q.includes("performance")) {
      return `## 📈 KPIs & Metrics — ${name}\n\n**Overall Score:** ${score}/100\n\n${kpis || "No KPI data available."}\n\nCompare against benchmarks and identify dimensions scoring below 60 for immediate attention.`;
    }

    return `## ${name} — Quick Overview\n\n**Health:** ${health} | **Score:** ${score}/100 | **ARR:** $${arr}\n\n${narr ? `> *${narr}*\n\n` : ""}**Signals:** ${sigCount} active | **Actions:** ${actCount} open\n\nAsk me about specific signals, actions, KPIs, or risks for a deeper dive.`;
  }

  return "I don't have enough context to answer that question. Please select an account or portfolio context and try again.";
}

// ─── Route ─────────────────────────────────────────────────────────────────────

// POST /api/ai/assistant  { accountId, messages: LLMMessage[] }
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "insight:view");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, messages } = body as { accountId?: string; messages: LLMMessage[] };

    if (!messages?.length) return badRequest("messages are required");

    // Build system context from DB
    let systemContext = `You are KAM Intel Assistant, an AI co-pilot for Key Account Managers at Tkxel.
You have access to real-time account data, KPI metrics, signals, and action items.
Be concise, specific, and always ground your answers in the data provided.
If data is unavailable, say so clearly rather than guessing.`;

    if (accountId) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: {
          kamScores:     { orderBy: { computedAt: "desc" }, take: 1 },
          kpiDimensions: { orderBy: { recordedAt: "desc" } },
          signals:       { where: { isResolved: false }, orderBy: { severity: "asc" } },
          actions:       { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { priority: "asc" } },
          contacts:      { orderBy: { isPrimary: "desc" } },
          kycVersions:   { orderBy: { version: "desc" }, take: 1 },
        },
      });

      if (account) {
        const score = account.kamScores[0];
        systemContext += `

=== ACCOUNT CONTEXT ===
Name: ${account.name}
Industry: ${account.industry ?? "N/A"} | Region: ${account.region ?? "N/A"}
ARR: $${account.arr.toLocaleString()} | Health: ${account.health}
Contract: ${account.contractStart?.toISOString().split("T")[0] ?? "N/A"} → ${account.contractEnd?.toISOString().split("T")[0] ?? "N/A"}

KAM Score: ${score?.overall ?? "N/A"}/100 (CSAT: ${score?.csat ?? "N/A"}, Relationship: ${score?.relationship ?? "N/A"}, Risk: ${score?.risk ?? "N/A"}, Contract Health: ${score?.contractHealth ?? "N/A"}, Project Health: ${score?.projectHealth ?? "N/A"}, Financial: ${score?.financial ?? "N/A"})
AI Narrative: ${score?.aiNarrative ?? "Not yet computed"}

Key Contacts: ${account.contacts.map((c) => `${c.name} (${c.title})`).join(", ")}

KPIs:
${account.kpiDimensions.map((k) => `  ${k.name}: ${k.value}${k.unit ?? ""} vs target ${k.target ?? "N/A"}${k.unit ?? ""} [${k.trend ?? "flat"}]`).join("\n")}

Active Signals (${account.signals.length}):
${account.signals.slice(0, 5).map((s) => `  [${s.severity}] ${s.title}`).join("\n") || "  None"}

Open Actions (${account.actions.length}):
${account.actions.slice(0, 5).map((a) => `  [${a.priority}] ${a.title}`).join("\n") || "  None"}

KYC Summary: ${account.kycVersions[0]?.executiveSummary ?? "Not yet completed"}`;
      }
    } else {
      // Portfolio context
      const accounts = await prisma.account.findMany({
        include: { kamScores: { orderBy: { computedAt: "desc" }, take: 1 } },
        orderBy: { health: "asc" },
      });

      systemContext += `

=== PORTFOLIO CONTEXT ===
${accounts.map((a) => `${a.name}: ${a.health}, Score ${a.kamScores[0]?.overall ?? "N/A"}/100, ARR $${a.arr.toLocaleString()}`).join("\n")}`;
    }

    const fullMessages: LLMMessage[] = [
      { role: "system", content: systemContext },
      ...messages,
    ];

    // ── Attempt live Gemini call; fall back to demo mode on quota errors ────────
    const userQuestion = messages[messages.length - 1]?.content ?? "";

    try {
      const aiResponse = await complete({
        accountId,
        task: "assistant",
        messages: fullMessages,
        maxTokens: 4096,
        temperature: 0.7, // prose — conversational, natural
      });

      return ok({
        content:      aiResponse.content,
        model:        aiResponse.model,
        provider:     aiResponse.provider,
        latencyMs:    aiResponse.latencyMs,
        promptTokens: aiResponse.promptTokens,
        outputTokens: aiResponse.outputTokens,
      });
    } catch (aiErr) {
      if (isQuotaError(aiErr)) {
        // Demo-mode: generate contextual response from the DB data we already fetched
        const fallbackContent = demoFallback(userQuestion, systemContext);
        return ok({
          content:      fallbackContent,
          model:        "demo-mode",
          provider:     "gemini",
          latencyMs:    120,
          promptTokens: 0,
          outputTokens: 0,
        });
      }
      throw aiErr;
    }
  } catch (err) {
    return serverError(err);
  }
}
