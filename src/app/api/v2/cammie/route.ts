import { NextRequest, NextResponse } from "next/server";
import { runV2Cammie, type V2CammieInput } from "@/lib/v2/cammieAgent";
import { runV2CammieWebResearch, shouldUseCammieWebResearch } from "@/lib/v2/cammieWebResearch";
import { generateV2Document } from "@/lib/v2/documentGenerator";

export const runtime = "nodejs";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeAccount(account: unknown) {
  if (!isObject(account)) return null;
  return {
    id: String(account.id || ""),
    name: String(account.name || ""),
    industry: String(account.industry || ""),
    region: String(account.region || ""),
    country: String(account.country || ""),
    arr: String(account.arr || ""),
    healthScore: Number(account.healthScore || 0),
    health: String(account.health || ""),
    renewalDays: Number(account.renewalDays || 0),
    kamOwner: String(account.kamOwner || ""),
    associateOwner: String(account.associateOwner || ""),
    contactName: String(account.contactName || ""),
  };
}

function normalizeAttachment(attachment: unknown) {
  if (!isObject(attachment)) return null;
  return {
    fileName: String(attachment.fileName || "Attached document"),
    type: String(attachment.type || "Document"),
    preview: attachment.preview ? String(attachment.preview).slice(0, 2400) : undefined,
    extractedText: attachment.extractedText ? String(attachment.extractedText).slice(0, 6000) : undefined,
    parseError: attachment.parseError ? String(attachment.parseError).slice(0, 240) : undefined,
  };
}

function normalizeTemplate(template: unknown) {
  if (!isObject(template)) return null;
  return {
    name: String(template.name || "Template"),
    tag: String(template.tag || "Document"),
    format: String(template.format || "file"),
  };
}

function normalizeDocumentGenerationRequest(value: unknown) {
  if (!isObject(value)) return null;
  const documentType = String(value.documentType || "").trim();
  const outputFormat = String(value.outputFormat || "").trim();
  if (!documentType) return null;
  return {
    documentType,
    outputFormat,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isObject(body)) {
      return NextResponse.json({ error: "Invalid T-Man payload" }, { status: 400 });
    }

    const activeAccount = normalizeAccount(body.activeAccount);
    const input: V2CammieInput = {
      role: String(body.role || "ASSOCIATE"),
      message: String(body.message || ""),
      activeAccount,
      accounts: Array.isArray(body.accounts)
        ? body.accounts.map(normalizeAccount).filter((account): account is NonNullable<ReturnType<typeof normalizeAccount>> => Boolean(account))
        : [],
      attachments: Array.isArray(body.attachments)
        ? body.attachments.map(normalizeAttachment).filter((attachment): attachment is NonNullable<ReturnType<typeof normalizeAttachment>> => Boolean(attachment))
        : [],
      templates: Array.isArray(body.templates)
        ? body.templates.map(normalizeTemplate).filter((template): template is NonNullable<ReturnType<typeof normalizeTemplate>> => Boolean(template))
        : [],
      conversation: Array.isArray(body.conversation)
        ? body.conversation
            .map((entry) => ({
              role: (entry?.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
              content: String(entry?.content || ""),
            }))
            .filter((entry) => entry.content)
        : [],
    };

    if (!input.message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const directDocumentRequest = normalizeDocumentGenerationRequest(body.generateDocument);
    if (directDocumentRequest) {
      const generatedDocument = await generateV2Document({
        documentType: directDocumentRequest.documentType,
        userRequest: `${input.message}\n\nRequested file format: ${directDocumentRequest.outputFormat || "DOCX"}`,
        role: input.role,
        activeAccount: input.activeAccount,
        accounts: input.accounts,
        attachments: input.attachments,
        templates: input.templates,
        conversation: input.conversation,
      });

      return NextResponse.json({
        degraded: false,
        intent: "document_request",
        reply: `Generated ${generatedDocument.title}.`,
        generatedDocument,
        documentRequest: {
          type: directDocumentRequest.documentType,
          targetAccount: input.activeAccount?.name,
          missingInputs: [],
          nextAction: "Preview or download the generated document.",
          canGenerate: true,
        },
      });
    }

    if (shouldUseCammieWebResearch(input.message)) {
      return NextResponse.json(await runV2CammieWebResearch(input));
    }

    const result = await runV2Cammie(input);
    const shouldGenerate =
      !result.degraded &&
      result.intent === "document_request" &&
      result.documentRequest?.canGenerate &&
      (result.documentRequest.missingInputs?.length ?? 0) === 0;

    if (!shouldGenerate || !result.documentRequest) {
      return NextResponse.json(result);
    }

    let generatedDocument;
    try {
      generatedDocument = await generateV2Document({
        documentType: result.documentRequest.type,
        userRequest: input.message,
        role: input.role,
        activeAccount: input.activeAccount,
        accounts: input.accounts,
        attachments: input.attachments,
        templates: input.templates,
        conversation: input.conversation,
      });
    } catch (generationError) {
      return NextResponse.json({
        ...result,
        generatedDocument: undefined,
        documentRequest: {
          ...result.documentRequest,
          missingInputs: ["Additional source detail or user direction"],
          nextAction: "Ask the user for the remaining detail before generating a final document.",
          canGenerate: false,
        },
        reply: "I need a little more detail before I can generate a complete document without placeholder sections. Please provide the missing source detail, audience, objective, or decision context for this document.",
        error: generationError instanceof Error ? generationError.message : "Document generation needs more input",
      });
    }

    return NextResponse.json({
      ...result,
      generatedDocument,
      reply: `${result.reply}\n\nGenerated: ${generatedDocument.title}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "T-Man failed",
      },
      { status: 500 },
    );
  }
}
