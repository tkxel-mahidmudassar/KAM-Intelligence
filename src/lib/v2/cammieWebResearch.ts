import OpenAI from "openai";
import type { V2CammieInput, V2CammieOutput } from "./cammieAgent";
import { v2AgentBehaviorPrompt } from "@/lib/v2/agentBehavior";

const DEFAULT_MODEL = "gpt-5.4-mini";

function scoreOutOfFiveLabel(score: number) {
  const value = Math.max(0, Math.min(5, score <= 5 ? score : score / 20));
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function activeAccountLabel(input: V2CammieInput) {
  if (!input.activeAccount) return "No active account selected.";
  return `${input.activeAccount.name} (${input.activeAccount.industry}, ${input.activeAccount.country}, ${input.activeAccount.arr} ARR, score ${scoreOutOfFiveLabel(input.activeAccount.healthScore)}/5, ${input.activeAccount.health})`;
}

function portfolioLabel(input: V2CammieInput) {
  return input.accounts
    .slice(0, 30)
    .map((account) => `${account.name}: ${account.industry}, ${account.country}, ${account.arr}, score ${scoreOutOfFiveLabel(account.healthScore)}/5, ${account.health}, renewal in ${account.renewalDays} days`)
    .join("\n");
}

function attachmentLabel(input: V2CammieInput) {
  const attachments = input.attachments ?? [];
  if (attachments.length === 0) return "No documents attached to this message.";
  return attachments
    .slice(0, 5)
    .map((attachment) => {
      const content = attachment.extractedText || attachment.preview || "";
      return `File: ${attachment.fileName}
Type: ${attachment.type}
Content preview:
${content.slice(0, 3000)}${attachment.parseError ? `\nParse note: ${attachment.parseError}` : ""}`;
    })
    .join("\n\n---\n\n");
}

function formatWebReply(raw: string) {
  const text = raw.trim();
  if (!text) return "I searched the web but could not produce a useful answer from the available results.";
  if (/^#{1,3}\s/m.test(text) || /\n[-*]\s/.test(text) || /\n\d+\.\s/.test(text)) return text;
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const answer = sentences.slice(0, 2).join(" ");
  const details = sentences.slice(2, 6);
  const rest = sentences.slice(6).join(" ");
  return [
    "### Answer",
    answer || text,
    details.length > 0 ? "\n### What matters" : "",
    ...details.map((sentence) => `- ${sentence}`),
    rest ? "\n### Notes" : "",
    rest,
  ].filter(Boolean).join("\n");
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
      instructions: `You are T Man, Tkxel's Kamazing portfolio assistant. Use web search only when external facts are needed and requested or approved. Combine web findings with the supplied portfolio/account context and any attached document context. Be concise, useful, and explicit about which facts came from web research versus supplied account/document context. Do not invent sources. If sources disagree or are thin, say that. Format every response in clean Markdown with these sections when applicable: ### Answer, ### Account implication, ### Sources. Put source names and URLs as bullets under Sources.

V2 agent behavior rules:
${v2AgentBehaviorPrompt}`,
      input: `User role:
${input.role}

Active account context:
${activeAccountLabel(input)}

Visible portfolio context:
${portfolioLabel(input)}

Attached documents for this message:
${attachmentLabel(input)}

Recent conversation:
${JSON.stringify(input.conversation.slice(-8), null, 2)}

User request:
${input.message}

Return a direct answer. If this is account-specific, tie the web finding back to the account's current portfolio context and likely KAM implication.`,
    });

    return {
      reply: formatWebReply(response.output_text || ""),
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
