import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getJiraAdapter } from "@/lib/adapters/jira";
import { getWorksphereAdapter } from "@/lib/adapters/worksphere";
import { getFinanceAdapter } from "@/lib/adapters/finance";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";
import { AccountHealth } from "@prisma/client";
import { runTriggerEngine } from "@/lib/scoring/triggers";
import { DEFAULT_WEIGHTS, WEIGHT_KEYS } from "@/lib/scoring/weights";
import { logAudit } from "@/lib/audit";
import { runScoreActionsAgent } from "@/lib/ai/agents/scoreActions";

// ─── Load weights from DB (fallback to defaults) ─────────────────────────────

async function loadWeights(): Promise<Record<string, number>> {
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: "global" } });
    if (cfg?.scoreWeights && typeof cfg.scoreWeights === "object") {
      const stored = cfg.scoreWeights as Record<string, number>;
      const w: Record<string, number> = { ...DEFAULT_WEIGHTS };
      for (const key of WEIGHT_KEYS) {
        if (typeof stored[key] === "number") w[key] = stored[key];
      }
      return w;
    }
  } catch {
    // ignore — use defaults
  }
  return { ...DEFAULT_WEIGHTS };
}

function healthFromScore(overall: number): AccountHealth {
  if (overall >= 70) return AccountHealth.HEALTHY;
  if (overall >= 45) return AccountHealth.AT_RISK;
  return AccountHealth.CRITICAL;
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

function avgKpis(kpis: { value: number; target: number }[]): number {
  if (!kpis.length) return 50;
  const scores = kpis.map((k) => Math.min(100, (k.value / (k.target || 1)) * 100));
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// POST /api/ai/score  { accountId }
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "score:view");
    if (denied) return denied;

    const { accountId } = await req.json();
    if (!accountId) return badRequest("accountId is required");

    // Load configurable weights (percentages → fractions)
    const wPct = await loadWeights();
    const W: Record<string, number> = {};
    for (const key of WEIGHT_KEYS) W[key] = (wPct[key] ?? DEFAULT_WEIGHTS[key]) / 100;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { kpiDimensions: { orderBy: { recordedAt: "desc" } } },
    });
    if (!account) return notFound("Account");

    // Fetch adapter data in parallel
    const [jira, worksphere, finance] = await Promise.all([
      getJiraAdapter().fetch(accountId),
      getWorksphereAdapter().fetch(accountId),
      getFinanceAdapter().fetch(accountId),
    ]);

    const j = jira.data;
    const w = worksphere.data;
    const f = finance.data;

    const kpis = account.kpiDimensions.map((k) => ({
      name: k.name, category: k.category, value: k.value, target: k.target ?? k.value,
    }));
    const byCategory = (cat: string) => kpis.filter((k) => k.category === cat);

    // ── 1. CSAT (20%) — NPS + platform utilisation ───────────────────────────
    const npsScore    = clamp(((w.npsScore ?? 30) + 100) / 2);          // normalise -100..100 → 0..100
    const utilScore   = clamp(w.utilizationPct);
    const csatKpis    = byCategory("engagement");
    const csat        = clamp((npsScore * 0.5 + utilScore * 0.3 + avgKpis(csatKpis.length ? csatKpis : [{ value: 50, target: 50 }]) * 0.2));

    // ── 2. Relationship (15%) ─────────────────────────────────────────────────
    const relKpis     = byCategory("relationship");
    const relationship = clamp(avgKpis(relKpis.length ? relKpis : [{ value: 50, target: 50 }]));

    // ── 3. Risk (15%) — ticket load, critical issues ──────────────────────────
    const ticketScore = clamp(100 - j.openTickets * 3);
    const critScore   = clamp(100 - j.criticalTickets * 10);
    const risk        = clamp(ticketScore * 0.6 + critScore * 0.4);

    // ── 4. Contract Health (15%) — ARR utilisation, renewal proximity ─────────
    const revScore    = clamp(f.revenueUtilizationPct);
    const overdueScore = clamp(100 - (f.overdueAmount / Math.max(account.arr / 12, 1)) * 100);
    const daysLeft    = account.contractEnd
      ? Math.ceil((new Date(account.contractEnd).getTime() - Date.now()) / 864e5)
      : 365;
    const renewalScore = clamp(daysLeft > 180 ? 90 : daysLeft > 90 ? 70 : daysLeft > 30 ? 40 : 20);
    const contractHealth = clamp(revScore * 0.4 + overdueScore * 0.3 + renewalScore * 0.3);

    // ── 5. Project Health (10%) — sprint velocity, delivery ───────────────────
    const sprintVelocity  = j.activeSprint?.velocity ?? 70;
    const velocityScore   = clamp(sprintVelocity);
    const resolutionScore = clamp(100 - j.avgResolutionDays * 5);
    const projectHealth   = clamp(velocityScore * 0.6 + resolutionScore * 0.4);

    // ── 6. Resource Health (10%) — active user adoption ──────────────────────
    const adoptionPct    = w.totalLicenses > 0 ? (w.activeUsers / w.totalLicenses) * 100 : 50;
    const resourceHealth = clamp((adoptionPct * 0.6 + utilScore * 0.4));

    // ── 7. Financial (10%) — revenue utilisation ──────────────────────────────
    const financial      = clamp((revScore * 0.7 + overdueScore * 0.3));

    // ── 8. Whitespace (5%) — expansion opportunity indicator ─────────────────
    const arrTier  = account.arr >= 500_000 ? 80 : account.arr >= 200_000 ? 65 : account.arr >= 100_000 ? 50 : 35;
    const whitespace = clamp(arrTier + (csat > 70 ? 15 : csat > 50 ? 5 : 0));

    // ── Questionnaire blending (blend adapter scores with confirmed responses) ─
    // Fetch confirmed OR AI-prepopulated responses
    const qResponses = await prisma.questionnaireResponse.findMany({
      where: {
        accountId,
        OR: [{ confirmedBy: { not: null } }, { prepopulated: true }],
      },
      select: { section: true, response: true, inputType: true },
    });

    // Map questionnaire section names → dimension keys
    const SECTION_TO_DIM: Record<string, string> = {
      csat:         "csat",
      relationship: "relationship",
      risk:         "risk",
      contract:     "contractHealth",
      whitespace:   "whitespace",
      project:      "projectHealth",
      resource:     "resourceHealth",
      financial:    "financial",
    };

    // For "risk" and "contract" sections, boolean "true" = problem exists → low score
    const INVERTED_BOOL = new Set(["risk", "contract"]);

    function responseToScore(section: string, resp: string, inputType: string): number | null {
      if (inputType === "SCALE") {
        const v = parseFloat(resp);
        return isNaN(v) ? null : Math.min(100, Math.max(0, v));
      }
      if (inputType === "BOOLEAN") {
        const isTrue = resp.toLowerCase() === "true";
        return INVERTED_BOOL.has(section) ? (isTrue ? 20 : 85) : (isTrue ? 85 : 30);
      }
      return null; // TEXT: skip
    }

    const qSum: Record<string, number>  = {};
    const qCnt: Record<string, number>  = {};
    for (const r of qResponses) {
      const dim = SECTION_TO_DIM[r.section];
      if (!dim) continue;
      const s = responseToScore(r.section, r.response, r.inputType);
      if (s === null) continue;
      qSum[dim] = (qSum[dim] ?? 0) + s;
      qCnt[dim] = (qCnt[dim] ?? 0) + 1;
    }

    // 70% adapter, 30% questionnaire when both are available
    const blend = (raw: number, dim: string): number => {
      if (!qCnt[dim]) return raw;
      return clamp(raw * 0.7 + (qSum[dim] / qCnt[dim]) * 0.3);
    };

    const finalCsat           = blend(csat,           "csat");
    const finalRelationship   = blend(relationship,   "relationship");
    const finalRisk           = blend(risk,           "risk");
    const finalContractHealth = blend(contractHealth, "contractHealth");
    const finalProjectHealth  = blend(projectHealth,  "projectHealth");
    const finalResourceHealth = blend(resourceHealth, "resourceHealth");
    const finalFinancial      = blend(financial,      "financial");
    const finalWhitespace     = blend(whitespace,     "whitespace");

    const questionnaireContributed = Object.keys(qCnt).length > 0;

    // ── Apply approved score overrides ────────────────────────────────────────
    const approvedOverrides = await prisma.scoreOverride.findMany({
      where: { accountId, status: "APPROVED" },
      select: { kpiKey: true, approvedValue: true },
    });

    const overrideMap: Record<string, number> = {};
    for (const o of approvedOverrides) {
      if (o.approvedValue !== null) overrideMap[o.kpiKey] = clamp(o.approvedValue);
    }

    const applyOverride = (val: number, key: string): number =>
      overrideMap[key] !== undefined ? overrideMap[key] : val;

    const scoredCsat           = applyOverride(finalCsat,           "csat");
    const scoredRelationship   = applyOverride(finalRelationship,   "relationship");
    const scoredRisk           = applyOverride(finalRisk,           "risk");
    const scoredContractHealth = applyOverride(finalContractHealth, "contractHealth");
    const scoredProjectHealth  = applyOverride(finalProjectHealth,  "projectHealth");
    const scoredResourceHealth = applyOverride(finalResourceHealth, "resourceHealth");
    const scoredFinancial      = applyOverride(finalFinancial,      "financial");
    const scoredWhitespace     = applyOverride(finalWhitespace,     "whitespace");

    const overriddenDimensions = Object.keys(overrideMap);

    // ── Overall weighted score ────────────────────────────────────────────────
    const overall = clamp(
      scoredCsat           * W.csat           +
      scoredRelationship   * W.relationship   +
      scoredRisk           * W.risk           +
      scoredContractHealth * W.contractHealth +
      scoredProjectHealth  * W.projectHealth  +
      scoredResourceHealth * W.resourceHealth +
      scoredFinancial      * W.financial      +
      scoredWhitespace     * W.whitespace
    );
    const health = healthFromScore(overall);

    // ── AI narrative ──────────────────────────────────────────────────────────
    const prompt = `You are a KAM Intelligence engine. Write a 2-3 sentence executive narrative for this account health score. Be specific, factual, and action-oriented. No bullet points.

Account: ${account.name}
Overall Score: ${overall}/100 (${health})
CSAT: ${scoredCsat}/100 (NPS: ${w.npsScore ?? "N/A"}, Platform utilisation: ${w.utilizationPct}%)
Relationship: ${scoredRelationship}/100
Risk: ${scoredRisk}/100 (Open tickets: ${j.openTickets}, Critical: ${j.criticalTickets})
Contract Health: ${scoredContractHealth}/100 (Revenue utilisation: ${f.revenueUtilizationPct}%, Overdue: $${f.overdueAmount})
Project Health: ${scoredProjectHealth}/100 (Sprint velocity: ${sprintVelocity}%, Avg resolution: ${j.avgResolutionDays}d)
Resource Health: ${scoredResourceHealth}/100 (Active users: ${w.activeUsers}/${w.totalLicenses})
Financial: ${scoredFinancial}/100
Whitespace: ${scoredWhitespace}/100
Contract ends: ${account.contractEnd?.toISOString().split("T")[0] ?? "N/A"}
${questionnaireContributed ? "(Scores include blending with confirmed questionnaire responses)" : ""}${overriddenDimensions.length > 0 ? `\n(Manual overrides applied to: ${overriddenDimensions.join(", ")})` : ""}`;

    // ── AI narrative (graceful fallback — score persists even if LLM fails) ─────
    let aiNarrative: string;
    let aiModel = "fallback";
    let aiLatency = 0;
    try {
      const aiResponse = await complete({
        accountId,
        task: "score-narrative",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 2048,
        temperature: 0.2,
      });
      aiNarrative = aiResponse.content;
      aiModel     = aiResponse.model;
      aiLatency   = aiResponse.latencyMs;
    } catch (narrativeErr) {
      console.warn("[score] narrative generation failed, using template fallback:", narrativeErr);
      const weakDims = [
        scoredCsat < 60 ? "customer satisfaction" : null,
        scoredRisk < 60 ? "risk indicators" : null,
        scoredContractHealth < 60 ? "contract health" : null,
        scoredRelationship < 60 ? "relationship health" : null,
      ].filter(Boolean);
      aiNarrative = `${account.name} scored ${overall}/100 (${health}).`
        + (weakDims.length > 0 ? ` Key concerns: ${weakDims.join(", ")}.` : " All dimensions are within acceptable range.")
        + ` Contract ${account.contractEnd ? `ends ${account.contractEnd.toISOString().split("T")[0]}` : "end date not set"}.`;
    }

    // ── Persist ───────────────────────────────────────────────────────────────
    const score = await prisma.kamScore.create({
      data: {
        accountId,
        overall,
        csat:           scoredCsat,
        relationship:   scoredRelationship,
        risk:           scoredRisk,
        contractHealth: scoredContractHealth,
        projectHealth:  scoredProjectHealth,
        resourceHealth: scoredResourceHealth,
        financial:      scoredFinancial,
        whitespace:     scoredWhitespace,
        health,
        aiNarrative,
      },
    });

    await prisma.account.update({
      where: { id: accountId },
      data: { health, healthUpdatedAt: new Date() },
    });

    // ── Run trigger engine (non-blocking — errors are swallowed internally) ────
    const kpiScores = {
      csat:           scoredCsat,
      relationship:   scoredRelationship,
      risk:           scoredRisk,
      contractHealth: scoredContractHealth,
      projectHealth:  scoredProjectHealth,
      resourceHealth: scoredResourceHealth,
      financial:      scoredFinancial,
      whitespace:     scoredWhitespace,
    };
    void runTriggerEngine(accountId, kpiScores);

    // ── Run score actions agent (non-blocking) ────────────────────────────────
    void (async () => {
      try {
        const newSignals = await prisma.signal.findMany({
          where: { accountId, isResolved: false, pendingReview: true },
          select: { title: true },
          orderBy: { detectedAt: "desc" },
          take: 5,
        });
        await runScoreActionsAgent(accountId, kpiScores, newSignals.map((s) => s.title));
      } catch (err) {
        console.error("[score] scoreActionsAgent failed:", err);
      }
    })();

    await logAudit({ role, accountId, action: "score.computed", entity: "KamScore", entityId: score.id, metadata: { role, overall, health, questionnaireContributed, overriddenDimensions, csat: scoredCsat, relationship: scoredRelationship, risk: scoredRisk, contractHealth: scoredContractHealth, projectHealth: scoredProjectHealth, resourceHealth: scoredResourceHealth, financial: scoredFinancial, whitespace: scoredWhitespace } });

    return ok({ score, questionnaireContributed, overriddenDimensions, model: aiModel, latencyMs: aiLatency });
  } catch (err) {
    return serverError(err);
  }
}
