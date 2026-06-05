import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRoleFromRequest, ok, badRequest, serverError, guard } from "@/lib/api";

const VALID_SECTIONS = ["csat", "relationship", "risk", "contract", "whitespace"] as const;

// GET /api/questionnaire?accountId=
export async function GET(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "questionnaire:view");
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    if (!accountId) return badRequest("accountId is required");

    const responses = await prisma.questionnaireResponse.findMany({
      where: { accountId },
      orderBy: { updatedAt: "desc" },
    });

    // Group by section → by questionId for easy lookup
    const bySection: Record<string, Record<string, typeof responses[number]>> = {};
    for (const r of responses) {
      if (!bySection[r.section]) bySection[r.section] = {};
      bySection[r.section][r.questionId] = r;
    }

    return ok({ responses, bySection });
  } catch (err) {
    return serverError(err);
  }
}

// POST /api/questionnaire
// Body: { accountId, section, responses: [{questionId, response, inputType, ...}] }
export async function POST(req: NextRequest) {
  try {
    const role = getRoleFromRequest(req);
    const denied = guard(role, "questionnaire:create");
    if (denied) return denied;

    const body = await req.json();
    const { accountId, section, responses } = body as {
      accountId: string;
      section: string;
      responses: Array<{
        questionId:   string;
        response:     string;
        inputType:    string;
        prepopulated?: boolean;
        confidence?:  number;
        confirmedBy?: string;
      }>;
    };

    if (!accountId) return badRequest("accountId is required");
    if (!section || !VALID_SECTIONS.includes(section as typeof VALID_SECTIONS[number]))
      return badRequest(`section must be one of: ${VALID_SECTIONS.join(", ")}`);
    if (!Array.isArray(responses) || responses.length === 0)
      return badRequest("responses array is required");

    // Load existing responses for this section in one query
    const existing = await prisma.questionnaireResponse.findMany({
      where: { accountId, section },
    });
    const existingMap = new Map(existing.map((r) => [r.questionId, r]));

    const ops = responses.map((r) => {
      const ex = existingMap.get(r.questionId);
      if (ex) {
        return prisma.questionnaireResponse.update({
          where: { id: ex.id },
          data: {
            response:    r.response,
            prepopulated: r.prepopulated ?? false,
            confidence:  r.confidence  ?? null,
            confirmedBy: r.confirmedBy ?? null,
          },
        });
      }
      return prisma.questionnaireResponse.create({
        data: {
          accountId,
          section,
          questionId:   r.questionId,
          response:     r.response,
          inputType:    r.inputType,
          prepopulated: r.prepopulated ?? false,
          confidence:   r.confidence  ?? null,
          confirmedBy:  r.confirmedBy ?? null,
        },
      });
    });

    const saved = await Promise.all(ops);

    return ok({ saved: saved.length, section });
  } catch (err) {
    return serverError(err);
  }
}
