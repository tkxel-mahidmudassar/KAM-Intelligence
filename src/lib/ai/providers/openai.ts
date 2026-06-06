import OpenAI from "openai";
import type { LLMProvider, LLMRequest, LLMResponse } from "../provider.interface";

const DEFAULT_MODEL = "gpt-5.4-mini";

export class OpenAIProvider implements LLMProvider {
  readonly provider = "openai" as const;
  readonly model = process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;

  private client: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: request.messages,
      max_completion_tokens: request.maxTokens ?? 1024,
      // JSON mode must be deterministic — enforce 0.0 unless caller explicitly overrides.
      temperature: request.temperature ?? (request.jsonMode ? 0.0 : 0.3),
      response_format: request.jsonMode ? { type: "json_object" } : undefined,
    });

    const choice = response.choices[0];

    return {
      content: choice.message.content ?? "",
      model: this.model,
      provider: "openai",
      promptTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
    };
  }
}
