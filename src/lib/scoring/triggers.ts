/**
 * KAM Score Trigger Engine
 *
 * Called after every score recompute. Compares the 8 KPI dimension scores
 * against defined thresholds and:
 *   • Creates new Signal records when a KPI falls below a threshold
 *   • Escalates WARNING → CRITICAL when a score deteriorates further
 *   • Resolves existing signals when the KPI recovers above all thresholds
 *   • Creates an UPSELL_OPPORTUNITY INFO signal when whitespace + customer success are high
 *
 * All operations are idempotent — duplicate signals are never created.
 */

import { prisma } from "@/lib/prisma";
import type { SignalType } from "@prisma/client";
import { runSignalTriageAgent } from "@/lib/ai/agents/signalTriage";

// ─── KPI score snapshot passed in by the score route ─────────────────────────

export interface KpiScores {
  csat: number;
  relationship: number;
  risk: number;
  contractHealth: number;
  projectHealth: number;
  resourceHealth: number;
  financial: number;
  whitespace: number;
}

// ─── Negative trigger rules ───────────────────────────────────────────────────

interface TriggerRule {
  /** Which KPI dimension this rule watches */
  kpiKey: keyof KpiScores;
  /** Signal type to raise/lower */
  signalType: SignalType;
  /**
   * Score below this → CRITICAL severity.
   * null means this signal never reaches CRITICAL via this rule.
   */
  criticalThreshold: number | null;
  /**
   * Score below this (but not CRITICAL) → WARNING severity.
   * Score at or above this → healthy, resolve any open signal.
   */
  warningThreshold: number;
  titleFn: (score: number) => string;
  descFn: (score: number) => string;
}

const RULES: TriggerRule[] = [
  {
    kpiKey:             "csat",
    signalType:         "NPS_DECLINE",
    criticalThreshold:  40,
    warningThreshold:   62,
    titleFn: (s) => `Customer success at risk (${s}/100)`,
    descFn:  (s) => `Customer Success scored ${s}/100 — customer feedback, confidence, delivery satisfaction, communication satisfaction, or issue resolution is below benchmark.`,
  },
  {
    kpiKey:             "risk",
    signalType:         "CHURN_RISK",
    criticalThreshold:  35,
    warningThreshold:   58,
    titleFn: (s) => `Churn risk elevated (risk score ${s}/100)`,
    descFn:  (s) => `Risk dimension scored ${s}/100. Elevated open ticket count or critical issues detected. Review support health immediately.`,
  },
  {
    kpiKey:             "risk",
    signalType:         "TICKET_SPIKE",
    criticalThreshold:  25,
    warningThreshold:   45,
    titleFn: (s) => `Support ticket volume spiking (risk ${s}/100)`,
    descFn:  (s) => `The risk dimension dropped to ${s}/100, likely driven by a spike in open or critical support tickets. Escalation review recommended.`,
  },
  {
    kpiKey:             "contractHealth",
    signalType:         "CONTRACT_EXPIRY",
    criticalThreshold:  38,
    warningThreshold:   60,
    titleFn: (s) => `Contract health deteriorating (${s}/100)`,
    descFn:  (s) => `Contract health scored ${s}/100. Review ARR utilisation, overdue invoices, and renewal timeline to prevent lapse.`,
  },
  {
    kpiKey:             "financial",
    signalType:         "REVENUE_DROP",
    criticalThreshold:  40,
    warningThreshold:   60,
    titleFn: (s) => `Revenue health flagged (financial ${s}/100)`,
    descFn:  (s) => `Financial dimension scored ${s}/100. Possible causes: overdue invoices, under-utilised ARR, or billing anomalies.`,
  },
  {
    kpiKey:             "relationship",
    signalType:         "RELATIONSHIP_CHANGE",
    criticalThreshold:  null,
    warningThreshold:   50,
    titleFn: (s) => `Relationship health needs attention (${s}/100)`,
    descFn:  (s) => `Relationship Health scored ${s}/100. Review executive engagement, stakeholder coverage, relationship penetration, champion strength, and engagement cadence.`,
  },
  {
    kpiKey:             "resourceHealth",
    signalType:         "ENGAGEMENT_LOW",
    criticalThreshold:  null,
    warningThreshold:   50,
    titleFn: (s) => `Resource health below benchmark (${s}/100)`,
    descFn:  (s) => `Resource Health scored ${s}/100. Review dependency risk, critical coverage, team stability, skill alignment, and backup readiness.`,
  },
];

