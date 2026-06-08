export type PortfolioHealth = "HEALTHY" | "AT_RISK" | "CRITICAL";

export interface PortfolioAccount {
  id: string;
  name: string;
  industry: string;
  segment?: string;
  region: string;
  country: string;
  arr: number;
  health: PortfolioHealth;
  healthScore: number;
  scoreDimensions?: {
    csat?: number | null;
    relationship?: number | null;
    risk?: number | null;
    contractHealth?: number | null;
    projectHealth?: number | null;
    resourceHealth?: number | null;
    financial?: number | null;
    whitespace?: number | null;
  };
  renewalDays: number;
  kamOwner: string;
  associateOwner: string;
  contactName: string;
  logoUrl?: string;
  deliveryModel: string;
  currentWork: string;
  relationshipSignal: string;
  contacts?: Array<{
    id: string;
    name: string;
    designation: string;
    location: string;
    timeZone: string;
    email: string;
    mobile: string;
    hierarchyRank: number;
  }>;
  resources?: Array<{
    id: string;
    name: string;
    role: string;
    pod: string;
    location: string;
    startDate: string;
  }>;
  journeyItems?: Array<{
    id: string;
    title: string;
    type: "Meeting" | "QBR" | "To-do";
    date: string;
    detail: string;
    status: string;
  }>;
  documents?: Array<{
    id: string;
    name: string;
    type: string;
    uploadedAt: string;
    status: string;
    url: string;
  }>;
  kycVersion?: {
    id: string;
    version: number;
    status: string;
    executiveSummary?: string | null;
    businessModel?: string | null;
    keyStakeholders?: string | null;
    strategicGoals?: string | null;
    riskFactors?: string | null;
    expansionOpportunity?: string | null;
    csatHistory?: string | null;
    competitiveLandscape?: string | null;
    financialOverview?: string | null;
  };
}

const kamOwner = "Sarah Chen";

