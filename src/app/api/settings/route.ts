import { NextRequest } from "next/server";
import { ok, serverError, forbidden, badRequest, getUserIdFromRequest } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WEIGHTS, WEIGHT_KEYS } from "@/lib/scoring/weights";
import { logAudit } from "@/lib/audit";
import type { Role } from "@/types";

// Default notification preferences
const DEFAULT_NOTIFICATION_PREFS = {
  frequency: "immediate" as const,
  channels: { email: true, inApp: true },
  events: {
    scoreDropped:     { enabled: true,  threshold: 5  },
    criticalSignal:   { enabled: true  },
    warningSignal:    { enabled: false },
    actionOverdue:    { enabled: true  },
    renewalUpcoming:  { enabled: true,  daysBefore: 60 },
    qbrReminder:      { enabled: true,  daysBefore: 14 },
  },
};

const DEFAULT_INTEGRATION_SETTINGS = {
  Salesforce: "connected",
  Gmail: "connected",
  Jira: "connected",
  Worksphere: "connected",
  "Finance Invoice Tracking": "connected",
  LLM: "connected",
  "AI Note Taker": "connected",
};

async function getSettingsRole(req: NextRequest): Promise<Role | null> {
  const userId = getUserIdFromRequest(req);
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return (user?.role ?? null) as Role | null;
}

function canAccessSettings(role: Role | null): role is "KAM" | "EXECUTIVE" {
  return role === "KAM" || role === "EXECUTIVE";
}

// GET /api/settings — returns configurable app settings + score weights + notification prefs
export async function GET(req: NextRequest) {
  try {
    const role = await getSettingsRole(req);
    if (!canAccessSettings(role)) return forbidden("Settings are available to KAM and Executive users only");

    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    // Load persisted config (fall back to defaults)
    const scoreWeights: Record<string, number> = { ...DEFAULT_WEIGHTS };
    let notificationPrefs = DEFAULT_NOTIFICATION_PREFS;
    let integrationSettings = DEFAULT_INTEGRATION_SETTINGS;
    try {
      const cfg = await prisma.appConfig.findUnique({ where: { id: "global" } });
      if (cfg?.scoreWeights && typeof cfg.scoreWeights === "object") {
        const stored = cfg.scoreWeights as Record<string, number>;
        for (const key of WEIGHT_KEYS) {
          if (typeof stored[key] === "number") scoreWeights[key] = stored[key];
        }
      }
      if (cfg?.notificationPrefs && typeof cfg.notificationPrefs === "object") {
        notificationPrefs = {
          ...DEFAULT_NOTIFICATION_PREFS,
          ...(cfg.notificationPrefs as typeof DEFAULT_NOTIFICATION_PREFS),
        };
      }
      integrationSettings = { ...DEFAULT_INTEGRATION_SETTINGS };
    } catch {
      // table may not exist in older envs — defaults are fine
    }

    return ok({
      aiProvider:  process.env.AI_PROVIDER  ?? "openai",
      adapterMode: process.env.ADAPTER_MODE ?? "mock",
      appUrl:      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      nodeEnv:     process.env.NODE_ENV ?? "development",
      dbConnected,
      features: {
        ragEnabled:       true,
        pulseEnabled:     true,
        assistantEnabled: true,
      },
      scoreWeights,
      notificationPrefs,
      integrationSettings,
    });
  } catch (err) {
    return serverError(err);
  }
}

// PUT /api/settings — update score weights or notification prefs (MANAGER + EXECUTIVE only)
export async function PUT(req: NextRequest) {
  try {
    const role = await getSettingsRole(req);
    if (!canAccessSettings(role)) return forbidden("Settings are available to KAM and Executive users only");

    const body = await req.json();

    // Handle notification prefs update
    if (body.notificationPrefs) {
      const prefs = body.notificationPrefs;
      const cfg = await prisma.appConfig.upsert({
        where:  { id: "global" },
        create: { id: "global", notificationPrefs: prefs, updatedBy: role },
        update: { notificationPrefs: prefs, updatedBy: role },
      });
      await logAudit({ role, action: "settings.notification_prefs_updated", entity: "AppConfig", entityId: "global", metadata: { role } });
      return ok({ notificationPrefs: cfg.notificationPrefs });
    }

    if (body.integrationSettings) {
      const settings = { ...DEFAULT_INTEGRATION_SETTINGS };
      const cfg = await prisma.appConfig.upsert({
        where:  { id: "global" },
        create: { id: "global", integrationSettings: settings, updatedBy: role },
        update: { integrationSettings: settings, updatedBy: role },
      });
      await logAudit({ role, action: "settings.integrations_updated", entity: "AppConfig", entityId: "global", metadata: { role } });
      return ok({ integrationSettings: cfg.integrationSettings });
    }

    // Handle score weights update
    const weights = body.scoreWeights as Record<string, number> | undefined;
    if (!weights || typeof weights !== "object") return badRequest("scoreWeights, notificationPrefs, or integrationSettings required");

    // Validate: all 8 keys present, all non-negative integers, sum = 100
    for (const key of WEIGHT_KEYS) {
      const v = weights[key];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0)
        return badRequest(`Weight for "${key}" must be a non-negative integer`);
    }
    const total = WEIGHT_KEYS.reduce((s, k) => s + weights[k], 0);
    if (total !== 100) return badRequest(`Weights must sum to 100 (got ${total})`);

    // Upsert single global config row
    const cfg = await prisma.appConfig.upsert({
      where:  { id: "global" },
      create: { id: "global", scoreWeights: weights, updatedBy: role },
      update: { scoreWeights: weights, updatedBy: role },
    });

    await logAudit({ role, action: "settings.score_weights_updated", entity: "AppConfig", entityId: "global", metadata: { role, weights } });

    return ok({ scoreWeights: cfg.scoreWeights });
  } catch (err) {
    return serverError(err);
  }
}
