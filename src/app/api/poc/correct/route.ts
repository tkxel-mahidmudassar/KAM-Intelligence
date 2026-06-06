import { NextRequest, NextResponse } from "next/server";
import { complete } from "@/lib/ai";
import { normalizePocResult } from "@/lib/poc/result";
import type { PocExtractionResult, PocSourceMeta } from "@/lib/poc/scoringFramework";

export const runtime = "nodejs";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJsonObject(content: string): Record<string, unknown> {
  const cleaned = content.replace(/```json|```/g, "").trim();
  try {
    return asRecord(JSON.parse(cleaned));
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI correction response did not contain JSON");
    return asRecord(JSON.parse(match[0]));
  }
}

function sourceFromCurrent(current: unknown): PocSourceMeta {
  const source = asRecord(asRecord(current).source);
  return {
    fileName: String(source.fileName || "POC source"),
    mimeType: String(source.mimeType || "text/plain"),
    charCount: Number(source.charCount || 0),
    textPreview: String(source.textPreview || ""),
  };
}

function correctionValue(instruction: string, pattern: RegExp): string {
  const match = instruction.match(pattern);
  return match?.[1]?.trim().replace(/[.;,]+$/, "") ?? "";
}

function applyLocalCorrection(current: unknown, instruction: string): PocExtractionResult & { changeLog: string[] } {
  const normalized = normalizePocResult(current, {
    source: sourceFromCurrent(current),
    model: "local-correction",
    latencyMs: 0,
  });

  const changeLog: string[] = [];

  const arr = correctionValue(instruction, /\bARR\b(?:\s+should\s+be|\s+is|\s*[:=])?\s*([^;\n]+?)(?=\s+(?:and|,)\s+(?:renewal|contract|industry|sponsor|account)|[;\n]|$)/i);
  if (arr) {
    normalized.account.arr = arr;
    changeLog.push(`ARR updated to ${arr}.`);
  }

  const accountName = correctionValue(instruction, /(?:account name|company name)(?:\s+should\s+be|\s+is|\s*[:=])?\s*([^;\n]+?)(?=\s+(?:and|,)\s+(?:arr|renewal|industry|sponsor|contact)|[;\n]|$)/i);
  if (accountName) {
    normalized.account.accountName = accountName;
    changeLog.push(`Account name updated to ${accountName}.`);
  }

  const industry = correctionValue(instruction, /industry(?:\s+should\s+be|\s+is|\s*[:=])?\s*([^;\n]+?)(?=\s+(?:and|,)\s+(?:arr|renewal|sponsor|account|contact)|[;\n]|$)/i);
  if (industry) {
    normalized.account.industry = industry;
    changeLog.push(`Industry updated to ${industry}.`);
  }

  const contractEnd = correctionValue(instruction, /(?:renewal date|contract end|renewal)(?:\s+should\s+be|\s+is|\s*[:=])?\s*([^;\n]+?)(?=\s+(?:and|,)\s+(?:arr|industry|sponsor|account|contact)|[;\n]|$)/i);
  if (contractEnd) {
    normalized.account.contractEnd = contractEnd;
    changeLog.push(`Contract end updated to ${contractEnd}.`);
  }

  const sponsor = correctionValue(instruction, /(?:executive sponsor|sponsor)(?:\s+should\s+be|\s+is|\s*[:=])?\s*([^;\n]+?)(?=\s+(?:and|,)\s+(?:arr|renewal|industry|account|contact)|[;\n]|$)/i);
  if (sponsor) {
    normalized.account.executiveSponsor = sponsor;
    changeLog.push(`Executive sponsor updated to ${sponsor}.`);
  }

  const contact = correctionValue(instruction, /(?:primary contact|main contact)(?:\s+should\s+be|\s+is|\s*[:=])?\s*([^;\n]+?)(?=\s+(?:and|,)\s+(?:arr|renewal|industry|sponsor|account)|[;\n]|$)/i);
  if (contact) {
    normalized.account.primaryContact = contact;
    changeLog.push(`Primary contact updated to ${contact}.`);
  }

  return {
    ...normalized,
    assistantSummary: changeLog.length ? changeLog.join(" ") : "AI correction was unavailable, so no local correction was applied.",
    changeLog: changeLog.length ? changeLog : ["No local correction rule matched the request."],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const instruction = String(body?.instruction || "").trim();
    const current = body?.current;

    if (!instruction) {
      return NextResponse.json({ error: "instruction is required" }, { status: 400 });
    }
    if (!current) {
      return NextResponse.json({ error: "current result is required" }, { status: 400 });
    }

    try {
      const aiResponse = await complete({
        task: "poc-correction",
        jsonMode: true,
        temperature: 0,
        maxTokens: 4200,
        messages: [
          {
            role: "system",
            content:
              "You correct a KAM Intelligence POC extraction. Preserve the JSON shape, update only what the user correction supports, and recalculate the 1-5 weighted score if scores change.",
          },
          {
            role: "user",
            content: `User correction:
${instruction}

Current extraction JSON:
${JSON.stringify(current, null, 2)}

Return JSON only:
{
  "assistantReply": "briefly state what changed",
  "changeLog": ["specific change"],
  "result": {
    "account": {},
    "kyc": {},
    "scoring": { "dimensions": [] },
    "signals": [],
    "missingFields": [],
    "assistantSummary": ""
  }
}`,
          },
        ],
      });

      const parsed = parseJsonObject(aiResponse.content);
      const rawResult = parsed.result ?? parsed;
      const normalized = normalizePocResult(rawResult, {
        source: sourceFromCurrent(current),
        model: aiResponse.model,
        latencyMs: aiResponse.latencyMs,
      });

      return NextResponse.json({
        ...normalized,
        assistantSummary: String(parsed.assistantReply || normalized.assistantSummary),
        changeLog: Array.isArray(parsed.changeLog) ? parsed.changeLog.map(String).slice(0, 8) : [],
      });
    } catch (aiError) {
      return NextResponse.json(applyLocalCorrection(current, instruction));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "POC correction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
