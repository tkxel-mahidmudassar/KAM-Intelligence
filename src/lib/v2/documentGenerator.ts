import { randomUUID } from "crypto";
import { complete } from "@/lib/ai";
import type { V2CammieAccountContext } from "@/lib/v2/cammieAgent";

export interface V2DocumentGenerationInput {
  documentType: string;
  userRequest: string;
  role: string;
  activeAccount?: V2CammieAccountContext | null;
  accounts: V2CammieAccountContext[];
  conversation: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface V2GeneratedDocument {
  title: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  format: "Markdown";
  summary: string;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "document";
}

function parseJson(content: string): { title?: string; summary?: string; markdown?: string } {
  const raw = content.replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

function markdownDataUrl(markdown: string) {
  return `data:text/markdown;charset=utf-8;base64,${Buffer.from(markdown, "utf-8").toString("base64")}`;
}

export async function generateV2Document(input: V2DocumentGenerationInput): Promise<V2GeneratedDocument> {
  const response = await complete({
    task: "v2-cammie-document-generator",
    jsonMode: true,
    temperature: 0.18,
    maxTokens: 3200,
    messages: [
      {
        role: "system",
        content:
          "You are a V2 Tkxel KAM document generation agent. Generate the exact business document the user requests using only supplied account and portfolio context. Return valid JSON only. Do not invent facts; mark unknowns as To be confirmed.",
      },
      {
        role: "user",
        content: `Generate this document.

Requested document type:
${input.documentType}

User request:
${input.userRequest}

Role:
${input.role}

Active account:
${JSON.stringify(input.activeAccount ?? null, null, 2)}

Visible portfolio accounts:
${JSON.stringify(input.accounts.slice(0, 30), null, 2)}

Recent conversation:
${JSON.stringify(input.conversation.slice(-8), null, 2)}

Return JSON:
{
  "title": "document title",
  "summary": "one sentence describing what was generated",
  "markdown": "complete Markdown document"
}

Rules:
- Support any reasonable KAM/account-management document type, including QBR, KYC, account brief, executive update, renewal plan, risk memo, meeting brief, escalation note, action plan, stakeholder map, onboarding brief, and follow-up email.
- If the requested document needs data that is not present, include a clear "To be confirmed" section instead of fabricating.
- If the user asks for an email, write it as a send-ready email draft with subject, recipients if known, and body.
- If the user asks for slides but no PPT-specific route is being invoked, create a slide-by-slide Markdown outline with speaker notes.
- Use concise headings and practical account-management language.
- Keep the output grounded in supplied account and portfolio context.`,
      },
    ],
  });

  const parsed = parseJson(response.content);
  const title = String(parsed.title || `${input.documentType} draft`).slice(0, 100);
  const markdown = String(parsed.markdown || `# ${title}\n\nTo be confirmed.`);
  const summary = String(parsed.summary || `Generated ${input.documentType}.`).slice(0, 180);
  const fileName = `${slugify(title)}-${randomUUID().slice(0, 8)}.md`;

  return {
    title,
    documentType: input.documentType,
    fileName,
    fileUrl: markdownDataUrl(markdown),
    format: "Markdown",
    summary,
  };
}
