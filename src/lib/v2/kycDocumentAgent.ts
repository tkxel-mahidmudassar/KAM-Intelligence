import { randomUUID } from "crypto";
import { complete } from "@/lib/ai";
import { v2AgentBehaviorPrompt } from "@/lib/v2/agentBehavior";

export interface V2KycDocumentInput {
  role: string;
  draft: Record<string, string>;
  kycSections: Array<{
    title: string;
    source: string;
    status: string;
    draft: string;
  }>;
  sourceFiles: string[];
  documents: Array<{
    fileName: string;
    type: string;
    preview?: string;
    extractedText?: string;
  }>;
  journey: Array<{
    type: string;
    title: string;
    dueDate: string;
    recurrence: string;
  }>;
}

export interface V2GeneratedKycDocument {
  title: string;
  fileName: string;
  fileUrl: string;
  summary: string;
  approvalStatus: "Draft" | "Submitted to KAM" | "Approved";
}

function parseJson(content: string): { title?: string; summary?: string; markdown?: string } {
  const raw = content.replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "kyc";
}

function markdownDataUrl(markdown: string) {
  return `data:text/markdown;charset=utf-8;base64,${Buffer.from(markdown, "utf-8").toString("base64")}`;
}

export async function generateV2KycDocument(input: V2KycDocumentInput): Promise<V2GeneratedKycDocument> {
  const response = await complete({
    task: "v2-kyc-document-generator",
    jsonMode: true,
    temperature: 0.12,
    maxTokens: 3600,
    messages: [
      {
        role: "system",
        content:
          "You are the V2 Tkxel KYC document generation agent. Generate a final KYC draft from accepted/drafted KYC sections, account profile fields, uploaded evidence, and journey context. Use only supplied context. Return valid JSON only.",
      },
      {
        role: "user",
        content: `Create the final KYC document.

Role:
${input.role}

Account draft:
${JSON.stringify(input.draft, null, 2)}

Source files:
${JSON.stringify(input.sourceFiles, null, 2)}

Uploaded documents:
${JSON.stringify(input.documents, null, 2)}

KYC sections:
${JSON.stringify(input.kycSections, null, 2)}

Account journey:
${JSON.stringify(input.journey, null, 2)}

Return JSON:
{
  "title": "KYC title",
  "summary": "one sentence summary",
  "markdown": "complete Markdown KYC document"
}

Rules:
${v2AgentBehaviorPrompt}

KYC-specific rules:
- Preserve source attribution beside every material claim using inline source labels.
- Include these sections when possible: executive summary, industry overview, company history, account history with Tkxel, stakeholders, financials, engagement history, Tkxel team, competitors, risks, opportunities, and next actions.
- If a material fact is missing, omit that claim or ask for the missing input before final generation. Do not write unknown, TBD, or placeholder language unless the user explicitly accepts it.
- Make the document review-ready for Associate/KAM approval.`,
      },
    ],
  });

  const parsed = parseJson(response.content);
  const title = String(parsed.title || `${input.draft.name || "Account"} KYC draft`).slice(0, 100);
  const markdown = String(parsed.markdown || `# ${title}\n\nNo supported KYC content was returned.`);
  const summary = String(parsed.summary || "Generated KYC draft.").slice(0, 180);
  const fileName = `${slugify(title)}-${randomUUID().slice(0, 8)}.md`;

  return {
    title,
    fileName,
    fileUrl: markdownDataUrl(markdown),
    summary,
    approvalStatus: input.role === "KAM" ? "Approved" : "Draft",
  };
}
