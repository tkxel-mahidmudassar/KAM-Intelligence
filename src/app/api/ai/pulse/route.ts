import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getRoleFromRequest, ok, badRequest, serverError, guard } from "@/lib/api";
import { InsightType } from "@prisma/client";

function scoreOutOfFiveLabel(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score)) return "N/A";
  const normalized = score <= 5 ? score : score / 20;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}

// POST /api/ai/pulse  { accountId? }
// Generates AI Pulse insights. Pass accountId for account-specific, omit for portfolio-wide.
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "insight:view");
    if (denied) return denied;

    const body = await req.json().catch(() => ({}));
    const { accountId } = body;

    let context = "";
    let insightAccountId: string | null = accountId ?? null;

    if (accountId) {
      // Account-specific insight
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: {
          kamScores:    { orderBy: { computedAt: "desc" }, take: 1 },
          kpiDimensions:{ orderBy: { recordedAt: "desc" } },
          signals:      { where: { isResolved: false } },
          actions:      { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } },
        },
      });

      if (!account) return badRequest("Account not found");

      const latestScore = account.kamScores[0];
      context = `
Account: ${account.name} | Industry: ${account.industry} | ARR: $${account.arr.toLocaleString()}
Health: ${account.health} | Score: ${scoreOutOfFiveLabel(latestScore?.overall)}/5
Contract ends: ${account.contractEnd?.toISOString().split("T")[0] ?? "N/A"}
Open signals: ${account.signals.length}
Open actions: ${account.actions.length}
KPIs:
${account.kpiDimensions.map((k) => `  - ${k.name}: ${k.value}${k.unit ?? ""} (target: ${k.target ?? "N/A"}${k.unit ?? ""}, trend: ${k.trend ?? "flat"})`).join("\n")}
      `.trim();
    } else {
      // Portfolio-wide insight
      const accounts = await prisma.account.findMany({
        include: { kamScores: { orderBy: { computedAt: "desc" }, take: 1 } },
        orderBy: { health: "asc" },
      });

      context = `Portfolio of ${accounts.length} accounts:
${accounts.map((a) => `  - ${a.name}: ${a.health}, Score ${scoreOutOfFiveLabel(a.kamScores[0]?.overall)}/5, ARR $${a.arr.toLocaleString()}, renewal ${a.contractEnd?.toISOString().split("T")[0] ?? "N/A"}`).join("\n")}`;
    }

    const prompt = `You are a DotKAM engine. Based on the data below, generate a concise, specific, and actionable insight.

Return ONLY a JSON object with these exact keys:
{
  "type": "RISK" | "OPPORTUNITY" | "TREND" | "ANOMALY" | "RECOMMENDATION",
  "title": "short title under 80 chars",
  "summary": "2-3 sentence insight with specific numbers and recommended action",
  "confidence": 0.0-1.0
}

Data:
${context}`;

    const aiResponse = await complete({
      accountId: insightAccountId ?? undefined,
      task: "pulse-insight",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 4096,
      temperature: 0.5, // prose — analyst-like, consistent tone
    });

    // Parse JSON from response — handle plain JSON, ```json fences, or prose wrapping
    let parsed: { type: string; title: string; summary: string; confidence: number };
    const rawContent = aiResponse.content;
    try {
      // Find the outermost JSON object in the response (handles code fences, prose, etc.)
      // Find first { and last } to extract the full JSON object
      const firstBrace = rawContent.indexOf("{");
      const lastBrace  = rawContent.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error("No JSON braces found. Content length: " + rawContent.length + " preview: " + rawContent.slice(0, 60));
      }
      const jsonStr = rawContent.slice(firstBrace, lastBrace + 1);
      parsed = JSON.parse(jsonStr);
      if (!parsed.type || !parsed.title || !parsed.summary) throw new Error("Missing fields: " + JSON.stringify(Object.keys(parsed)));
    } catch {
      parsed = {
        type: "RECOMMENDATION",
        title: "AI Pulse Insight",
        summary: rawContent,
        confidence: 0.7,
      };
    }

    const insight = await prisma.aIPulseInsight.create({
      data: {
        accountId:    insightAccountId,
        type:         (parsed.type as InsightType) ?? InsightType.RECOMMENDATION,
        title:        parsed.title,
        summary:      parsed.summary,
        confidence:   parsed.confidence ?? 0.75,
        model:        aiResponse.model,
        promptTokens: aiResponse.promptTokens,
        outputTokens: aiResponse.outputTokens,
      },
    });

    return ok({ insight, latencyMs: aiResponse.latencyMs });
  } catch (err) {
    return serverError(err);
  }
}