const rawPortfolioAccounts: Array<Omit<PortfolioAccount, "healthScore" | "logoUrl">> = [
  { id: "v2-acct-stripe", name: "Stripe", industry: "Fintech", region: "North America", country: "USA", arr: 2_850_000, health: "HEALTHY", renewalDays: 244, kamOwner, associateOwner: "Aisha Khan", contactName: "Maya Patel", deliveryModel: "Dedicated product pod", currentWork: "Payments platform modernization", relationshipSignal: "Exec sponsor engaged" },
  { id: "v2-acct-shopify", name: "Shopify", industry: "Commerce Platform", region: "North America", country: "Canada", arr: 2_420_000, health: "HEALTHY", renewalDays: 302, kamOwner, associateOwner: "Aisha Khan", contactName: "Ethan Clarke", deliveryModel: "Managed engineering squad", currentWork: "Merchant analytics and integrations", relationshipSignal: "Expansion workshop planned" },
  { id: "v2-acct-maersk", name: "Maersk", industry: "Logistics", region: "Europe", country: "Denmark", arr: 2_150_000, health: "AT_RISK", renewalDays: 96, kamOwner, associateOwner: "Aisha Khan", contactName: "Sofia Nielsen", deliveryModel: "Hybrid delivery team", currentWork: "Port visibility platform", relationshipSignal: "Delivery timeline under review" },
  { id: "v2-acct-pfizer", name: "Pfizer", industry: "Pharmaceuticals", region: "North America", country: "USA", arr: 1_980_000, health: "HEALTHY", renewalDays: 418, kamOwner, associateOwner: "Aisha Khan", contactName: "Daniel Brooks", deliveryModel: "Compliance-first delivery pod", currentWork: "Clinical workflow automation", relationshipSignal: "Stakeholders aligned" },
  { id: "v2-acct-siemens", name: "Siemens", industry: "Industrial Technology", region: "Europe", country: "Germany", arr: 1_920_000, health: "HEALTHY", renewalDays: 275, kamOwner, associateOwner: "Aisha Khan", contactName: "Lena Fischer", deliveryModel: "IoT engineering pod", currentWork: "Factory data platform", relationshipSignal: "Strong technical champion" },
  { id: "v2-acct-emirates", name: "Emirates", industry: "Aviation", region: "Middle East", country: "UAE", arr: 1_760_000, health: "AT_RISK", renewalDays: 132, kamOwner, associateOwner: "Aisha Khan", contactName: "Noura Al Mansoori", deliveryModel: "Experience engineering team", currentWork: "Passenger operations dashboard", relationshipSignal: "Scope change pressure" },
  { id: "v2-acct-unilever", name: "Unilever", industry: "Consumer Goods", region: "Europe", country: "UK", arr: 1_640_000, health: "HEALTHY", renewalDays: 351, kamOwner, associateOwner: "Aisha Khan", contactName: "Oliver Grant", deliveryModel: "Data and product pod", currentWork: "Trade promotion intelligence", relationshipSignal: "QBR sentiment positive" },
  { id: "v2-acct-dhl", name: "DHL", industry: "Logistics", region: "Europe", country: "Germany", arr: 1_520_000, health: "HEALTHY", renewalDays: 287, kamOwner, associateOwner: "Aisha Khan", contactName: "Jonas Weber", deliveryModel: "Platform maintenance pod", currentWork: "Shipment exception workflows", relationshipSignal: "Operational sponsor active" },
  { id: "v2-acct-adidas", name: "Adidas", industry: "Retail and Apparel", region: "Europe", country: "Germany", arr: 1_440_000, health: "AT_RISK", renewalDays: 74, kamOwner, associateOwner: "Aisha Khan", contactName: "Marta Klein", deliveryModel: "Commerce engineering squad", currentWork: "Order management reliability", relationshipSignal: "Renewal narrative needed" },
  { id: "v2-acct-cisco", name: "Cisco", industry: "Networking Technology", region: "North America", country: "USA", arr: 1_380_000, health: "HEALTHY", renewalDays: 403, kamOwner, associateOwner: "Aisha Khan", contactName: "Rachel Kim", deliveryModel: "Cloud engineering pod", currentWork: "Partner portal modernization", relationshipSignal: "Product owner responsive" },
  { id: "v2-acct-novartis", name: "Novartis", industry: "Pharmaceuticals", region: "Europe", country: "Switzerland", arr: 1_330_000, health: "HEALTHY", renewalDays: 214, kamOwner, associateOwner: "Aisha Khan", contactName: "Matteo Rossi", deliveryModel: "Regulated delivery pod", currentWork: "Medical affairs knowledge platform", relationshipSignal: "Steady engagement" },
  { id: "v2-acct-bp", name: "BP", industry: "Energy", region: "Europe", country: "UK", arr: 1_270_000, health: "CRITICAL", renewalDays: 48, kamOwner, associateOwner: "Aisha Khan", contactName: "Charlotte Evans", deliveryModel: "Data engineering squad", currentWork: "Field operations analytics", relationshipSignal: "Executive escalation open" },
  { id: "v2-acct-ikea", name: "IKEA", industry: "Retail", region: "Europe", country: "Sweden", arr: 1_190_000, health: "HEALTHY", renewalDays: 326, kamOwner, associateOwner: "Aisha Khan", contactName: "Erik Larsson", deliveryModel: "Omnichannel product pod", currentWork: "Store inventory experience", relationshipSignal: "Expansion path visible" },
  { id: "v2-acct-jpmorgan", name: "JPMorgan Chase", industry: "Financial Services", region: "North America", country: "USA", arr: 1_150_000, health: "AT_RISK", renewalDays: 118, kamOwner, associateOwner: "Aisha Khan", contactName: "Priya Menon", deliveryModel: "Security-cleared delivery team", currentWork: "Internal workflow automation", relationshipSignal: "Procurement friction" },
  { id: "v2-acct-lufthansa", name: "Lufthansa", industry: "Aviation", region: "Europe", country: "Germany", arr: 1_090_000, health: "HEALTHY", renewalDays: 261, kamOwner, associateOwner: "Omar Farooq", contactName: "Klaus Richter", deliveryModel: "Data product pod", currentWork: "Crew planning optimization", relationshipSignal: "Delivery cadence stable" },
  { id: "v2-acct-nike", name: "Nike", industry: "Retail and Apparel", region: "North America", country: "USA", arr: 1_040_000, health: "HEALTHY", renewalDays: 378, kamOwner, associateOwner: "Omar Farooq", contactName: "Jordan Hayes", deliveryModel: "Commerce product pod", currentWork: "Loyalty experience engineering", relationshipSignal: "Champion highly engaged" },
  { id: "v2-acct-roche", name: "Roche", industry: "Healthcare", region: "Europe", country: "Switzerland", arr: 980_000, health: "AT_RISK", renewalDays: 89, kamOwner, associateOwner: "Omar Farooq", contactName: "Isabelle Meier", deliveryModel: "Integration engineering team", currentWork: "Lab systems integration", relationshipSignal: "Technical blockers active" },
  { id: "v2-acct-visa", name: "Visa", industry: "Payments", region: "North America", country: "USA", arr: 955_000, health: "HEALTHY", renewalDays: 441, kamOwner, associateOwner: "Omar Farooq", contactName: "Marcus Lee", deliveryModel: "API engineering squad", currentWork: "Developer platform services", relationshipSignal: "Strong architecture partnership" },
  { id: "v2-acct-hsbc", name: "HSBC", industry: "Banking", region: "Europe", country: "UK", arr: 910_000, health: "AT_RISK", renewalDays: 156, kamOwner, associateOwner: "Omar Farooq", contactName: "Anika Shah", deliveryModel: "Compliance delivery pod", currentWork: "Risk workflow modernization", relationshipSignal: "Stakeholder map incomplete" },
  { id: "v2-acct-abb", name: "ABB", industry: "Industrial Automation", region: "Europe", country: "Switzerland", arr: 880_000, health: "HEALTHY", renewalDays: 234, kamOwner, associateOwner: "Omar Farooq", contactName: "Thomas Keller", deliveryModel: "Industrial IoT team", currentWork: "Asset monitoring platform", relationshipSignal: "QBR action plan on track" },
  { id: "v2-acct-airbnb", name: "Airbnb", industry: "Travel Marketplace", region: "North America", country: "USA", arr: 845_000, health: "HEALTHY", renewalDays: 294, kamOwner, associateOwner: "Omar Farooq", contactName: "Nina Alvarez", deliveryModel: "Marketplace engineering pod", currentWork: "Trust and safety tooling", relationshipSignal: "Healthy product rhythm" },
  { id: "v2-acct-fedex", name: "FedEx", industry: "Logistics", region: "North America", country: "USA", arr: 815_000, health: "CRITICAL", renewalDays: 39, kamOwner, associateOwner: "Omar Farooq", contactName: "Grant Miller", deliveryModel: "Operations engineering team", currentWork: "Exception triage workflows", relationshipSignal: "Delivery confidence damaged" },
  { id: "v2-acct-mastercard", name: "Mastercard", industry: "Payments", region: "North America", country: "USA", arr: 790_000, health: "HEALTHY", renewalDays: 367, kamOwner, associateOwner: "Omar Farooq", contactName: "Leah Morgan", deliveryModel: "API and data pod", currentWork: "Partner onboarding automation", relationshipSignal: "Executive sponsor warm" },
  { id: "v2-acct-philips", name: "Philips", industry: "Health Technology", region: "Europe", country: "Netherlands", arr: 760_000, health: "AT_RISK", renewalDays: 146, kamOwner, associateOwner: "Omar Farooq", contactName: "Daan de Vries", deliveryModel: "Healthcare engineering team", currentWork: "Device data workflows", relationshipSignal: "Clinical stakeholder concerns" },
  { id: "v2-acct-target", name: "Target", industry: "Retail", region: "North America", country: "USA", arr: 735_000, health: "HEALTHY", renewalDays: 319, kamOwner, associateOwner: "Omar Farooq", contactName: "Emily Carter", deliveryModel: "Retail operations squad", currentWork: "Store associate tooling", relationshipSignal: "Stakeholders responsive" },
  { id: "v2-acct-barclays", name: "Barclays", industry: "Banking", region: "Europe", country: "UK", arr: 705_000, health: "AT_RISK", renewalDays: 111, kamOwner, associateOwner: "Omar Farooq", contactName: "Hannah Cooper", deliveryModel: "Platform modernization pod", currentWork: "Client servicing workflow", relationshipSignal: "Commercial review pending" },
  { id: "v2-acct-tesla", name: "Tesla", industry: "Automotive", region: "North America", country: "USA", arr: 680_000, health: "HEALTHY", renewalDays: 252, kamOwner, associateOwner: "Omar Farooq", contactName: "Avery Chen", deliveryModel: "Data automation squad", currentWork: "Service operations analytics", relationshipSignal: "Fast decision cycles" },
  { id: "v2-acct-sony", name: "Sony", industry: "Media and Electronics", region: "Asia Pacific", country: "Japan", arr: 650_000, health: "HEALTHY", renewalDays: 333, kamOwner, associateOwner: "Omar Farooq", contactName: "Kenji Tanaka", deliveryModel: "Experience engineering pod", currentWork: "Content operations platform", relationshipSignal: "Expansion idea forming" },
];

