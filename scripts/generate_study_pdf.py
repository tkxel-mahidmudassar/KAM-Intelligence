from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "KAM_Intelligence_Platform_Code_Study_Guide.pdf"


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="CoverTitle",
            parent=styles["Title"],
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
            fontSize=26,
            leading=31,
            textColor=colors.HexColor("#101827"),
            spaceAfter=18,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CoverSub",
            parent=styles["BodyText"],
            alignment=TA_CENTER,
            fontSize=11,
            leading=16,
            textColor=colors.HexColor("#475569"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=23,
            textColor=colors.HexColor("#0755E9"),
            spaceBefore=6,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H2",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=17,
            textColor=colors.HexColor("#111827"),
            spaceBefore=8,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13.5,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Small",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#475569"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="Callout",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=13.5,
            textColor=colors.HexColor("#0F172A"),
            backColor=colors.HexColor("#EEF4FE"),
            borderColor=colors.HexColor("#B3CFFD"),
            borderWidth=0.75,
            borderPadding=8,
            spaceBefore=4,
            spaceAfter=10,
        )
    )
    return styles


STYLES = build_styles()


def p(text, style="Body"):
    return Paragraph(text, STYLES[style])


def h1(text):
    return p(text, "H1")


def h2(text):
    return p(text, "H2")


def bullets(items):
    return ListFlowable(
        [ListItem(p(item), leftIndent=10) for item in items],
        bulletType="bullet",
        leftIndent=16,
        bulletFontName="Helvetica",
        bulletFontSize=7,
        bulletColor=colors.HexColor("#0755E9"),
    )


def table(rows, widths=None):
    converted = []
    for row in rows:
        converted.append([cell if hasattr(cell, "wrap") else p(str(cell), "Small") for cell in row])
    tbl = Table(converted, colWidths=widths, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0755E9")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D8DEE9")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ]
        )
    )
    return tbl


def page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.drawString(0.75 * inch, 0.45 * inch, "KAM Intelligence Platform - Code Study Guide")
    canvas.drawRightString(7.75 * inch, 0.45 * inch, f"Page {doc.page}")
    canvas.restoreState()


