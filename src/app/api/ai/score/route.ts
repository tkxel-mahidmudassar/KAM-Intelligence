import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/ai";
import { getJiraAdapter } from "@/lib/adapters/jira";
import { getWorksphereAdapter } from "@/lib/adapters/worksphere";
import { getFinanceAdapter } from "@/lib/adapters/finance";
import { getRoleFromRequest, ok, badRequest, notFound, serverError, guard } from "@/lib/api";
import { AccountHealth } from "@prisma/client";
import { runTriggerEngine } from "@/lib/scoring/triggers";
import { expireRecommendationsForAccount } from "@/lib/scoring/expireRecommendations";
import { DEFAULT_WEIGHTS, WEIGHT_KEYS } from "@/lib/scoring/weights";
import { calculateKpiSubscores, clampScore, type KpiScoreKey } from "@/lib/scoring/kpi";
import { applyCriteriaOverrideToDimension, scoreDimensionFromKey } from "@/lib/scoring/scoreOverrideMath";
import { logAudit } from "@/lib/audit";
import { runMasterOrchestrator } from "@/lib/ai/agents/masterOrchestrator";

function scoreOutOfFiveLabel(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score)) return "N/A";
  const normalized = score <= 5 ? score : score / 20;
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
}

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
    const calculated = calculateKpiSubscores({ account, kpis, jira: j, worksphere: w, finance: f });
    const baseScores = calculated.scores;
    const scoreBreakdown = { ...calculated.breakdown };

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
      return clampScore(raw * 0.7 + (qSum[dim] / qCnt[dim]) * 0.3);
    };

    const finalCsat           = blend(baseScores.csat,           "csat");
    const finalRelationship   = blend(baseScores.relationship,   "relationship");
    const finalRisk           = blend(baseScores.risk,           "risk");
    const finalContractHealth = blend(baseScores.contractHealth, "contractHealth");
    const finalProjectHealth  = blend(baseScores.projectHealth,  "projectHealth");
    const finalResourceHealth = blend(baseScores.resourceHealth, "resourceHealth");
    const finalFinancial      = blend(baseScores.financial,      "financial");
    const finalWhitespace     = blend(baseScores.whitespace,     "whitespace");

    const questionnaireContributed = Object.keys(qCnt).length > 0;

    // ── Apply approved score overrides ────────────────────────────────────────
    const approvedOverrides = await prisma.scoreOverride.findMany({
      where: { accountId, status: "APPROVED" },
      select: { kpiKey: true, approvedValue: true },
    });

    const overrideMap: Record<string, Array<{ kpiKey: string; approvedValue: number }>> = {};
    for (const o of approvedOverrides) {
      if (o.approvedValue === null) continue;
      const dimension = scoreDimensionFromKey(o.kpiKey);
      if (!dimension) continue;
      overrideMap[dimension] = [
        ...(overrideMap[dimension] ?? []),
        { kpiKey: o.kpiKey, approvedValue: o.approvedValue },
      ];
    }

    const applyOverride = (val: number, key: string): number =>
      (overrideMap[key] ?? []).reduce((score, override) => (
        applyCriteriaOverrideToDimension(score, override.kpiKey, override.approvedValue)
      ), val);

    const scoredCsat           = applyOverride(finalCsat,           "csat");
    const scoredRelationship   = applyOverride(finalRelationship,   "relationship");
    const scoredRisk           = applyOverride(finalRisk,           "risk");
    const scoredContractHealth = applyOverride(finalContractHealth, "contractHealth");
    const scoredProjectHealth  = applyOverride(finalProjectHealth,  "projectHealth");
    const scoredResourceHealth = applyOverride(finalResourceHealth, "resourceHealth");
    const scoredFinancial      = applyOverride(finalFinancial,      "financial");
    const scoredWhitespace     = applyOverride(finalWhitespace,     "whitespace");

    const overriddenDimensions = Object.keys(overrideMap);

    const scoredByKey: Record<KpiScoreKey, number> = {
      csat: scoredCsat,
      relationship: scoredRelationship,
      risk: scoredRisk,
      contractHealth: scoredContractHealth,
      projectHealth: scoredProjectHealth,
      resourceHealth: scoredResourceHealth,
      financial: scoredFinancial,
      whitespace: scoredWhitespace,
    };

    for (const key of Object.keys(scoredByKey) as KpiScoreKey[]) {
      const contributed = qCnt[key] ? `Questionnaire blend applied from ${qCnt[key]} response(s).` : null;
      const overridden = overrideMap[key] !== undefined ? `Approved manual override applied.` : null;
      scoreBreakdown[key] = {
        ...scoreBreakdown[key],
        score: scoredByKey[key],
        drivers: [
          ...scoreBreakdown[key].drivers,
          ...(contributed ? [{ label: "Questionnaire", value: contributed, score: scoredByKey[key] }] : []),
          ...(overridden ? [{ label: "Override", value: overridden, score: scoredByKey[key] }] : []),
        ],
      };
    }

    // ── Overall weighted score ────────────────────────────────────────────────
    const overall = clampScore(
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
    const breakdownLines = (Object.keys(scoreBreakdown) as KpiScoreKey[])
      .map((key) => {
        const item = scoreBreakdown[key];
        const drivers = item.drivers.map((d) => `${d.label}: ${d.value}${typeof d.score === "number" ? ` (${scoreOutOfFiveLabel(d.score)}/5)` : ""}`).join("; ");
        return `${item.label}: ${scoreOutOfFiveLabel(item.score)}/5, weight ${item.weight}%, rationale: ${item.rationale}. Drivers: ${drivers}`;
      })
      .join("\n");

    const prompt = `You are a DotKAM engine. Write a 2-3 sentence executive narrative for this account health score. Be specific, factual, and action-oriented. No bullet points.

Account: ${account.name}
Overall Score: ${scoreOutOfFiveLabel(overall)}/5 (${health})
KPI breakdown:
${breakdownLines}
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
        temperature: 0.7, // prose narrative — factual but expressive
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
      aiNarrative = `${account.name} scored ${scoreOutOfFiveLabel(overall)}/5 (${health}).`
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

    // ── Run trigger engine (non-blocking) ────────────────────────────────────
    void runTriggerEngine(accountId, kpiScores);

    // ── Expire stale recommendations for this account (non-blocking) ─────────
    void expireRecommendationsForAccount(accountId, {
      csat:          scoredCsat,
      relationship:  scoredRelationship,
      risk:          scoredRisk,
      contractHealth: scoredContractHealth,
      financial:     scoredFinancial,
      projectHealth: scoredProjectHealth,
      resourceHealth: scoredResourceHealth,
      whitespace:    scoredWhitespace,
    });

    // ── Fire master orchestrator for score_computed (non-blocking) ───────────
    void (async () => {
      try {
        const newSignals = await prisma.signal.findMany({
          where: { accountId, isResolved: false, pendingReview: true },
          select: { title: true },
          orderBy: { detectedAt: "desc" },
          take: 5,
        });
        await runMasterOrchestrator("score_computed", {
          accountId,
          role,
          kpiScores,
          newSignalTitles: newSignals.map((s) => s.title),
        });
      } catch (err) {
        console.error("[score] master orchestrator failed:", err);
      }
    })();

    await logAudit({ role, accountId, action: "score.computed", entity: "KamScore", entityId: score.id, metadata: { role, overall, health, questionnaireContributed, overriddenDimensions, csat: scoredCsat, relationship: scoredRelationship, risk: scoredRisk, contractHealth: scoredContractHealth, projectHealth: scoredProjectHealth, resourceHealth: scoredResourceHealth, financial: scoredFinancial, whitespace: scoredWhitespace } });

    return ok({ score, breakdown: scoreBreakdown, questionnaireContributed, overriddenDimensions, model: aiModel, latencyMs: aiLatency });
  } catch (err) {
    return serverError(err);
  }
}