const logoDomains: Record<string, string> = {
  "v2-acct-stripe": "stripe.com",
  "v2-acct-shopify": "shopify.com",
  "v2-acct-maersk": "maersk.com",
  "v2-acct-pfizer": "pfizer.com",
  "v2-acct-siemens": "siemens.com",
  "v2-acct-emirates": "emirates.com",
  "v2-acct-unilever": "unilever.com",
  "v2-acct-dhl": "dhl.com",
  "v2-acct-adidas": "adidas.com",
  "v2-acct-cisco": "cisco.com",
  "v2-acct-novartis": "novartis.com",
  "v2-acct-bp": "bp.com",
  "v2-acct-ikea": "ikea.com",
  "v2-acct-jpmorgan": "jpmorganchase.com",
  "v2-acct-lufthansa": "lufthansa.com",
  "v2-acct-nike": "nike.com",
  "v2-acct-roche": "roche.com",
  "v2-acct-visa": "visa.com",
  "v2-acct-hsbc": "hsbc.com",
  "v2-acct-abb": "abb.com",
  "v2-acct-airbnb": "airbnb.com",
  "v2-acct-fedex": "fedex.com",
  "v2-acct-mastercard": "mastercard.com",
  "v2-acct-philips": "philips.com",
  "v2-acct-target": "target.com",
  "v2-acct-barclays": "barclays.com",
  "v2-acct-tesla": "tesla.com",
  "v2-acct-sony": "sony.com",
};