// ─── Upsell / opportunity trigger ────────────────────────────────────────────

const UPSELL_WHITESPACE_MIN = 70;
const UPSELL_CSAT_MIN       = 65;

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Run the trigger engine for one account after a score recompute.
 * Silently swallows errors so a trigger failure never breaks score persistence.
 */
export async function runTriggerEngine(
  accountId: string,
  scores: KpiScores,
): Promise<void> {
  try {
    // Load all unresolved signals for this account once (minimise DB round-trips)
    const openSignals = await prisma.signal.findMany({
      where: { accountId, isResolved: false },
      select: { id: true, type: true, severity: true },
    });
    const byType = new Map(openSignals.map((s) => [s.type as string, s]));

    await Promise.all([
      runNegativeTriggers(accountId, scores, byType),
      runUpsellTrigger(accountId, scores, byType),
      runDriftTrigger(accountId, scores, byType),
    ]);
  } catch (err) {
    console.error("[triggers] engine failed for", accountId, err);
  }
}

// ─── Negative triggers ────────────────────────────────────────────────────────

async function runNegativeTriggers(
  accountId: string,
  scores: KpiScores,
  byType: Map<string, { id: string; severity: string }>,
): Promise<void> {
  await Promise.all(
    RULES.map(async (rule) => {
      const score    = scores[rule.kpiKey];
      const existing = byType.get(rule.signalType);

      // Determine warranted severity
      let warranted: "CRITICAL" | "WARNING" | null = null;
      if (rule.criticalThreshold !== null && score < rule.criticalThreshold) {
        warranted = "CRITICAL";
      } else if (score < rule.warningThreshold) {
        warranted = "WARNING";
      }

      if (warranted === null) {
        // KPI is healthy — resolve any existing signal of this type
        if (existing) {
          await prisma.signal.update({
            where: { id: existing.id },
            data: { isResolved: true, resolvedAt: new Date() },
          });
        }
        return;
      }

      if (!existing) {
        // No open signal yet — create one with pendingReview: true for AI triage
        const created = await prisma.signal.create({
          data: {
            accountId,
            type:          rule.signalType,
            severity:      warranted,
            title:         rule.titleFn(score),
            description:   rule.descFn(score),
            source:        "KAM_SCORE_ENGINE",
            pendingReview: true,
          },
        });
        // Fire signal triage agent non-blocking
        void runSignalTriageAgent(accountId, created.id).catch((err) =>
          console.error("[triggers] signalTriageAgent failed:", err),
        );
      } else if (warranted === "CRITICAL" && existing.severity === "WARNING") {
        // Escalate: WARNING → CRITICAL and refresh title/description
        await prisma.signal.update({
          where: { id: existing.id },
          data: {
            severity:    "CRITICAL",
            title:       rule.titleFn(score),
            description: rule.descFn(score),
          },
        });
      }
      // existing already at same or higher severity — leave it untouched
    }),
  );
}

// ─── Upsell trigger ───────────────────────────────────────────────────────────

