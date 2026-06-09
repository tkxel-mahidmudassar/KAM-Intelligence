import { NextRequest, NextResponse } from "next/server";
import { parsePlaybookFile } from "@/lib/playbooks/parser";
import { POC_KPI_DIMENSIONS } from "@/lib/poc/scoringFramework";
import { completePocWithFallback } from "@/lib/poc/aiFallback";
import { buildFallbackPocResult, normalizePocResult } from "@/lib/poc/result";
import type { PocSourceMeta } from "@/lib/poc/scoringFramework";

export const runtime = "nodejs";

const MAX_PROMPT_CHARS = 14000;
const MAX_FILES = 8;
const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024;

function parseJsonObject(content: string): unknown {
  const cleaned = content.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response did not contain a JSON object");
    return JSON.parse(match[0]);
  }
}

function buildExtractionPrompt(sourceText: string, source: PocSourceMeta): string {
  const frameworkLines = POC_KPI_DIMENSIONS.map((dimension) =>
    `- key: ${dimension.key}; label: ${dimension.label}; weight: ${dimension.weight}%; criteria: ${dimension.criteria.join(", ")}`
  ).join("\n");

  return `You are the KAM Intelligence Platform POC extraction engine.

Use only the supplied document text. Do not invent ARR, dates, contacts, sponsors, competitors, or scores. If a value is not supported, return an empty string or say "Not available in current sources".

Scoring framework:
- Every KPI is scored from 1 to 5.
- 1 = Critical, 2 = Weak, 3 = Moderate, 4 = Healthy, 5 = Excellent.
- Overall score is a weighted 1-5 score.
${frameworkLines}

Return one valid JSON object with this exact shape:
{
  "assistantSummary": "short factual summary of what was extracted",
  "account": {
    "accountName": "",
    "industry": "",
    "region": "",
    "arr": "",
    "contractStart": "",
    "contractEnd": "",
    "executiveSponsor": "",
    "primaryContact": "",
    "engagementSummary": ""
  },
  "kyc": {
    "executiveSummary": "",
    "businessModel": "",
    "keyStakeholders": "",
    "strategicGoals": "",
    "riskFactors": "",
    "expansionOpportunity": "",
    "csatHistory": "",
    "competitiveLandscape": "",
    "financialOverview": ""
  },
  "scoring": {
    "dimensions": [
      {
        "key": "relationshipHealth",
        "score": 1,
        "evidence": "specific source evidence",
        "risk": "specific risk or 'No specific risk stated.'",
        "recommendedAction": "specific KAM action",
        "confidence": 0.0
      }
    ]
  },
  "signals": [
    {
      "type": "CONTRACT_EXPIRY | CHURN_RISK | TICKET_SPIKE | NPS_DECLINE | RELATIONSHIP_CHANGE | UPSELL_OPPORTUNITY | CUSTOM",
      "severity": "INFO | WARNING | CRITICAL",
      "title": "",
      "evidence": ""
    }
  ],
  "missingFields": []
}

Rules:
- Include all 8 scoring dimensions using the exact keys from the framework.
- Base each dimension score on the criteria listed above.
- Prefer conservative score 3 when evidence is thin.
- For Risk Score, 5 means low risk and 1 means high risk.
- Put correction-ready text in the KYC fields, not long essays.
- Keep each evidence and recommendedAction under 220 characters.

Source document(s): ${source.fileName}
MIME type(s): ${source.mimeType}
Text:
${sourceText.slice(0, MAX_PROMPT_CHARS)}`;
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value;
}

function locatorForChunk(chunk: Awaited<ReturnType<typeof parsePlaybookFile>>["chunks"][number], index: number): string {
  if (chunk.sourceSheet && chunk.sourcePage) return `${chunk.sourceSheet}, block ${chunk.sourcePage}`;
  if (chunk.sourceSheet) return chunk.sourceSheet;
  if (chunk.sourcePage) return `Page ${chunk.sourcePage}`;
  if (chunk.sourceSection) return chunk.sourceSection;
  return `Chunk ${index + 1}`;
}

