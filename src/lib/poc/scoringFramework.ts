export type PocKpiKey =
  | "relationshipHealth"
  | "contractHealth"
  | "customerSuccess"
  | "riskScore"
  | "resourceHealth"
  | "projectHealth"
  | "financialHealth"
  | "whitespaceAnalysis";

export interface PocKpiDefinition {
  key: PocKpiKey;
  label: string;
  weight: number;
  purpose: string;
  criteria: string[];
}

export interface PocAccountFields {
  accountName: string;
  industry: string;
  region: string;
  arr: string;
  contractStart: string;
  contractEnd: string;
  executiveSponsor: string;
  primaryContact: string;
  engagementSummary: string;
}

export interface PocKycSections {
  executiveSummary: string;
  businessModel: string;
  keyStakeholders: string;
  strategicGoals: string;
  riskFactors: string;
  expansionOpportunity: string;
  csatHistory: string;
  competitiveLandscape: string;
  financialOverview: string;
}

export interface PocSourceMeta {
  fileName: string;
  mimeType: string;
  charCount: number;
  textPreview: string;
}

export interface PocScoringDimension {
  key: PocKpiKey;
  label: string;
  weight: number;
  score: number;
  evidence: string;
  risk: string;
  recommendedAction: string;
  confidence: number;
}

export interface PocSignal {
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  evidence: string;
}

export interface PocExtractionResult {
  source: PocSourceMeta;
  account: PocAccountFields;
  kyc: PocKycSections;
  scoring: {
    overallScore: number;
    status: string;
    portfolioClassification: string;
    recommendedAction: string;
    dimensions: PocScoringDimension[];
  };
  signals: PocSignal[];
  missingFields: string[];
  assistantSummary: string;
  model: string;
  latencyMs: number;
}

export const POC_KPI_DIMENSIONS: PocKpiDefinition[] = [
  {
    key: "relationshipHealth",
    label: "Relationship Health",
    weight: 20,
    purpose: "Measures relationship strength and stakeholder penetration.",
    criteria: [
      "Executive engagement",
      "Stakeholder coverage",
      "Relationship penetration",
      "Champion strength",
      "Engagement cadence",
    ],
  },
  {
    key: "contractHealth",
    label: "Contract Health",
    weight: 15,
    purpose: "Measures commercial protection and contract stability.",
    criteria: [
      "Contract duration",
      "Notice period protection",
      "Renewability",
      "Price uplift protection",
      "Termination protection",
    ],
  },
  {
    key: "customerSuccess",
    label: "Customer Success (CSAT)",
    weight: 15,
    purpose: "Measures customer satisfaction, confidence, and perceived value.",
    criteria: [
      "NPS score",
      "Customer confidence",
      "Delivery satisfaction",
      "Communication satisfaction",
      "Issue resolution",
    ],
  },
  {
    key: "riskScore",
    label: "Risk Score",
    weight: 15,
    purpose: "Measures retention, business, delivery, and commercial risk.",
    criteria: [
      "Industry risk",
      "Competitive threat",
      "Vendor displacement risk",
      "Delivery risk",
      "Commercial risk",
    ],
  },
  {
    key: "resourceHealth",
    label: "Resource Health",
    weight: 10,
    purpose: "Measures dependency, continuity, staffing, and succession risks.",
    criteria: [
      "Resource dependency risk",
      "Critical resource coverage",
      "Team stability",
      "Skill alignment",
      "Backup readiness",
    ],
  },
  {
    key: "projectHealth",
    label: "Project Health",
    weight: 10,
    purpose: "Measures delivery confidence and execution stability.",
    criteria: [
      "Delivery performance",
      "Backlog readiness",
      "Roadmap visibility",
      "Escalation status",
      "Client confidence",
    ],
  },
  {
    key: "financialHealth",
    label: "Financial Health",
    weight: 10,
    purpose: "Measures payment behavior, billing accuracy, and revenue trend.",
    criteria: [
      "Payment timeliness",
      "Outstanding exposure",
      "Client financial stability",
      "Revenue trend",
      "Contract vs billing alignment",
    ],
  },
  {
    key: "whitespaceAnalysis",
    label: "Whitespace Analysis",
    weight: 5,
    purpose: "Measures account growth and expansion opportunity.",
    criteria: [
      "Service penetration",
      "Cross-sell potential",
      "Upsell potential",
      "Growth signals",
      "Expansion readiness",
    ],
  },
];

export const POC_KPI_KEYS = POC_KPI_DIMENSIONS.map((dimension) => dimension.key);

export const POC_KYC_LABELS: Record<keyof PocKycSections, string> = {
  executiveSummary: "Executive Summary",
  businessModel: "Business Model",
  keyStakeholders: "Key Stakeholders",
  strategicGoals: "Strategic Goals",
  riskFactors: "Risk Factors",
  expansionOpportunity: "Expansion Opportunity",
  csatHistory: "CSAT History",
  competitiveLandscape: "Competitive Landscape",
  financialOverview: "Financial Overview",
};

export const POC_KYC_KEYS = Object.keys(POC_KYC_LABELS) as Array<keyof PocKycSections>;

export function normalizeFivePointScore(value: unknown, fallback = 3): number {
  const numeric = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(5, Math.max(1, Math.round(numeric * 10) / 10));
}

export function calculateWeightedPocScore(dimensions: PocScoringDimension[]): number {
  const totalWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0) || 100;
  const weighted = dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0) / totalWeight;
  return Math.round(weighted * 100) / 100;
}

export function classifyPocScore(overallScore: number) {
  if (overallScore >= 4.5) {
    return {
      status: "Excellent",
      portfolioClassification: "Strategic Growth Account",
      recommendedAction: "Focus on expansion and executive alignment",
    };
  }
  if (overallScore >= 3.5) {
    return {
      status: "Healthy",
      portfolioClassification: "Stable Account",
      recommendedAction: "Maintain engagement and pursue opportunities",
    };
  }
  if (overallScore >= 2.5) {
    return {
      status: "Watchlist",
      portfolioClassification: "Attention Required",
      recommendedAction: "Address weak scoring dimensions",
    };
  }
  if (overallScore >= 1.5) {
    return {
      status: "At Risk",
      portfolioClassification: "Retention Risk",
      recommendedAction: "Execute corrective action plan",
    };
  }
  return {
    status: "Critical",
    portfolioClassification: "Escalation Required",
    recommendedAction: "Immediate executive intervention",
  };
}
