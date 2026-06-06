import { complete } from "@/lib/ai";

export interface V2CammieAccountContext {
  id: string;
  name: string;
  industry: string;
  region: string;
  country: string;
  arr: string;
  healthScore: number;
  health: string;
  renewalDays: number;
  kamOwner: string;
  associateOwner: string;
  contactName: string;
}

export interface V2CammieInput {
  role: string;
  message: string;
  activeAccount?: V2CammieAccountContext | null;
  accounts: V2CammieAccountContext[];
  conversation: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface V2CammieOutput {
  reply: string;
  intent: "portfolio_question" | "account_question" | "document_request" | "workflow_help" | "web_research" | "unknown";
  degraded?: boolean;
  error?: string;
  usedWeb?: boolean;
  documentRequest?: {
    type: string;
    targetAccount?: string;
    missingInputs: string[];
    nextAction: string;
    canGenerate: boolean;
  };
}

function parseJson(content: string): V2CammieOutput {
  const raw = content.replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

function normalizeOutput(output: Partial<V2CammieOutput>): V2CammieOutput {
  const allowedIntents = new Set(["portfolio_question", "account_question", "document_request", "workflow_help", "web_research", "unknown"]);
  const intent = allowedIntents.has(String(output.intent)) ? output.intent : "unknown";
  const documentRequest = intent === "document_request" && output.documentRequest
    ? {
        type: String(output.documentRequest.type || "Business document").slice(0, 80),
        targetAccount: output.documentRequest.targetAccount ? String(output.documentRequest.targetAccount).slice(0, 90) : undefined,
        missingInputs: Array.isArray(output.documentRequest.missingInputs)
          ? output.documentRequest.missingInputs.map(String).slice(0, 5)
          : [],
        nextAction: String(output.documentRequest.nextAction || "Generate a grounded draft using the V2 document-generation agent.").slice(0, 220),
        canGenerate: Boolean(output.documentRequest.canGenerate),
      }
    : undefined;

  return {
    reply: String(output.reply || "I can help with portfolio questions, account context, and document-generation requests.").slice(0, 900),
    intent: intent as V2CammieOutput["intent"],
    degraded: Boolean(output.degraded),
    error: output.error ? String(output.error).slice(0, 180) : undefined,
    usedWeb: Boolean(output.usedWeb),
    documentRequest,
  };
}

function moneyLabel(value: string) {
  return value || "ARR not available";
}

function findNamedAccount(input: V2CammieInput) {
  const message = input.message.toLowerCase();
  return input.accounts.find((account) => message.includes(account.name.toLowerCase())) ?? input.activeAccount ?? null;
}

function localFallback(input: V2CammieInput, error: unknown): V2CammieOutput {
  const message = input.message.toLowerCase();
  const namedAccount = findNamedAccount(input);
  const criticalAccounts = input.accounts.filter((account) => account.health.toLowerCase().includes("critical") || account.healthScore < 50);
  const atRiskAccounts = input.accounts.filter((account) => account.health.toLowerCase().includes("at risk") || (account.healthScore >= 50 && account.healthScore < 75));
  const healthyAccounts = input.accounts.filter((account) => account.health.toLowerCase().includes("healthy") || account.healthScore >= 75);
  const sortedRisk = [...input.accounts].sort((a, b) => a.healthScore - b.healthScore).slice(0, 5);
  const asksForDocument = /\b(document|deck|qbr|ppt|presentation|memo|brief|email|kyc|report|plan)\b/i.test(input.message);

  let reply = "I can use the visible portfolio data, but the live AI provider is not responding right now.";
  let intent: V2CammieOutput["intent"] = "unknown";

  if (asksForDocument) {
    intent = "document_request";
    reply = namedAccount
      ? `I can prepare a first draft for ${namedAccount.name} once the live document agent is reachable. Available context: ${moneyLabel(namedAccount.arr)} ARR, ${namedAccount.healthScore}/100 score, ${namedAccount.health} health, renewal in ${namedAccount.renewalDays} days.`
      : "I can prepare the requested document once the live document agent is reachable. If it is account-specific, name the account so I can ground the draft.";
  } else if (namedAccount) {
    intent = "account_question";
    reply = `${namedAccount.name}: ${namedAccount.healthScore}/100 score, ${namedAccount.health} health, ${moneyLabel(namedAccount.arr)} ARR, renewal in ${namedAccount.renewalDays} days. KAM: ${namedAccount.kamOwner}. Associate: ${namedAccount.associateOwner}.`;
  } else if (message.includes("risk") || message.includes("critical") || message.includes("worst") || message.includes("lowest")) {
    intent = "portfolio_question";
    reply =
      sortedRisk.length > 0
        ? `Lowest-score accounts right now: ${sortedRisk.map((account) => `${account.name} (${account.healthScore}/100, ${account.health})`).join(", ")}.`
        : "I do not have any visible account risk data in this view.";
  } else if (message.includes("portfolio") || message.includes("summary") || message.includes("accounts") || message.includes("health")) {
    intent = "portfolio_question";
    reply = `Visible portfolio: ${input.accounts.length} accounts, ${healthyAccounts.length} healthy, ${atRiskAccounts.length} at risk, ${criticalAccounts.length} critical.`;
  }

  return {
    reply,
    intent,
    degraded: true,
    error: error instanceof Error ? error.message : String(error),
    documentRequest: asksForDocument
      ? {
          type: "Requested document",
          targetAccount: namedAccount?.name,
          missingInputs: namedAccount ? [] : ["Target account"],
          nextAction: "Retry the V2 document-generation route after the AI provider is reachable.",
          canGenerate: Boolean(namedAccount),
        }
      : undefined,
  };
}

export async function runV2Cammie(input: V2CammieInput): Promise<V2CammieOutput> {
  try {
    const response = await complete({
      task: "v2-cammie-assistant",
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "You are Cammie, the V2 Tkxel KAM portfolio assistant. Answer using only the supplied portfolio/account context. If the user asks to generate a document, do not pretend the document has already been created. Classify the request, identify missing inputs, and explain the specialist agent/route that should be called next. Return valid JSON only.",
        },
        {
          role: "user",
          content: `Role:
${input.role}

Active account:
${JSON.stringify(input.activeAccount ?? null, null, 2)}

Visible portfolio accounts:
${JSON.stringify(input.accounts.slice(0, 30), null, 2)}

Recent conversation:
${JSON.stringify(input.conversation.slice(-8), null, 2)}

User message:
${input.message}

Return JSON:
{
  "reply": "short, useful answer grounded in the supplied context",
  "intent": "portfolio_question | account_question | document_request | workflow_help | unknown",
  "documentRequest": {
    "type": "the exact requested document type, for example QBR deck, renewal plan, risk memo, meeting brief, email draft, KYC draft, account brief, escalation note, action plan",
    "targetAccount": "account name if clear",
    "missingInputs": ["only inputs required before generation"],
    "nextAction": "what Cammie should generate or which specialist V2 agent/route should be called next",
    "canGenerate": true
  }
}

Rules:
- Do not use old KYC/playbook-agent behavior.
- Do not invent account facts that are absent from context.
- If asked for a ranking or risk list, use health score, health status, renewal timing, ARR, and visible account metadata.
- If the question is about one account and no active account is supplied, infer by name only if the message clearly names one.
- If the user asks to search the web, research current external context, look up recent news, or verify an external fact, classify as web_research. Do not say you cannot browse; the route can call the V2 web research helper.
- For document requests, Cammie can generate any reasonable KAM/account-management document type by calling the V2 document-generation agent.
- Set canGenerate to true when the supplied context is enough to create a useful first draft, even if some sections must be marked To be confirmed.
- Only list missingInputs when the user request is impossible to satisfy without that input, such as asking for a named account that is not in context.`,
        },
      ],
    });

    return normalizeOutput(parseJson(response.content));
  } catch (error) {
    return localFallback(input, error);
  }
}