def build_story():
    story = []

    story.extend(
        [
            Spacer(1, 1.2 * inch),
            p("KAM Intelligence Platform", "CoverTitle"),
            p("Code Understanding and POC Preparation Guide", "CoverTitle"),
            p("Prepared for presentation readiness - generated June 7, 2026", "CoverSub"),
            Spacer(1, 0.25 * inch),
            p(
                "Use this document as your map for explaining what the project does, how the Next.js and TypeScript code is organized, where the AI models are called, how scoring works, and what the new POC screen demonstrates.",
                "Callout",
            ),
            Spacer(1, 0.3 * inch),
            table(
                [
                    ["Presentation angle", "Short answer"],
                    ["Product story", "A Key Account Management intelligence platform that turns account data, documents, signals, KYC, and scoring into actionable portfolio decisions."],
                    ["Technical story", "A Next.js App Router application with React client screens, server API route handlers, Prisma/MySQL persistence, AI provider abstraction, mock integration adapters, scoring logic, and agent-style AI workflows."],
                    ["POC story", "A direct working screen where a document is uploaded, parsed, extracted into account fields/KYC/scoring, corrected through chat, and recalculated using the lead framework."],
                ],
                [1.7 * inch, 4.9 * inch],
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("1. The One-Minute Product Explanation"),
            p(
                "KAM Intelligence helps account managers understand account health without manually stitching together spreadsheets, meeting notes, contracts, support signals, financial data, and relationship history. The platform gives each account a health score, highlights risks and opportunities, drafts KYC intelligence, proposes actions, and supports portfolio-level visibility.",
            ),
            p(
                "For the presentation, keep the story simple: the system ingests account context, uses deterministic scoring plus AI interpretation, shows explainable score drivers, and lets humans accept, reject, correct, or approve the outputs.",
            ),
            h2("The main user roles"),
            bullets(
                [
                    "<b>Associate:</b> supports KAMs, uploads documents, drafts account setup/KYC, and routes changes for review.",
                    "<b>KAM:</b> owns the account, reviews proposals, manages account profile/actions/documents, and approves changes.",
                    "<b>C-Level/Executive:</b> read-only portfolio visibility for health, risk, and strategic decisions.",
                ]
            ),
            h2("What changed for the POC"),
            p(
                "A new dedicated <b>/poc</b> route now demonstrates direct AI work instead of requiring a full application walkthrough. It has a document upload/demo brief, extraction into editable account fields, a KYC view, a 1-5 weighted scoring view, extracted signals, and a correction prompt.",
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("2. Next.js and TypeScript Basics for This Repo"),
            table(
                [
                    ["Concept", "How it appears here", "What to say in presentation"],
                    ["App Router", "Files under src/app define routes. Example: src/app/portfolio/page.tsx maps to /portfolio and src/app/poc/page.tsx maps to /poc.", "The URL structure comes from the folder structure."],
                    ["API route handlers", "Files named route.ts under src/app/api implement server endpoints. Example: src/app/api/ai/score/route.ts.", "Frontend screens call these endpoints with fetch; the server code handles DB and AI calls."],
                    ["Client components", "Files with 'use client' run in the browser and can use hooks/state. PortfolioPage and /poc are client components.", "Interactive screens live in client components."],
                    ["Server-only logic", "AI providers, Prisma, parsers, and API routes stay server-side.", "API keys and database access are not exposed to the browser."],
                    ["TypeScript", "Interfaces and types define shapes for roles, scoring, KYC, AI providers, and POC results.", "Types make the data contracts explicit and reduce runtime mistakes."],
                    ["Path aliases", "Imports like @/lib/ai map to src/lib/ai through tsconfig.json.", "The code avoids fragile deep relative paths."],
                ],
                [1.2 * inch, 2.75 * inch, 2.5 * inch],
            ),
            h2("Project scripts"),
            bullets(
                [
                    "<b>npm run dev</b>: starts the local Next.js dev server.",
                    "<b>npm run build</b>: runs the production Next build. The config skips in-build lint/type checks due local SWC issues; use TypeScript separately when possible.",
                    "<b>npm run db:seed</b>: runs the Prisma seed script for demo data.",
                    "<b>npm run vercel-build</b>: runs Prisma generate and Next build for deployment.",
                ]
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("3. Repository Map"),
            table(
                [
                    ["Area", "Key files/folders", "Responsibility"],
                    ["App shell", "src/app/layout.tsx, src/app/page.tsx", "Global layout wraps ThemeProvider, RoleProvider, RoleBar. The home page redirects to /portfolio."],
                    ["Portfolio UI", "src/app/portfolio/page.tsx, src/components/portfolio/PortfolioPage.tsx", "Large client-side portfolio workspace, account cards, account modal, documents tab, mock account setup flow."],
                    ["POC UI", "src/app/poc/page.tsx", "Focused demo experience for upload, extraction, correction, KYC, scoring, and signals."],
                    ["API routes", "src/app/api/**/route.ts", "Server endpoints for accounts, scores, documents, KYC, QBR, settings, AI agents, and POC routes."],
                    ["AI layer", "src/lib/ai/**", "Provider abstraction, OpenAI/Claude/Gemini providers, logging, and specialized agents."],
                    ["Scoring", "src/lib/scoring/**", "KPI weight constants, deterministic KPI scoring, trigger engine, recommendation expiry."],
                    ["Database", "prisma/schema.prisma, prisma/migrations, prisma/seed", "Prisma models, MySQL schema, seed data for demo accounts and histories."],
                    ["Adapters", "src/lib/adapters/**", "Mock/live connector pattern for Salesforce, Jira, Worksphere, and Finance data."],
                    ["Playbooks/RAG", "src/lib/playbooks/**, src/lib/rag/README.md", "File parsing and playbook extraction flow for rules and recommendations."],
                    ["Shared UI", "src/components/ui/**, src/styles/globals.css", "Reusable Button/Input/Textarea/Card/Badge components and design tokens."],
                ],
                [1.15 * inch, 2.25 * inch, 3.1 * inch],
            ),
            p(
                "The most important mental model: pages are user-facing screens, route handlers are backend endpoints, src/lib contains reusable business logic, and Prisma owns durable data shape.",
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("4. Runtime Flow"),
            h2("Current deployed walkthrough flow"),
            bullets(
                [
                    "User visits /, and src/app/page.tsx redirects to /portfolio.",
                    "src/app/layout.tsx wraps all pages with ThemeProvider, RoleProvider, and RoleBar.",
                    "RoleBar stores the current role through RoleContext and now also links to Portfolio and POC.",
                    "PortfolioPage is a large client component with local state for filters, modals, onboarding, documents, score rows, and account workspace tabs.",
                    "Many portfolio cards and modal details use seeded/static V2 demo data from src/lib/v2/portfolioData.ts and constants inside PortfolioPage.",
                ]
            ),
            h2("New POC flow"),
            bullets(
                [
                    "User opens /poc from the top bar.",
                    "The page posts a file or demo brief to POST /api/poc/extract.",
                    "The extract route parses document text with src/lib/playbooks/parser.ts, then calls complete() from src/lib/ai.",
                    "The AI returns JSON for account fields, KYC sections, signals, and 1-5 KPI dimension scores.",
                    "The UI fills input boxes and textareas from that JSON.",
                    "User enters a correction, such as 'ARR should be $2.1M', and the page posts current JSON plus instruction to POST /api/poc/correct.",
                    "The correction route asks the AI to update only supported fields, then returns recalculated scoring.",
                ]
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("5. Data Model Summary"),
            table(
                [
                    ["Model", "Meaning", "Presentation language"],
                    ["User", "People using the app. Role controls what they can do.", "Associate/KAM/Executive role-based workflow."],
                    ["Account", "Customer account core record: name, industry, region, ARR, contract dates, health.", "The center of the platform."],
                    ["AccountContact", "Stakeholders at the customer account.", "Relationship map and contact coverage."],
                    ["KpiDimension", "Raw KPI measurements, such as engagement, financial, or resource metrics.", "Source inputs for scoring."],
                    ["KamScore", "Computed account health score with 8 KPI fields and AI narrative.", "Explainable account health snapshot."],
                    ["Signal", "Risk/opportunity alert such as churn risk, contract expiry, ticket spike.", "What needs attention."],
                    ["Action", "Human or AI-proposed next step.", "The operational follow-up."],
                    ["Document", "Uploaded document metadata and extracted text/signals/KYC effects.", "Contracts, SOWs, meeting notes, prior KYC."],
                    ["KycVersion", "Draft/submitted/approved KYC intelligence sections.", "Structured account knowledge."],
                    ["QbrSession/QbrItem", "QBR/DBR/EBR planning and generated content.", "Executive/account review support."],
                    ["Playbook/PlaybookRule", "Uploaded playbooks and extracted recommendation rules.", "Codified account management policy."],
                    ["Recommendation/Feedback", "Recommended actions and feedback loop outcomes.", "The learning loop."],
                    ["AppConfig", "Global score weights and notification preferences.", "Configurable governance."],
                ],
                [1.35 * inch, 2.5 * inch, 2.75 * inch],
            ),
            p(
                "Database provider is MySQL through Prisma. The schema expects DATABASE_URL at runtime. Seed data builds demo accounts, scores, signals, actions, KYC versions, playbooks, and recommendations.",
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("6. Permissions and Roles"),
            p(
                "Permissions are centralized in src/lib/permissions/policy.ts. API routes typically read the role from the x-role header using getRoleFromRequest(), then call guard(role, permission).",
            ),
            table(
                [
                    ["Role", "Core abilities"],
                    ["Associate", "View scoped accounts, upload documents, draft/update/submit KYC, create/update actions, log touchpoints."],
                    ["KAM", "Full portfolio view, create/update accounts, manage contacts, upload/delete documents, approve/reject KYC, create QBR, manage opportunities, approve score changes."],
                    ["Manager", "Alias of KAM plus manager-level compatibility permissions."],
                    ["Executive", "Read-only across portfolio, scores, documents, KYC, QBR, playbooks, and exports."],
                    ["Admin", "Full permissions across all resources."],
                ],
                [1.3 * inch, 5.2 * inch],
            ),
            h2("How to explain it"),
            p(
                "The app is designed around human approval. AI can propose information, signals, scores, and actions, but role-aware controls decide who can commit, approve, reject, dismiss, or export.",
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("7. AI Provider Architecture"),
            table(
                [
                    ["File", "What it does"],
                    ["src/lib/ai/index.ts", "Factory and complete() wrapper. Reads AI_PROVIDER, creates OpenAI/Claude/Gemini provider, logs calls."],
                    ["src/lib/ai/provider.interface.ts", "Shared LLMRequest, LLMResponse, and LLMProvider contracts."],
                    ["src/lib/ai/providers/openai.ts", "OpenAI chat completion implementation. Reads OPENAI_API_KEY and AI_MODEL/OPENAI_MODEL."],
                    ["src/lib/ai/providers/claude.ts", "Anthropic Claude provider. Reads ANTHROPIC_API_KEY."],
                    ["src/lib/ai/providers/gemini.ts", "Google Gemini provider. Reads GOOGLE_AI_API_KEY."],
                    ["src/lib/ai/logger.ts", "Persists or logs model calls for observability."],
                ],
                [2.35 * inch, 4.15 * inch],
            ),
            h2("Important environment variables"),
            bullets(
                [
                    "AI_PROVIDER: openai, claude, or gemini. Defaults to openai.",
                    "AI_MODEL: overrides provider default model. The repo defaults to gpt-5.4-mini in multiple places.",
                    "OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY: server-side provider keys.",
                    "DATABASE_URL: MySQL connection string for Prisma.",
                    "ADAPTER_MODE and per-adapter mode variables: choose mock or live integration behavior.",
                ]
            ),
            p(
                "The new POC routes use complete(), so they automatically reuse the same provider and runtime keys as the existing deployed app. No client-side key is used.",
                "Callout",
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("8. Scoring Engine"),
            p(
                "The existing production-style scoring route is POST /api/ai/score. It uses an internal 0-100 scale for each KPI, persists KamScore records, and then maps account health to HEALTHY, AT_RISK, or CRITICAL.",
            ),
            h2("Score computation flow"),
            bullets(
                [
                    "Load configurable weights from AppConfig, falling back to DEFAULT_WEIGHTS in src/lib/scoring/weights.ts.",
                    "Load account and KPI dimensions from Prisma.",
                    "Fetch Jira, Worksphere, and Finance adapter data in parallel.",
                    "calculateKpiSubscores() computes 8 KPI dimensions and driver breakdowns.",
                    "Questionnaire responses can blend into scores at 30% when available.",
                    "Approved score overrides replace specific dimensions.",
                    "Weighted score is calculated from the configured weights.",
                    "An AI narrative is generated through complete(), with a graceful fallback if the LLM fails.",
                    "KamScore is persisted, Account.health is updated, and trigger/orchestrator jobs run in the background.",
                ]
            ),
            h2("Lead framework alignment"),
            p(
                "The lead document uses a 1-5 score scale. The POC uses that directly. Existing app scoring still stores 0-100 dimension values, but the shared weights were aligned to the lead matrix.",
            ),
            table(
                [
                    ["KPI dimension", "Weight"],
                    ["Relationship Health", "20%"],
                    ["Contract Health", "15%"],
                    ["Customer Success (CSAT)", "15%"],
                    ["Risk Score", "15%"],
                    ["Resource Health", "10%"],
                    ["Project Health", "10%"],
                    ["Financial Health", "10%"],
                    ["Whitespace Analysis", "5%"],
                ],
                [3.5 * inch, 1.2 * inch],
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("9. Lead Scoring Framework Details"),
            h2("Overall 1-5 interpretation"),
            table(
                [
                    ["Score", "Status", "Meaning"],
                    ["5", "Excellent", "Very Healthy"],
                    ["4", "Good", "Healthy"],
                    ["3", "Moderate", "Requires Monitoring"],
                    ["2", "Weak", "Action Required"],
                    ["1", "Critical", "Immediate Intervention Required"],
                ],
                [1.0 * inch, 1.6 * inch, 3.7 * inch],
            ),
            h2("Portfolio bands"),
            table(
                [
                    ["Overall score", "Status", "Portfolio classification", "Recommended action"],
                    ["4.50 - 5.00", "Excellent", "Strategic Growth Account", "Focus on expansion and executive alignment"],
                    ["3.50 - 4.49", "Healthy", "Stable Account", "Maintain engagement and pursue opportunities"],
                    ["2.50 - 3.49", "Watchlist", "Attention Required", "Address weak scoring dimensions"],
                    ["1.50 - 2.49", "At Risk", "Retention Risk", "Execute corrective action plan"],
                    ["Below 1.50", "Critical", "Escalation Required", "Immediate executive intervention"],
                ],
                [1.25 * inch, 1.05 * inch, 2.05 * inch, 2.15 * inch],
            ),
            h2("Criteria by KPI"),
            table(
                [
                    ["KPI", "Criteria"],
                    ["Relationship Health", "Executive engagement; stakeholder coverage; relationship penetration; champion strength; engagement cadence."],
                    ["Contract Health", "Contract duration; notice period protection; renewability; price uplift protection; termination protection."],
                    ["Customer Success (CSAT)", "NPS score; customer confidence; delivery satisfaction; communication satisfaction; issue resolution."],
                    ["Resource Health", "Resource dependency risk; critical resource coverage; team stability; skill alignment; backup readiness."],
                    ["Risk Score", "Industry risk; competitive threat; vendor displacement risk; delivery risk; commercial risk."],
                    ["Project Health", "Delivery performance; backlog readiness; roadmap visibility; escalation status; client confidence."],
                    ["Financial Health", "Payment timeliness; outstanding exposure; client financial stability; revenue trend; contract vs billing alignment."],
                    ["Whitespace Analysis", "Service penetration; cross-sell potential; upsell potential; growth signals; expansion readiness."],
                ],
                [1.8 * inch, 4.7 * inch],
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("10. Document Upload, Parsing, and Extraction"),
            h2("Existing application routes"),
            bullets(
                [
                    "POST /api/documents/upload stores a file under public/uploads and creates a Document row. It requires accountId and document:create permission.",
                    "POST /api/documents/[id]/parse reads the stored file and extracts text. PDF uses pdfjs-dist, DOCX uses mammoth, TXT reads directly.",
                    "POST /api/ai/extract analyzes raw text with the AI provider, returns summary/key terms/obligations/signals/KYC suggestions, and persists extraction results on the Document row.",
                ]
            ),
            h2("POC extraction route"),
            bullets(
                [
                    "POST /api/poc/extract accepts multipart file upload or demo text.",
                    "It parses PDF, DOCX, TXT, Markdown, XLSX, and XLS through parsePlaybookFile().",
                    "It prompts the AI with the lead 1-5 framework and asks for a strict JSON object.",
                    "It normalizes the result into a stable shape for the /poc UI.",
                    "If the AI call fails, it returns a local fallback result so local demos are not blank.",
                ]
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("11. KYC Drafting"),
            p(
                "The main KYC endpoint POST /api/ai/kyc delegates to runKycDraftAgent() in src/lib/ai/agents/kycDraft.ts. That agent builds a source-rich context from the account, contacts, KPIs, latest score, active signals, documents, touchpoints, Salesforce mock data, and public intelligence.",
            ),
            h2("KYC stored fields"),
            bullets(
                [
                    "executiveSummary: summary of company, relationship state, risk, opportunity, and action.",
                    "businessModel: industry overview, company history, and business model.",
                    "keyStakeholders: stakeholder map and contact gaps.",
                    "strategicGoals: account history and goals.",
                    "riskFactors: delivery, relationship, commercial, and data confidence risks.",
                    "expansionOpportunity: whitespace, upsell, and Tkxel team opportunity context.",
                    "csatHistory: engagement history, CSAT/client feedback, projects, and relationship health.",
                    "competitiveLandscape: competitors, displacement risk, and unknowns.",
                    "financialOverview: ARR, contract, funding/revenue context, dependency, and renewal outlook.",
                ]
            ),
            p(
                "The POC mirrors these same KYC fields, but keeps them stateless and editable on the /poc screen so the presenter can show direct extraction and correction.",
                "Callout",
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("12. Agents, Playbooks, and Recommendations"),
            table(
                [
                    ["Area", "Files", "Purpose"],
                    ["Playbook parsing", "src/lib/playbooks/parser.ts", "Extract chunks from PDF/DOCX/TXT/MD/XLSX for rule extraction and source references."],
                    ["Playbook extraction", "src/lib/ai/agents/playbookExtractor.ts", "Turn uploaded playbook content into rules with category, condition, recommendation, priority, and source metadata."],
                    ["Source checker", "src/lib/ai/agents/sourceChecker.ts", "Validate extracted rule categories and source alignment."],
                    ["Recommendation orchestrator", "src/lib/ai/agents/recommendationOrchestrator.ts", "Match weak scores/signals to playbook rules; fall back to AI if no rule matches."],
                    ["Feedback capture", "src/lib/ai/agents/feedbackCapture.ts", "Capture why recommendations were actioned or dismissed."],
                    ["Fallback crystallizer", "src/lib/ai/agents/fallbackCrystallizer.ts", "Find repeated successful AI fallback patterns and propose reusable playbook rules."],
                    ["Rule quality scorer", "src/lib/ai/agents/ruleQualityScorer.ts", "Analyze rule performance after enough feedback signals exist."],
                    ["Master orchestrator", "src/lib/ai/agents/masterOrchestrator.ts", "Coordinates background activity after score or signal events."],
                ],
                [1.55 * inch, 2.25 * inch, 2.7 * inch],
            ),
            p(
                "This gives you a strong presentation point: the system is not just one LLM prompt. It is a workflow where deterministic rules, source-backed playbooks, human feedback, and AI fallback all work together.",
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("13. Integration Adapters"),
            p(
                "Adapters isolate external systems from app logic. Each adapter supports mock/live modes, so the demo can work without real integrations while the contract stays ready for production connectors.",
            ),
            table(
                [
                    ["Adapter", "Folder", "Signals it contributes"],
                    ["Salesforce", "src/lib/adapters/salesforce", "Opportunities, account commercial context, CRM-like information."],
                    ["Jira", "src/lib/adapters/jira", "Open tickets, critical tickets, resolution days, sprint velocity."],
                    ["Worksphere", "src/lib/adapters/worksphere", "Meetings, sentiment, usage/utilization, resource-like context."],
                    ["Finance", "src/lib/adapters/finance", "Invoices, overdue amount, MRR, revenue utilization, revenue history."],
                ],
                [1.25 * inch, 2.25 * inch, 3.0 * inch],
            ),
            h2("How to describe this"),
            p(
                "The score route does not need to know whether data came from a mock or live provider. It calls getJiraAdapter().fetch(accountId), getWorksphereAdapter().fetch(accountId), and getFinanceAdapter().fetch(accountId), then computes the same scoring output.",
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("14. POC Implementation Added"),
            table(
                [
                    ["File", "What was added"],
                    ["src/lib/poc/scoringFramework.ts", "Lead framework constants, KPI definitions, 1-5 score helpers, status bands, and result types."],
                    ["src/lib/poc/result.ts", "Normalizes AI output into a stable POC shape and provides local fallback extraction."],
                    ["src/app/api/poc/extract/route.ts", "Stateless upload/text extraction route that parses files and calls the existing AI provider wrapper."],
                    ["src/app/api/poc/correct/route.ts", "Stateless correction route that updates current extracted JSON using a user instruction."],
                    ["src/app/poc/page.tsx", "Interactive POC screen with upload, demo brief, account extraction, KYC, scoring, signals, and correction panel."],
                    ["src/components/layout/RoleBar.tsx", "Adds Portfolio and POC navigation links in the shared top bar."],
                    ["src/lib/scoring/weights.ts and src/lib/scoring/kpi.ts", "Shared score weights aligned to the lead framework."],
                    ["src/components/portfolio/PortfolioPage.tsx", "Visible mock KPI weights aligned to the lead framework."],
                ],
                [2.35 * inch, 4.15 * inch],
            ),
            h2("POC demo script"),
            bullets(
                [
                    "Open the app and click POC in the top bar.",
                    "Click Demo or upload a PDF/DOCX/TXT/XLSX account document.",
                    "Show account fields filled automatically.",
                    "Switch to KYC and show the 9 KYC sections generated from the source.",
                    "Switch to Scoring and show 1-5 dimension scores, weights, evidence, risk, and action.",
                    "Type a correction such as 'ARR should be $2.1M and renewal date is 2026-10-15'.",
                    "Show the fields update and scoring remain explainable.",
                ]
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("15. Likely Presentation Questions"),
            table(
                [
                    ["Question", "Answer"],
                    ["Where are AI models used?", "Through src/lib/ai/complete(). Existing uses include scoring narrative, KYC draft agent, document extraction, QBR generation, onboarding assistant, pulse insights, and recommendations. The POC uses the same wrapper in /api/poc/extract and /api/poc/correct."],
                    ["Are API keys exposed?", "No. Provider keys are read in server-side provider classes from environment variables. Client components call server API routes."],
                    ["Is scoring purely AI?", "No. Existing scoring is deterministic with adapter/KPI data, questionnaire blending, overrides, and configurable weights. AI adds narrative and agent recommendations. The POC uses AI for document extraction but still calculates overall score deterministically from returned 1-5 dimension scores and weights."],
                    ["What happens if AI returns bad JSON?", "The POC normalizer extracts and validates fields. If the AI call fails locally, a fallback result keeps the demo usable."],
                    ["How does human review fit?", "The main app has role-aware accept/deny/approve flows. The POC shows correction as the simplest human-in-the-loop interaction."],
                    ["What is the DB?", "Prisma with MySQL. DATABASE_URL is required for full deployed app routes."],
                    ["What is mock vs live?", "Adapters can run in mock or live mode. Mock lets demos work without external Salesforce/Jira/Worksphere/Finance integrations."],
                    ["What is the proof of concept proving?", "That the system can ingest a source document, extract structured account intelligence, populate KYC and account fields, score the account with the lead framework, and accept natural-language corrections."],
                ],
                [1.75 * inch, 4.75 * inch],
            ),
        ]
    )

    story.append(PageBreak())
    story.extend(
        [
            h1("16. Deployment Notes"),
            bullets(
                [
                    "This clone currently did not include node_modules or a local .env file.",
                    "The POC uses existing runtime AI env vars: AI_PROVIDER, AI_MODEL, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY.",
                    "For the full app, DATABASE_URL is needed because many existing routes use Prisma.",
                    "For a Vercel-style deployment, make sure environment variables exist in the project settings before building.",
                    "If deployment is GitHub-connected, pushing the branch with the /poc route should trigger deployment based on the existing deployment pipeline.",
                    "Do not commit API keys. Keep them in deployment/runtime environment variables only.",
                ]
            ),
            h2("Recommended local verification commands"),
            bullets(
                [
                    "npm install",
                    "npx prisma generate",
                    "npx tsc --noEmit",
                    "npm run build",
                    "npm run dev",
                ]
            ),
            h2("Final presentation close"),
            p(
                "The platform already contains a broad KAM workflow. The new POC lets you demonstrate the AI value directly: upload a source, extract intelligence, correct it conversationally, and show explainable scoring aligned to the lead's 1-5 account health framework.",
                "Callout",
            ),
        ]
    )

    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=LETTER,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.7 * inch,
        title="KAM Intelligence Platform Code Study Guide",
        author="Codex",
    )
    doc.build(build_story(), onFirstPage=page_number, onLaterPages=page_number)
    print(OUTPUT)


if __name__ == "__main__":
    main()
