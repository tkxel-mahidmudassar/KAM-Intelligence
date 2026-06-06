import OpenAI from "openai";
import type { V2CammieInput, V2CammieOutput } from "./cammieAgent";

const DEFAULT_MODEL = "gpt-5.4-mini";

function activeAccountLabel(input: V2CammieInput) {
  if (!input.activeAccount) return "No active account selected.";
  return `${input.activeAccount.name} (${input.activeAccount.industry}, ${input.activeAccount.country}, ${input.activeAccount.arr} ARR, score ${input.activeAccount.healthScore}/100, ${input.activeAccount.health})`;
}

function portfolioLabel(input: V2CammieInput) {
  return input.accounts
    .slice(0, 30)
    .map((account) => `${account.name}: ${account.industry}, ${account.country}, ${account.arr}, score ${account.healthScore}/100, ${account.health}, renewal in ${account.renewalDays} days`)
    .join("\n");
}

export function shouldUseCammieWebResearch(message: string) {
  return /\b(web|internet|search|google|look\s*up|lookup|research|recent|latest|current|news|verify|source|sources|market|competitor|competitors)\b/i.test(message);
}

export async function runV2CammieWebResearch(input: V2CammieInput): Promise<V2CammieOutput> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      reply: "I can do web-backed research, but the OpenAI API key is not configured on the server.",
      intent: "web_research",
      degraded: true,
      usedWeb: false,
      error: "OPENAI_API_KEY is not set",
    };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;

  try {
    const response = await client.responses.create({
      model,
      tools: [{ type: "web_search_preview" }],
      instructions:
        "You are Cammie, Tkxel's KAM portfolio assistant. Use web search when external facts are needed. Combine web findings with the supplied portfolio/account context. Be concise, useful, and explicit about which facts came from web research. Include source names and URLs when available. Do not invent sources. If sources disagree or are thin, say that.",
      input: `User role:
${input.role}

Active account context:
${activeAccountLabel(input)}

Visible portfolio context:
${portfolioLabel(input)}

Recent conversation:
${JSON.stringify(input.conversation.slice(-8), null, 2)}

User request:
${input.message}

Return a direct answer. If this is account-specific, tie the web finding back to the account's current portfolio context and likely KAM implication.`,
    });

    return {
      reply: response.output_text || "I searched the web but could not produce a useful answer from the available results.",
      intent: "web_research",
      usedWeb: true,
      degraded: false,
    };
  } catch (error) {
    return {
      reply: "I could not complete the web search from the OpenAI web-research route. I can still answer from the visible portfolio context, or you can retry the search.",
      intent: "web_research",
      usedWeb: false,
      degraded: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
