import { createHmac, timingSafeEqual } from "node:crypto";
import { json, methodNotAllowed, readRaw } from "../_lib/http.js";
import { dbPatch, dbSelect, recordAudit } from "../_lib/pgws.js";

function verifySignature(raw, supplied) {
  const secret = process.env.PGWS_MYEFF_CONNECTION_SECRET;
  if (!secret || secret.length < 32 || !supplied) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const actual = Buffer.from(String(supplied), "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const raw = await readRaw(req, 50_000);
  if (!verifySignature(raw, req.headers["x-pgws-callback-signature"])) {
    return json(res, 401, { error: "The MyEFF callback signature is invalid." });
  }
  try {
    const body = JSON.parse(raw.toString("utf8"));
    const pgwsUserId = String(body.pgws_user_id || "");
    const pgwsMembershipNumber = String(body.pgws_membership_id || "");
    const myEffUserId = String(body.myeff_user_id || "");
    const email = String(body.email || "").trim().toLowerCase();
    if (!pgwsUserId || !pgwsMembershipNumber || !myEffUserId || !email) {
      return json(res, 400, { error: "The MyEFF callback is incomplete." });
    }
    const memberships = await dbSelect(
      "pgws_memberships",
      `select=*&user_id=eq.${encodeURIComponent(pgwsUserId)}&membership_id=eq.${encodeURIComponent(pgwsMembershipNumber)}&status=eq.active&limit=1`,
    );
    const membership = memberships?.[0];
    if (!membership) return json(res, 404, { error: "The active PGWS membership was not found." });
    const connections = await dbSelect(
      "pgws_myeff_connections",
      `select=*&pgws_user_id=eq.${encodeURIComponent(pgwsUserId)}&pgws_membership_id=eq.${encodeURIComponent(membership.id)}&limit=1`,
    );
    const connection = connections?.[0];
    if (!connection) return json(res, 404, { error: "The PGWS MyEFF activation record was not found." });
    const rows = await dbPatch("pgws_myeff_connections", `id=eq.${connection.id}`, {
      status: "linked",
      myeff_user_id: myEffUserId,
      myeff_member_id: body.myeff_member_id || null,
      linked_at: body.linked_at || new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    });
    await recordAudit({
      actorType: "system",
      action: "myeff.connected",
      entityType: "pgws_myeff_connection",
      entityId: connection.id,
      beforeState: connection,
      afterState: rows?.[0] || { status: "linked", myeff_user_id: myEffUserId },
      requestId: `myeff:${myEffUserId}`,
    });
    return json(res, 200, { linked: true });
  } catch (error) {
    return json(res, 400, {
      error: error instanceof Error ? error.message : "The MyEFF callback could not be processed.",
    });
  }
}

export const config = { api: { bodyParser: false } };
