/**
 * LLM provider factory.
 *
 * All app code calls getProvider() — never imports a provider directly.
 * Switch providers via AI_PROVIDER env var: "openai" | "claude" | "gemini"
 * Defaults to "openai".
 *
 * @example
 * const ai = getProvider();
 * const response = await ai.complete({ messages: [...], task: "score-narrative" });
 */

import type { LLMProvider, LLMRequest, LLMResponse } from "./provider.interface";
import { logLLMCall } from "./logger";
import type { AiProvider } from "@/types";
import { ClaudeProvider } from "./providers/claude";
import { GeminiProvider } from "./providers/gemini";
import { OpenAIProvider } from "./providers/openai";

export type { LLMProvider, LLMRequest, LLMResponse } from "./provider.interface";
export type { LLMMessage } from "./provider.interface";

// ─── Factory ──────────────────────────────────────────────────────────────────

let _cached: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  if (_cached) return _cached;

  const providerName = (process.env.AI_PROVIDER ?? "openai") as AiProvider;

  switch (providerName) {
    case "openai": {
      _cached = new OpenAIProvider();
      break;
    }
    case "claude": {
      _cached = new ClaudeProvider();
      break;
    }
    case "gemini":
    default: {
      _cached = new GeminiProvider();
      break;
    }
  }

  console.log(`[ai] Using provider: ${_cached!.provider} (${_cached!.model})`);
  return _cached!;
}

// ─── Instrumented complete() ──────────────────────────────────────────────────

/**
 * Wrapper around provider.complete() that automatically logs every call.
 * Prefer this over calling provider.complete() directly.
 *
 * @example
 * const response = await complete({
 *   messages: [{ role: "user", content: "..." }],
 *   task: "score-narrative",
 *   accountId: "acc-helix-001",
 * });
 */
export async function complete(
  request: LLMRequest & { accountId?: string }
): Promise<LLMResponse> {
  const provider = getProvider();
  const { accountId, ...llmRequest } = request;
  let response: LLMResponse;

  try {
    response = await provider.complete(llmRequest);

    // Fire-and-forget log
    logLLMCall({
      accountId,
      task: request.task ?? "unknown",
      request: llmRequest,
      response,
      success: true,
    });

    return response;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Log the failure too
    logLLMCall({
      accountId,
      task: request.task ?? "unknown",
      request: llmRequest,
      response: {
        content: "",
        model: provider.model,
        provider: provider.provider,
        promptTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
      },
      success: false,
      errorMessage,
    });

    throw err;
  }
}

// ─── Convenience: reset cached provider (useful in tests) ─────────────────────

export function resetProvider(): void {
  _cached = null;
}