async function runUpsellTrigger(
  accountId: string,
  scores: KpiScores,
  byType: Map<string, { id: string; severity: string }>,
): Promise<void> {
  const isOpportunity =
    scores.whitespace >= UPSELL_WHITESPACE_MIN &&
    scores.csat       >= UPSELL_CSAT_MIN;

  const existing = byType.get("UPSELL_OPPORTUNITY");

  if (isOpportunity && !existing) {
    const created = await prisma.signal.create({
      data: {
        accountId,
        type:          "UPSELL_OPPORTUNITY",
        severity:      "INFO",
        title:         `Upsell / expansion opportunity (whitespace ${scores.whitespace}/100)`,
        description:   `Whitespace scored ${scores.whitespace}/100 with CSAT at ${scores.csat}/100 — strong candidate for an upsell or cross-sell conversation. Recommend scheduling an expansion review.`,
        source:        "KAM_SCORE_ENGINE",
        pendingReview: true,
      },
    });
    void runSignalTriageAgent(accountId, created.id).catch((err) =>
      console.error("[triggers] signalTriageAgent (upsell) failed:", err),
    );
  } else if (!isOpportunity && existing) {
    // Conditions no longer met — resolve the opportunity signal
    await prisma.signal.update({
      where: { id: existing.id },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  }
}

// ─── Score drift trigger ───────────────────────────────────────────────────────

const DRIFT_WARNING_DROP  = 8;   // ≥8 pt drop → WARNING
const DRIFT_CRITICAL_DROP = 15;  // ≥15 pt drop → CRITICAL
const DRIFT_SIGNAL_TYPE   = "HEALTH_ALERT" as const;

/**
 * Compares the latest overall score with the previous one.
 * If the score dropped by ≥ DRIFT_WARNING_DROP between the two most recent
 * computations, raises (or escalates) a HEALTH_ALERT signal.
 */
async function runDriftTrigger(
  accountId: string,
  scores: KpiScores,
  byType: Map<string, { id: string; severity: string }>,
): Promise<void> {
  // Fetch last two KAM scores ordered newest first
  const recent = await prisma.kamScore.findMany({
    where: { accountId },
    orderBy: { computedAt: "desc" },
    take: 2,
    select: { overall: true },
  });

  if (recent.length < 2) return; // Need at least two scores to detect drift

  const [latest, previous] = recent;
  const drop = previous.overall - latest.overall;

  const existing = byType.get(DRIFT_SIGNAL_TYPE);

  if (drop >= DRIFT_CRITICAL_DROP) {
    const title = `Score dropped ${drop} pts — critical drift detected`;
    const description = `Overall KAM Score fell from ${previous.overall} to ${latest.overall} (drop: ${drop} pts). Immediate review required to identify root cause and stabilise the account.`;
    if (!existing) {
      const created = await prisma.signal.create({
        data: { accountId, type: DRIFT_SIGNAL_TYPE, severity: "CRITICAL", title, description, source: "KAM_SCORE_ENGINE", pendingReview: true },
      });
      void runSignalTriageAgent(accountId, created.id).catch((err) =>
        console.error("[triggers] signalTriageAgent (drift) failed:", err),
      );
    } else if (existing.severity !== "CRITICAL") {
      await prisma.signal.update({ where: { id: existing.id }, data: { severity: "CRITICAL", title, description } });
    }
  } else if (drop >= DRIFT_WARNING_DROP) {
    const title = `Score declined ${drop} pts — drift warning`;
    const description = `Overall KAM Score fell from ${previous.overall} to ${latest.overall} (drop: ${drop} pts). Monitor closely and investigate underperforming KPI dimensions.`;
    if (!existing) {
      const created = await prisma.signal.create({
        data: { accountId, type: DRIFT_SIGNAL_TYPE, severity: "WARNING", title, description, source: "KAM_SCORE_ENGINE", pendingReview: true },
      });
      void runSignalTriageAgent(accountId, created.id).catch((err) =>
        console.error("[triggers] signalTriageAgent (drift-warning) failed:", err),
      );
    }
    // Do not downgrade a CRITICAL to WARNING
  } else if (drop < DRIFT_WARNING_DROP && existing) {
    // Score recovered or drop is minor — resolve any open drift signal
    await prisma.signal.update({ where: { id: existing.id }, data: { isResolved: true, resolvedAt: new Date() } });
  }
}
