import { json, methodNotAllowed, publicOrigin } from "../_lib/http.js";
import {
  dbPatch,
  dbSelect,
  getAuthUser,
  getMembership,
} from "../_lib/pgws.js";
import { activateMembership } from "../_lib/membership.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const user = await getAuthUser(req);
    const current = await getMembership(user.id);
    if (current?.status === "active") return json(res, 200, { membership: current, alreadyActive: true });
    const records = await dbSelect(
      "pgws_legacy_members",
      `select=*&email_key=eq.${encodeURIComponent(user.email)}&paid_status=in.(paid,complimentary)&validation_status=in.(valid,pending)&claimed_by=is.null&order=joined_at.asc.nullslast&limit=2`,
    );
    if (!records?.length) {
      return json(res, 404, {
        error: "No paid legacy PGWS membership matched this verified email. Nationals can review a different email or missing Join It record.",
      });
    }
    if (records.length > 1) {
      return json(res, 409, {
        error: "More than one legacy record matched this email. Nationals must safely reconcile it before access is activated.",
      });
    }
    const legacy = records[0];
    const result = await activateMembership({
      user,
      source: "legacy_joinit",
      paymentStatus: "not_required",
      legacyMemberId: legacy.source_member_id || legacy.id,
      actorType: "migration",
      requestId: `legacy:${legacy.id}`,
      appUrl: publicOrigin(req),
    });
    await dbPatch("pgws_legacy_members", `id=eq.${legacy.id}`, {
      validation_status: "claimed",
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
    }, { returning: false });
    return json(res, 200, { membership: result.membership, myEffUrl: result.myEff.url });
  } catch (error) {
    return json(res, Number(error.status || 500), {
      error: Number(error.status || 500) >= 500
        ? "PGWS could not claim the legacy membership right now."
        : error.message,
    });
  }
}

