import { createHash, timingSafeEqual } from "node:crypto";
import { cleanText, json, methodNotAllowed, readJson } from "../_lib/http.js";
import { createAdminSessionCookie, dbSelect, recordAudit } from "../_lib/pgws.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const body = await readJson(req);
    const email = cleanText(body.email, 320).toLowerCase();
    const code = cleanText(body.code, 6);
    const requestId = cleanText(body.requestId, 80);
    if (!email || !/^\d{6}$/.test(code) || !requestId) return json(res, 400, { error: "Enter the six-digit code from your newest email." });
    const rows = await dbSelect("pgws_audit_log", `select=entity_id,after_state,created_at&action=eq.pgws_admin_login_link_requested&entity_id=eq.${encodeURIComponent(requestId)}&order=created_at.desc&limit=1`);
    const request = rows?.[0];
    const state = request?.after_state || {};
    if (!request || state.email !== email || !state.user_id || new Date(state.expires_at).getTime() < Date.now()) return json(res, 400, { error: "That code is invalid or expired. Request a new one." });
    const supplied = Buffer.from(createHash("sha256").update(`${requestId}:${email}:${code}`).digest("hex"));
    const expected = Buffer.from(String(state.code_hash || ""));
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(res, 400, { error: "That code is incorrect." });
    const consumed = await dbSelect("pgws_audit_log", `select=id&action=eq.pgws_admin_login_code_verified&entity_id=eq.${encodeURIComponent(requestId)}&limit=1`);
    if (!consumed?.length) {
      await recordAudit({ actorUserId: state.user_id, actorType: "admin", action: "pgws_admin_login_code_verified", entityType: "admin_auth", entityId: requestId, afterState: { email } });
    }
    res.setHeader("Set-Cookie", createAdminSessionCookie({ id: state.user_id, email }));
    return json(res, 200, { message: "Administrator access verified." });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || "The verification code could not be confirmed." });
  }
}
