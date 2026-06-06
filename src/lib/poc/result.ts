import {
  POC_KPI_DIMENSIONS,
  POC_KYC_KEYS,
  calculateWeightedPocScore,
  classifyPocScore,
  normalizeFivePointScore,
  type PocAccountFields,
  type PocExtractionResult,
  type PocKycSections,
  type PocScoringDimension,
  type PocSignal,
  type PocSourceMeta,
} from "./scoringFramework";

interface NormalizeOptions {
  source: PocSourceMeta;
  model: string;
  latencyMs: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function cleanStringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => cleanString(item))
    .filter(Boolean)
    .slice(0, 12);
}

function cleanConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(numeric)) return 0.65;
  return Math.min(1, Math.max(0, Math.round(numeric * 100) / 100));
}

function normalizeAccount(raw: unknown): PocAccountFields {
  const account = asRecord(raw);
  return {
    accountName: cleanString(account.accountName || account.name || account.companyName),
    industry: cleanString(account.industry),
    region: cleanString(account.region || account.location || account.country),
    arr: cleanString(account.arr || account.contractValue || account.revenue),
    contractStart: cleanString(account.contractStart || account.startDate),
    contractEnd: cleanString(account.contractEnd || account.renewalDate || account.endDate),
    executiveSponsor: cleanString(account.executiveSponsor || account.sponsor),
    primaryContact: cleanString(account.primaryContact || account.contact),
    engagementSummary: cleanString(account.engagementSummary || account.summary),
  };
}

function normalizeKyc(raw: unknown): PocKycSections {
  const source = asRecord(raw);
  return POC_KYC_KEYS.reduce((acc, key) => {
    acc[key] = cleanString(source[key], "Not available in current sources.");
    return acc;
  }, {} as PocKycSections);
}

function normalizeSignals(raw: unknown): PocSignal[] {
  return asArray(raw).slice(0, 8).map((item) => {
    const signal = asRecord(item);
    const severity = cleanString(signal.severity).toUpperCase();
    return {
      type: cleanString(signal.type || "CUSTOM", "CUSTOM"),
      severity: severity === "CRITICAL" || severity === "INFO" ? severity : "WARNING",
      title: cleanString(signal.title || "Account signal").slice(0, 100),
      evidence: cleanString(signal.evidence || signal.description || "Review the source document for supporting context."),
    };
  });
}

function normalizeDimensions(raw: unknown): PocScoringDimension[] {
  const scoring = asRecord(raw);
  const rawDimensions = asArray(scoring.dimensions || raw);
  const byKey = new Map<string, Record<string, unknown>>();

  for (const item of rawDimensions) {
    const dimension = asRecord(item);
    const key = cleanString(dimension.key);
    if (key) byKey.set(key, dimension);
  }

  return POC_KPI_DIMENSIONS.map((definition) => {
    const rawDimension = byKey.get(definition.key) ?? {};
    return {
      key: definition.key,
      label: definition.label,
      weight: definition.weight,
      score: normalizeFivePointScore(rawDimension.score),
      evidence: cleanString(rawDimension.evidence || rawDimension.rationale, "Not enough direct evidence found in the document."),
      risk: cleanString(rawDimension.risk, "No specific risk stated."),
      recommendedAction: cleanString(rawDimension.recommendedAction || rawDimension.action, "Validate with the KAM before committing."),
      confidence: cleanConfidence(rawDimension.confidence),
    };
  });
}

export function normalizePocResult(raw: unknown, options: NormalizeOptions): PocExtractionResult {
  const root = asRecord(raw);
  const account = normalizeAccount(root.account);
  const kyc = normalizeKyc(root.kyc);
  const dimensions = normalizeDimensions(asRecord(root.scoring).dimensions || root.dimensions);
  const overallScore = calculateWeightedPocScore(dimensions);
  const classification = classifyPocScore(overallScore);

  return {
    source: options.source,
    account,
    kyc,
    scoring: {
      overallScore,
      status: cleanString(asRecord(root.scoring).status, classification.status) || classification.status,
      portfolioClassification: cleanString(asRecord(root.scoring).portfolioClassification, classification.portfolioClassification) || classification.portfolioClassification,
      recommendedAction: cleanString(asRecord(root.scoring).recommendedAction, classification.recommendedAction) || classification.recommendedAction,
      dimensions,
    },
    signals: normalizeSignals(root.signals),
    missingFields: cleanStringArray(root.missingFields),
    assistantSummary: cleanString(root.assistantSummary || root.summary, "Extraction completed."),
    model: options.model,
    latencyMs: options.latencyMs,
  };
}

function firstMatch(text: string, patterns: RegExp[], fallback = ""): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[.;,]+$/, "");
  }
  return fallback;
}

