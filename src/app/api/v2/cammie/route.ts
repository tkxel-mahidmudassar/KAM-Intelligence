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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isObject(body)) {
      return NextResponse.json({ error: "Invalid Cammie payload" }, { status: 400 });
    }

    const activeAccount = normalizeAccount(body.activeAccount);
    const input: V2CammieInput = {
      role: String(body.role || "ASSOCIATE"),
      message: String(body.message || ""),
      activeAccount,
      accounts: Array.isArray(body.accounts)
        ? body.accounts.map(normalizeAccount).filter((account): account is NonNullable<ReturnType<typeof normalizeAccount>> => Boolean(account))
        : [],
      conversation: Array.isArray(body.conversation)
        ? body.conversation
            .map((entry) => ({
              role: entry?.role === "assistant" ? "assistant" : "user",
              content: String(entry?.content || ""),
            }))
            .filter((entry) => entry.content)
        : [],
    };

    if (!input.message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
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

    const generatedDocument = await generateV2Document({
      documentType: result.documentRequest.type,
      userRequest: input.message,
      role: input.role,
      activeAccount: input.activeAccount,
      accounts: input.accounts,
      conversation: input.conversation,
    });

    return NextResponse.json({
      ...result,
      generatedDocument,
      reply: `${result.reply}\n\nGenerated: ${generatedDocument.title}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Cammie failed",
      },
      { status: 500 },
    );
  }
}