const healthScores: Record<string, number> = {
  "v2-acct-stripe": 92,
  "v2-acct-shopify": 90,
  "v2-acct-maersk": 58,
  "v2-acct-pfizer": 88,
  "v2-acct-siemens": 86,
  "v2-acct-emirates": 61,
  "v2-acct-unilever": 84,
  "v2-acct-dhl": 83,
  "v2-acct-adidas": 54,
  "v2-acct-cisco": 87,
  "v2-acct-novartis": 82,
  "v2-acct-bp": 31,
  "v2-acct-ikea": 85,
  "v2-acct-jpmorgan": 63,
  "v2-acct-lufthansa": 81,
  "v2-acct-nike": 89,
  "v2-acct-roche": 56,
  "v2-acct-visa": 91,
  "v2-acct-hsbc": 59,
  "v2-acct-abb": 84,
  "v2-acct-airbnb": 86,
  "v2-acct-fedex": 29,
  "v2-acct-mastercard": 88,
  "v2-acct-philips": 62,
  "v2-acct-target": 83,
  "v2-acct-barclays": 60,
  "v2-acct-tesla": 80,
  "v2-acct-sony": 82,
};

export const portfolioAccounts: PortfolioAccount[] = rawPortfolioAccounts.map((account) => ({
  ...account,
  healthScore: healthScores[account.id],
  logoUrl: `https://www.google.com/s2/favicons?domain=${logoDomains[account.id]}&sz=128`,
}));

export const associatePortfolio = portfolioAccounts.filter((account) => account.associateOwner === "Aisha Khan");