function scoreBySignals(text: string, key: string): number {
  const lower = text.toLowerCase();
  let score = 3;

  const positive = ["strong", "healthy", "stable", "excellent", "weekly", "auto-renew", "on time", "sponsor", "champion", "growth", "expansion"];
  const negative = ["critical", "risk", "churn", "delayed", "overdue", "escalation", "dissatisfied", "termination", "competitor", "missed", "unresolved"];

  for (const word of positive) if (lower.includes(word)) score += 0.15;
  for (const word of negative) if (lower.includes(word)) score -= 0.18;

  if (key === "relationshipHealth" && /executive|sponsor|champion|weekly|monthly/.test(lower)) score += 0.5;
  if (key === "contractHealth" && /auto-renew|90 days|uplift|non-terminable|renewal/.test(lower)) score += 0.35;
  if (key === "contractHealth" && /expires|termination|notice|< ?30/.test(lower)) score -= 0.4;
  if (key === "customerSuccess" && /nps|csat|satisfied|promoter|confidence/.test(lower)) score += 0.35;
  if (key === "riskScore" && /escalation|competitor|displacement|churn|critical/.test(lower)) score -= 0.65;
  if (key === "projectHealth" && /delay|missed|blocker|backlog|roadmap/.test(lower)) score -= 0.25;
  if (key === "financialHealth" && /overdue|invoice|billing|payment/.test(lower)) score -= 0.25;
  if (key === "whitespaceAnalysis" && /upsell|cross-sell|expansion|opportunity|new service/.test(lower)) score += 0.55;

  return normalizeFivePointScore(score);
}

export function buildFallbackPocResult(sourceText: string, source: PocSourceMeta, warning?: string): PocExtractionResult {
  const accountName = firstMatch(sourceText, [
    /(?:account|client|customer|company)\s*[:\-]\s*([^\n]+)/i,
    /(?:for|with)\s+([A-Z][A-Za-z0-9&.\-\s]{2,60})(?:\s+(?:account|client|customer|project|engagement))/,
  ], source.fileName.replace(/\.[^.]+$/, ""));
  const industry = firstMatch(sourceText, [/(?:industry|sector)\s*[:\-]\s*([^\n]+)/i]);
  const region = firstMatch(sourceText, [/(?:region|location|country)\s*[:\-]\s*([^\r\n]+)/i]);
  const arr = firstMatch(sourceText, [/(?:ARR|annual recurring revenue|contract value)\s*[:\-]?\s*([^\r\n]+)/i]);
  const start = firstMatch(sourceText, [/(?:contract start|start date)\s*[:\-]\s*([^\r\n]+)/i]);
  const renewal = firstMatch(sourceText, [/(?:contract end\s*\/\s*renewal|contract end|renewal|expires|expiry)\s*[:\-]?\s*([^\r\n]+)/i]);
  const sponsor = firstMatch(sourceText, [/(?:executive sponsor|sponsor|champion)\s*[:\-]\s*([^\n]+)/i]);
  const primaryContact = firstMatch(sourceText, [/(?:primary contact|main contact|contact)\s*[:\-]\s*([^\r\n]+)/i]);

  const dimensions = POC_KPI_DIMENSIONS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    weight: definition.weight,
    score: scoreBySignals(sourceText, definition.key),
    evidence: `Local fallback used keyword evidence for ${definition.label}.`,
    risk: "AI extraction was unavailable, so this should be validated during the demo.",
    recommendedAction: "Ask the assistant to correct or enrich this dimension with confirmed account facts.",
    confidence: 0.35,
  }));

  const overallScore = calculateWeightedPocScore(dimensions);
  const classification = classifyPocScore(overallScore);

  return {
    source,
    account: {
      accountName,
      industry,
      region,
      arr,
      contractStart: start,
      contractEnd: renewal,
      executiveSponsor: sponsor,
      primaryContact,
      engagementSummary: sourceText.slice(0, 500),
    },
    kyc: {
      executiveSummary: `${accountName || "This account"} was parsed with local fallback logic. ${warning ?? ""}`.trim(),
      businessModel: industry || "Not available in current sources.",
      keyStakeholders: sponsor || "Not available in current sources.",
      strategicGoals: "Not available in current sources.",
      riskFactors: sourceText.toLowerCase().includes("risk") ? "Risk indicators were mentioned in the source document." : "Not available in current sources.",
      expansionOpportunity: /upsell|cross-sell|expansion|opportunity/i.test(sourceText) ? "Expansion language appears in the source document." : "Not available in current sources.",
      csatHistory: /csat|nps|satisf/i.test(sourceText) ? "Customer satisfaction language appears in the source document." : "Not available in current sources.",
      competitiveLandscape: /competitor|competition|displacement/i.test(sourceText) ? "Competitive risk language appears in the source document." : "Not available in current sources.",
      financialOverview: arr || "Not available in current sources.",
    },
    scoring: {
      overallScore,
      status: classification.status,
      portfolioClassification: classification.portfolioClassification,
      recommendedAction: classification.recommendedAction,
      dimensions,
    },
    signals: warning ? [{ type: "POC_FALLBACK", severity: "WARNING", title: "AI extraction fallback used", evidence: warning }] : [],
    missingFields: ["Validate fallback output with AI or KAM review"],
    assistantSummary: warning ? `Local fallback completed: ${warning}` : "Local fallback completed.",
    model: "local-fallback",
    latencyMs: 0,
  };
}
