import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider, LLMRequest, LLMResponse } from "../provider.interface";

const MODEL = "gemini-2.0-flash";

function getGeminiApiKey(): string | undefined {
  return process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

export class GeminiProvider implements LLMProvider {
  readonly provider = "gemini" as const;
  readonly model = MODEL;

  private client: GoogleGenerativeAI;

  constructor() {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY is not set");
    }
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();

    // Extract system instruction and conversation history
    const systemMsg = request.messages.find((m) => m.role === "system");
    const conversationMsgs = request.messages.filter((m) => m.role !== "system");

    const genModel = this.client.getGenerativeModel({
      model: MODEL,
      ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 1024,
        // JSON mode must be deterministic — enforce 0.0 unless caller explicitly overrides.
        // Prose calls (no jsonMode) default to 0.3 if no temperature is specified.
        temperature: request.temperature ?? (request.jsonMode ? 0.0 : 0.3),
        ...(request.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    });

    // Build Gemini chat history (all but last message)
    const history = conversationMsgs.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMsg = conversationMsgs.at(-1);
    if (!lastMsg) throw new Error("No user message provided");

    const chat = genModel.startChat({ history });
    const result = await chat.sendMessage(lastMsg.content);
    const text = result.response.text();

    // Gemini doesn't return token counts in the same call — estimate from chars
    const estimatedPromptTokens = Math.ceil(
      request.messages.reduce((sum, m) => sum + m.content.length, 0) / 4
    );
    const estimatedOutputTokens = Math.ceil(text.length / 4);

    return {
      content: text,
      model: MODEL,
      provider: "gemini",
      promptTokens: estimatedPromptTokens,
      outputTokens: estimatedOutputTokens,
      latencyMs: Date.now() - start,
    };
  }
}
