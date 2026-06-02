import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "../provider.interface";

const MODEL = "claude-3-5-sonnet-20241022";

export class ClaudeProvider implements LLMProvider {
  readonly provider = "claude" as const;
  readonly model = MODEL;

  private client: Anthropic;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();

    // Split system message from conversation messages
    const systemMsg = request.messages.find((m) => m.role === "system");
    const conversationMsgs = request.messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.3,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      messages: conversationMsgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const textBlock = response.content.find((b) => b.type === "text");

    return {
      content: textBlock?.type === "text" ? textBlock.text : "",
      model: MODEL,
      provider: "claude",
      promptTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs: Date.now() - start,
    };
  }
}
