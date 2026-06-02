// ─── Roles ───────────────────────────────────────────────────────────────────
export type Role = "KAM" | "MANAGER" | "EXECUTIVE" | "ADMIN";

// ─── RAG Status ──────────────────────────────────────────────────────────────
export type RagStatus = "HEALTHY" | "AT_RISK" | "CRITICAL";

// ─── Account Mode ────────────────────────────────────────────────────────────
export type AccountMode = "PROTECT" | "GROW" | "RECOVER" | "WATCH";

// ─── Score State ─────────────────────────────────────────────────────────────
export type ScoreState = "AI_PROPOSED" | "HUMAN_ACCEPTED" | "HUMAN_OVERRIDDEN";

// ─── Action Status ───────────────────────────────────────────────────────────
export type ActionStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "ESCALATED" | "DISMISSED";

// ─── Action Priority ─────────────────────────────────────────────────────────
export type ActionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// ─── KYC Version State ───────────────────────────────────────────────────────
export type KycVersionState = "DRAFT" | "IN_REVIEW" | "APPROVED" | "RETURNED";

// ─── Document Status ─────────────────────────────────────────────────────────
export type DocumentStatus = "PROCESSING" | "EXTRACTED" | "COMMITTED" | "FAILED";

// ─── AI Provider ─────────────────────────────────────────────────────────────
export type AiProvider = "openai" | "claude" | "gemini";

// ─── Adapter Mode ────────────────────────────────────────────────────────────
export type AdapterMode = "mock" | "live";

// ─── AI Output (every LLM response must conform to this) ─────────────────────
export interface AiOutput {
  content: string;
  sources: SourceReference[];
  confidence: number;
  missingData: string[];
  model: string;
  provider: AiProvider;
  latencyMs: number;
}

// ─── Source Reference ────────────────────────────────────────────────────────
export interface SourceReference {
  sourceType: string;
  url: string | null;
  sourceDate: string;
  confidence: number;
  excerpt?: string;
}

// ─── Audit Event ─────────────────────────────────────────────────────────────
export interface AuditEventData {
  id: string;
  eventType: string;
  actorId: string;
  actorRole: Role;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
