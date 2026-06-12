import { NextRequest } from "next/server";
import { badRequest, getUserIdFromRequest, ok, serverError } from "@/lib/api";
import { createAiRule, createAiRuleFromFeedback, listAiRules } from "@/lib/v2/aiRules";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    return ok(await listAiRules(userId));
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromRequest(req);
    const body = await req.json();
    const source = body.source === "dismissal" ? "dismissal" : "manual";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (source === "dismissal") {
      if (!reason) return badRequest("Dismissal reason is required");
      const rule = await createAiRuleFromFeedback({
        reason,
        userId,
        accountId: typeof body.accountId === "string" ? body.accountId : null,
        accountName: typeof body.accountName === "string" ? body.accountName : null,
        itemTitle: typeof body.itemTitle === "string" ? body.itemTitle : null,
        category: typeof body.category === "string" ? body.category : null,
      });
      return ok({ rule, created: Boolean(rule) });
    }

    if (!text) return badRequest("Rule text is required");
    const rule = await createAiRule({
      text,
      source,
      userId,
      accountId: typeof body.accountId === "string" ? body.accountId : null,
      category: typeof body.category === "string" ? body.category : null,
      reason: reason || null,
    });
    return ok({ rule, created: true });
  } catch (error) {
    return serverError(error);
  }
}
