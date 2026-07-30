import { json, methodNotAllowed } from "../_lib/http.js";
import {
  dbInsert,
  dbPatch,
  dbSelect,
  getAuthUser,
  getMembership,
  recordAudit,
} from "../_lib/pgws.js";

const APPROVED_PAYMENT_LINK = "https://buy.stripe.com/dRm9AU9RIfua3Fj05v7bW01";

function paymentLinkFor(intent, user) {
  const configured = process.env.STRIPE_PGWS_PAYMENT_LINK_URL || APPROVED_PAYMENT_LINK;
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.hostname !== "buy.stripe.com") {
    throw new Error("The approved PGWS Stripe Payment Link is not configured.");
  }
  url.searchParams.set("client_reference_id", intent.id);
  url.searchParams.set("prefilled_email", user.email);
  return url.toString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const user = await getAuthUser(req);
    const membership = await getMembership(user.id);
    if (membership?.status === "active" && ["paid", "not_required"].includes(membership.payment_status)) {
      return json(res, 409, {
        error: "Your PGWS lifetime membership is already active.",
        portalUrl: "/p31",
      });
    }

    const existing = await dbSelect(
      "pgws_checkout_intents",
      `select=*&user_id=eq.${encodeURIComponent(user.id)}&status=eq.checkout_open&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc&limit=1`,
    );
    if (existing?.[0]?.stripe_checkout_url) {
      return json(res, 200, { checkoutUrl: existing[0].stripe_checkout_url, reused: true });
    }

    const intentRows = await dbInsert("pgws_checkout_intents", {
      user_id: user.id,
      plan_code: "lifetime-2026",
      status: "created",
    });
    const intent = intentRows[0];
    const checkoutUrl = paymentLinkFor(intent, user);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await dbPatch("pgws_checkout_intents", `id=eq.${intent.id}`, {
      status: "checkout_open",
      stripe_checkout_url: checkoutUrl,
      expires_at: expiresAt.toISOString(),
    }, { returning: false });
    await recordAudit({
      actorUserId: user.id,
      actorType: "user",
      action: "checkout.created",
      entityType: "pgws_checkout_intent",
      entityId: intent.id,
      afterState: { paymentLink: APPROVED_PAYMENT_LINK, planCode: "lifetime-2026" },
      requestId: String(req.headers["x-vercel-id"] || ""),
    });
    return json(res, 200, { checkoutUrl, reused: false });
  } catch (error) {
    const status = Number(error.status || 500);
    return json(res, status, {
      error: status >= 500
        ? "PGWS could not open secure checkout. Please try again shortly."
        : error.message,
      setupRequired: String(error.message || "").includes("configured"),
    });
  }
}

