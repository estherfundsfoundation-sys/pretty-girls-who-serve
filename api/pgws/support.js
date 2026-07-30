import { cleanText, json, methodNotAllowed, readJson } from "../_lib/http.js";
import { dbInsert, getAuthUser, getMembership, recordAudit } from "../_lib/pgws.js";

const allowedCategories = new Set([
  "account", "membership", "payment", "chapter", "event", "service",
  "community", "faith", "academy", "myeff", "other",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const user = await getAuthUser(req);
    const membership = await getMembership(user.id);
    if (membership?.status !== "active") return json(res, 403, { error: "Active PGWS membership is required." });
    const body = await readJson(req);
    const category = cleanText(body.category, 40, true).toLowerCase();
    if (!allowedCategories.has(category)) throw new Error("Choose a valid support category.");
    const rows = await dbInsert("pgws_support_requests", {
      user_id: user.id,
      category,
      subject: cleanText(body.subject, 160, true),
      message: cleanText(body.message, 5000, true),
      priority: "normal",
      status: "open",
    });
    await recordAudit({
      actorUserId: user.id,
      actorType: "user",
      action: "support.created",
      entityType: "pgws_support_request",
      entityId: rows?.[0]?.id,
    });
    return json(res, 201, { request: rows?.[0] });
  } catch (error) {
    return json(res, Number(error.status || 400), { error: error.message || "Support request could not be sent." });
  }
}

