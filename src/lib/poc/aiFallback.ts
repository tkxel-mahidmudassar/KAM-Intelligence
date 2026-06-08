import { ClaudeProvider } from "@/lib/ai/providers/claude";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import type { LLMProvider, LLMRequest, LLMResponse } from "@/lib/ai/provider.interface";
import type { AiProvider } from "@/types";

export interface PocProviderAttempt {
  provider: AiProvider;
  status: "skipped" | "failed" | "success";
  message?: string;
}

export interface PocLLMResponse extends LLMResponse {
  providerTrace: PocProviderAttempt[];
}

const VALID_PROVIDERS: AiProvider[] = ["openai", "gemini", "claude"];

const KEY_ENV: Record<AiProvider, string[]> = {
  openai: ["OPENAI_API_KEY"],
  gemini: ["GOOGLE_AI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
  claude: ["ANTHROPIC_API_KEY"],
};

function normalizeProvider(value: string | undefined): AiProvider | null {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase();
  return VALID_PROVIDERS.includes(cleaned as AiProvider) ? cleaned as AiProvider : null;
}

function providerOrder(): AiProvider[] {
  const explicit = (process.env.POC_AI_PROVIDER_ORDER || "")
    .split(",")
    .map((item) => normalizeProvider(item))
    .filter(Boolean) as AiProvider[];

  const configuredPrimary = normalizeProvider(process.env.AI_PROVIDER);
  const ordered = [
    ...explicit,
    ...(configuredPrimary ? [configuredPrimary] : []),
    "openai",
    "gemini",
    "claude",
  ] as AiProvider[];

  return Array.from(new Set(ordered));
}

function hasKey(provider: AiProvider): boolean {
  return KEY_ENV[provider].some((key) => Boolean(process.env[key]?.trim()));
}

function keyLabel(provider: AiProvider): string {
  return KEY_ENV[provider].join(" or ");
}

function compactMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 320);
}

function createProvider(provider: AiProvider): LLMProvider {
  if (provider === "openai") return new OpenAIProvider();
  if (provider === "gemini") return new GeminiProvider();
  return new ClaudeProvider();
}

export async function completePocWithFallback(request: LLMRequest): Promise<PocLLMResponse> {
  const trace: PocProviderAttempt[] = [];

  for (const providerName of providerOrder()) {
    if (!hasKey(providerName)) {
      trace.push({
        provider: providerName,
        status: "skipped",
        message: `${keyLabel(providerName)} is not set`,
      });
      continue;
    }

    try {
      const provider = createProvider(providerName);
      const response = await provider.complete(request);
      trace.push({ provider: providerName, status: "success", message: response.model });
      return { ...response, providerTrace: trace };
    } catch (error) {
      trace.push({
        provider: providerName,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = trace.map((item) => {
    const status = `${item.provider}:${item.status}`;
    return item.message ? `${status} - ${compactMessage(item.message)}` : status;
  }).join("; ");
  throw new Error(`No POC AI provider succeeded (${summary || "no providers configured"})`);
}
