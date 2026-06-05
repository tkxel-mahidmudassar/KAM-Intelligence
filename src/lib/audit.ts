import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// Shared helper — write an ActivityLog row.
// Never throws; audit failures must not break the request that triggered them.
export async function logAudit(params: {
  role:       string;
  accountId?: string;
  action:     string;             // e.g. "score_override.requested"
  entity?:    string;             // e.g. "ScoreOverride"
  entityId?:  string;
  metadata?:  Record<string, unknown>;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        accountId: params.accountId ?? null,
        action:    params.action,
        entity:    params.entity    ?? null,
        entityId:  params.entityId  ?? null,
        metadata:  params.metadata
          ? (params.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        // userId omitted in POC — role stored in metadata instead
      },
    });
  } catch {
    // Intentionally swallowed — audit must not break caller
  }
}
