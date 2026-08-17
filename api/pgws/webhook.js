import { createHash } from "node:crypto";
import Stripe from "stripe";
import { json, methodNotAllowed, publicOrigin, readRaw } from "../_lib/http.js";
import {
  dbInsert,
  dbPatch,
  dbSelect,
  recordAudit,
} from "../_lib/pgws.js";
import { activateMembership } from "../_lib/membership.js";

export const config = { api: { bodyParser: false } };

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function claimEvent(event, rawBody) {
  try {
    await dbInsert("pgws_stripe_events", {
      event_id: event.id,
      event_type: event.type,
      livemode: Boolean(event.livemode),
      object_id: event.data?.object?.id || null,
      processing_status: "received",
      payload_digest: createHash("sha256").update(rawBody).digest("hex"),
    }, { returning: false });
    return true;
  } catch (error) {
    if (error.status === 409) return false;
    throw error;
  }
}

async function userFromSession(session) {
  const expectedPaymentLinkId = process.env.STRIPE_PGWS_PAYMENT_LINK_ID;
  const actualPaymentLinkId = typeof session.payment_link === "string"
    ? session.payment_link
    : session.payment_link?.id || null;
  if (expectedPaymentLinkId && actualPaymentLinkId !== expectedPaymentLinkId) {
    throw new Error("This Stripe Session did not originate from the approved PGWS Payment Link.");
  }
  if (
    session.mode !== "payment"
    || Number(session.amount_total) !== 2000
    || String(session.currency || "").toLowerCase() !== "usd"
  ) {
    throw new Error("The Stripe Session does not match the approved one-time $20.00 USD PGWS membership.");
  }

  const intentId = session.metadata?.checkout_intent_id || session.client_reference_id;
  let rows = intentId
    ? await dbSelect(
      "pgws_checkout_intents",
      `select=*&id=eq.${encodeURIComponent(intentId)}&limit=1`,
    )
    : [];
  if (!rows?.length && session.id) {
    rows = await dbSelect(
      "pgws_checkout_intents",
      `select=*&stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}&limit=1`,
    );
  }
  const intent = rows?.[0];
  if (!intent || !["created", "checkout_open", "completed"].includes(intent.status)) {
    throw new Error("No matching PGWS checkout intent was found.");
  }
  if (intent.stripe_checkout_session_id && intent.stripe_checkout_session_id !== session.id) {
    throw new Error("This PGWS checkout intent is already bound to another Stripe Session.");
  }
  if (!intent.stripe_checkout_session_id) {
    await dbPatch("pgws_checkout_intents", `id=eq.${intent.id}`, {
      stripe_checkout_session_id: session.id,
    }, { returning: false });
  }

  const userId = intent.user_id;
  const authResponse = await fetch(
    `${process.env.PGWS_SUPABASE_URL || "https://tocnikeuyitavjsbrhkp.supabase.co"}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      headers: {
        apikey: process.env.PGWS_SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.PGWS_SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  const user = await authResponse.json();
  if (!authResponse.ok || !user?.email) throw new Error("The paid PGWS account could not be retrieved.");
  return {
    user: { id: user.id, email: String(user.email).trim().toLowerCase() },
    intent,
  };
}

async function completeCheckout(session, event, req) {
  if (session.payment_status !== "paid" && event.type !== "checkout.session.async_payment_succeeded") {
    await dbPatch("pgws_checkout_intents", `stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}`, {
      status: "checkout_open",
    }, { returning: false });
    return;
  }
  const { user, intent } = await userFromSession(session);
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;
  const result = await activateMembership({
    user,
    source: "stripe",
    paymentStatus: "paid",
    stripe: {
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
      checkoutSessionId: session.id,
      paymentIntentId,
    },
    actorType: "stripe",
    requestId: event.id,
    appUrl: publicOrigin(req),
  });
  await dbPatch("pgws_checkout_intents", `id=eq.${intent.id}`, {
    status: "completed",
    completed_at: new Date().toISOString(),
  }, { returning: false });
  await dbInsert("pgws_payment_transactions", {
    membership_id: result.membership.id,
    user_id: user.id,
    transaction_type: "payment",
    status: "paid",
    amount_cents: Number(session.amount_total || 2000),
    currency: String(session.currency || "usd"),
    stripe_customer_id: result.membership.stripe_customer_id,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    paid_at: new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  }, { ignoreDuplicates: true, returning: false });
}

async function flagPaymentReview(object, reason, event) {
  const paymentIntentId = typeof object.payment_intent === "string"
    ? object.payment_intent
    : object.payment_intent?.id || null;
  if (!paymentIntentId) return;
  const memberships = await dbSelect(
    "pgws_memberships",
    `select=*&stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&limit=1`,
  );
  const membership = memberships?.[0];
  if (!membership) return;
  await dbPatch("pgws_memberships", `id=eq.${membership.id}`, {
    payment_status: reason,
    access_review_required: true,
    notes: `Stripe ${reason} event ${event.id} requires administrator review.`,
  }, { returning: false });
  await dbInsert("pgws_payment_transactions", {
    membership_id: membership.id,
    user_id: membership.user_id,
    transaction_type: reason === "refunded" ? "refund" : "dispute",
    status: object.status || reason,
    amount_cents: Number(object.amount_refunded || object.amount || 0),
    currency: object.currency || "usd",
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: object.id?.startsWith("ch_") ? object.id : null,
    stripe_refund_id: object.id?.startsWith("re_") ? object.id : null,
    stripe_dispute_id: object.id?.startsWith("dp_") ? object.id : null,
  }, { returning: false });
  await recordAudit({
    actorType: "stripe",
    action: `payment.${reason}`,
    entityType: "pgws_membership",
    entityId: membership.id,
    beforeState: membership,
    afterState: { access_review_required: true, payment_status: reason },
    requestId: event.id,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  let event;
  let rawBody;
  try {
    rawBody = await readRaw(req);
    const signature = req.headers["stripe-signature"];
    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
      return json(res, 400, { error: "Stripe webhook verification is not configured." });
    }
    event = stripeClient().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    if (!(await claimEvent(event, rawBody))) return json(res, 200, { received: true, duplicate: true });
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await completeCheckout(event.data.object, event, req);
        break;
      case "checkout.session.async_payment_failed":
        await dbPatch("pgws_checkout_intents", `stripe_checkout_session_id=eq.${encodeURIComponent(event.data.object.id)}`, { status: "failed" }, { returning: false });
        break;
      case "checkout.session.expired":
        await dbPatch("pgws_checkout_intents", `stripe_checkout_session_id=eq.${encodeURIComponent(event.data.object.id)}`, { status: "expired" }, { returning: false });
        break;
      case "charge.refunded":
        await flagPaymentReview(event.data.object, "refunded", event);
        break;
      case "charge.dispute.created":
      case "charge.dispute.updated": {
        const dispute = event.data.object;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        const charge = chargeId ? await stripeClient().charges.retrieve(chargeId) : null;
        await flagPaymentReview({
          ...dispute,
          payment_intent: charge?.payment_intent || null,
        }, "disputed", event);
        break;
      }
      default:
        await dbPatch("pgws_stripe_events", `event_id=eq.${encodeURIComponent(event.id)}`, {
          processing_status: "ignored",
          processed_at: new Date().toISOString(),
        }, { returning: false });
        return json(res, 200, { received: true, ignored: true });
    }
    await dbPatch("pgws_stripe_events", `event_id=eq.${encodeURIComponent(event.id)}`, {
      processing_status: "processed",
      processed_at: new Date().toISOString(),
    }, { returning: false });
    return json(res, 200, { received: true });
  } catch (error) {
    if (event?.id) {
      await dbPatch("pgws_stripe_events", `event_id=eq.${encodeURIComponent(event.id)}`, {
        processing_status: "failed",
        error_message: String(error.message || "Webhook processing failed").slice(0, 1000),
        processed_at: new Date().toISOString(),
      }, { returning: false }).catch(() => null);
    }
    return json(res, 400, { error: "Webhook could not be processed." });
  }
}

