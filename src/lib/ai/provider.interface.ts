import type { AiProvider, AiOutput } from "@/types";

// ─── Request ──────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  /** Max tokens to generate */
  maxTokens?: number;
  /** 0–1. Lower = more deterministic */
  temperature?: number;
  /** Label for logging (e.g. "score-narrative", "pulse-insight") */
  task?: string;
  /** When true, instructs the provider to return valid JSON only (Gemini JSON mode) */
  jsonMode?: boolean;
}

// ─── Response ─────────────────────────────────────────────────────────────────

export interface LLMResponse {
  content: string;
  model: string;
  provider: AiProvider;
  promptTokens: number;
  outputTokens: number;
  latencyMs: number;
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface LLMProvider {
  readonly provider: AiProvider;
  readonly model: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}