async function textFromUploadedFile(file: File, fileIndex: number): Promise<{ text: string; warning?: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parsePlaybookFile(buffer, file.type || "application/octet-stream", file.name);
  let text = parsed.chunks.map((chunk, index) => {
    const locator = locatorForChunk(chunk, index);
    return `[File ${fileIndex}: ${file.name} | ${locator}]\n${chunk.text}`;
  }).join("\n\n");

  if (!text.trim() && (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt"))) {
    text = `[File ${fileIndex}: ${file.name}]\n${buffer.toString("utf-8")}`;
  }

  if (parsed.error && !text.trim()) {
    throw new Error(`${file.name}: ${parsed.error}`);
  }

  return {
    text: text.trim(),
    warning: parsed.error ? `${file.name}: ${parsed.error}` : undefined,
  };
}

async function textFromFormData(formData: FormData): Promise<{ sourceText: string; source: PocSourceMeta }> {
  const uploadedFiles = [...formData.getAll("files"), ...formData.getAll("file")]
    .filter(isUploadedFile)
    .filter((file) => file.size > 0);
  const directText = String(formData.get("text") ?? "").trim();
  const directFileName = String(formData.get("fileName") ?? "Demo account brief.txt").trim();

  if (uploadedFiles.length > 0) {
    if (uploadedFiles.length > MAX_FILES) {
      throw new Error(`Upload up to ${MAX_FILES} files for one account extraction.`);
    }

    const totalBytes = uploadedFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      throw new Error("Combined upload is too large. Keep all files under 25 MB total.");
    }

    const parsedFiles: Array<{ text: string; warning?: string }> = [];
    for (const [index, file] of uploadedFiles.entries()) {
      parsedFiles.push(await textFromUploadedFile(file, index + 1));
    }

    const warnings = parsedFiles.map((item) => item.warning).filter(Boolean);
    const sourceText = [
      `The following ${uploadedFiles.length} source file(s) belong to one account. Extract one consolidated account profile from all documents.`,
      ...parsedFiles.map((item) => item.text),
      warnings.length ? `Parse warnings:\n${warnings.join("\n")}` : "",
    ].filter(Boolean).join("\n\n---\n\n");

    const names = uploadedFiles.map((file) => file.name);
    const nameSummary = names.length === 1 ? names[0] : `${names.length} files: ${names.slice(0, 4).join(", ")}${names.length > 4 ? ", ..." : ""}`;
    const mimeSummary = uploadedFiles.length === 1
      ? uploadedFiles[0].type || "application/octet-stream"
      : Array.from(new Set(uploadedFiles.map((file) => file.type || "application/octet-stream"))).join(", ");

    return {
      sourceText: sourceText.trim(),
      source: {
        fileName: nameSummary,
        mimeType: mimeSummary,
        charCount: sourceText.length,
        textPreview: sourceText.slice(0, 700),
      },
    };
  }

  return {
    sourceText: directText,
    source: {
      fileName: directFileName || "Demo account brief.txt",
      mimeType: "text/plain",
      charCount: directText.length,
      textPreview: directText.slice(0, 700),
    },
  };
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const formData = await req.formData();
    const { sourceText, source } = await textFromFormData(formData);

    if (sourceText.trim().length < 20) {
      return NextResponse.json({ error: "Document text is too short to extract account intelligence." }, { status: 400 });
    }

    try {
      const aiResponse = await completePocWithFallback({
        task: "poc-document-extraction",
        jsonMode: true,
        temperature: 0,
        maxTokens: 4200,
        messages: [
          {
            role: "system",
            content: "You extract KAM account intelligence and return only valid JSON.",
          },
          {
            role: "user",
            content: buildExtractionPrompt(sourceText, source),
          },
        ],
      });

      const parsed = parseJsonObject(aiResponse.content);
      return NextResponse.json({
        ...normalizePocResult(parsed, {
          source,
          model: `${aiResponse.provider}:${aiResponse.model}`,
          latencyMs: aiResponse.latencyMs,
        }),
        providerTrace: aiResponse.providerTrace,
      });
    } catch (aiError) {
      const message = aiError instanceof Error ? aiError.message : "AI extraction failed";
      return NextResponse.json(buildFallbackPocResult(sourceText, source, message));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "POC extraction failed";
    return NextResponse.json({ error: message, latencyMs: Date.now() - startedAt }, { status: 500 });
  }
}
