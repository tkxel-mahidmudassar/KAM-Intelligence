/**
 * Persists every LLM call to the AIPulseInsight table for audit + cost tracking.
 * Non-blocking — failures are logged to console, never thrown.
 */

import { prisma } from "@/lib/prisma";
import type { LLMRequest, LLMResponse } from "./provider.interface";
import { InsightType } from "@prisma/client";

export interface LogEntry {
  accountId?: string;
  task: string;          // e.g. "score-narrative", "pulse-insight", "kyc-draft"
  request: LLMRequest;
  response: LLMResponse;
  success: boolean;
  errorMessage?: string;
}

export async function logLLMCall(entry: LogEntry): Promise<void> {
  try {
    await prisma.aIPulseInsight.create({
      data: {
        accountId:    entry.accountId ?? null,
        type:         InsightType.RECOMMENDATION, // generic type for log entries
        title:        `[LOG] ${entry.task}`,
        summary:      entry.success
                        ? entry.response.content.slice(0, 500)
                        : entry.errorMessage ?? "Unknown error",
        detail:       JSON.stringify({
                        task:     entry.task,
                        model:    entry.response.model,
                        provider: entry.response.provider,
                        latencyMs: entry.response.latencyMs,
                        promptTokens: entry.response.promptTokens,
                        outputTokens: entry.response.outputTokens,
                        success:  entry.success,
                      }),
        confidence:   entry.success ? 1 : 0,
        model:        entry.response.model,
        promptTokens: entry.response.promptTokens,
        outputTokens: entry.response.outputTokens,
        isDismissed:  true, // log entries are pre-dismissed so they don't surface in the UI
      },
    });
  } catch (err) {
    // Never let logging failures break the main flow
    console.error("[ai-logger] Failed to persist LLM call:", err);
  }
}
