import {
  createMembershipNumber,
  createMyEffActivationToken,
  dbInsert,
  dbPatch,
  dbSelect,
  digest,
  getMembership,
  recordAudit,
} from "./pgws.js";
import { sendMembershipWelcome } from "./email.js";

async function uniqueMembershipNumber() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = createMembershipNumber();
    const rows = await dbSelect("pgws_memberships", `select=id&membership_id=eq.${candidate}&limit=1`);
    if (!rows?.length) return candidate;
  }
  throw new Error("A unique PGWS membership ID could not be generated.");
}

export async function ensureMyEffActivation({ user, membership, appUrl }) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const token = createMyEffActivationToken({
    v: 1,
    iss: "mypgws",
    sub: user.id,
    email: user.email,
    pgws_membership_id: membership.membership_id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  const existing = await dbSelect(
    "pgws_myeff_connections",
    `select=*&pgws_user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
  );
  const connection = {
    pgws_user_id: user.id,
    pgws_membership_id: membership.id,
    status: existing?.[0]?.status === "linked" ? "linked" : "activation_ready",
    activation_token_digest: digest(token),
    activation_expires_at: expiresAt.toISOString(),
    last_attempt_at: new Date().toISOString(),
    attempt_count: Number(existing?.[0]?.attempt_count || 0),
    updated_at: new Date().toISOString(),
  };
  const rows = await dbInsert("pgws_myeff_connections", connection, {
    upsert: true,
    onConflict: "pgws_user_id",
  });
  const base = process.env.MYEFF_PUBLIC_URL || "https://my.estherfundsfoundation.org";
  return {
    connection: rows?.[0] || connection,
    url: `${base.replace(/\/+$/, "")}/join?pgws_token=${encodeURIComponent(token)}`,
    token,
    appUrl,
  };
}

export async function activateMembership({
  user,
  source,
  paymentStatus,
  legacyMemberId = null,
  complimentaryReason = null,
  stripe = {},
  actorType = "system",
  actorUserId = null,
  requestId = null,
  appUrl,
}) {
  const now = new Date().toISOString();
  let membership = await getMembership(user.id);
  const before = membership;
  const updates = {
    plan_code: "lifetime-2026",
    status: "active",
    payment_status: paymentStatus,
    source,
    joined_at: membership?.joined_at || now,
    activated_at: membership?.activated_at || now,
    ended_at: null,
    access_review_required: false,
    stripe_customer_id: stripe.customerId || membership?.stripe_customer_id || null,
    stripe_checkout_session_id: stripe.checkoutSessionId || membership?.stripe_checkout_session_id || null,
    stripe_payment_intent_id: stripe.paymentIntentId || membership?.stripe_payment_intent_id || null,
    legacy_member_id: legacyMemberId || membership?.legacy_member_id || null,
    complimentary_reason: complimentaryReason || membership?.complimentary_reason || null,
    updated_at: now,
  };
  if (membership) {
    const rows = await dbPatch("pgws_memberships", `id=eq.${membership.id}`, updates);
    membership = rows?.[0];
  } else {
    const rows = await dbInsert("pgws_memberships", {
      user_id: user.id,
      membership_id: await uniqueMembershipNumber(),
      ...updates,
    });
    membership = rows?.[0];
  }
  await dbInsert("pgws_member_progress", {
    user_id: user.id,
    onboarding_status: "not_started",
    onboarding_steps: [],
    academy_progress: {},
  }, { upsert: true, onConflict: "user_id", returning: false });
  const myEff = await ensureMyEffActivation({ user, membership, appUrl });
  await recordAudit({
    actorUserId,
    actorType,
    action: "membership.activated",
    entityType: "pgws_membership",
    entityId: membership.id,
    beforeState: before,
    afterState: membership,
    requestId,
  });
  await sendMembershipWelcome({
    user,
    membership,
    myEffUrl: myEff.url,
    appUrl,
  }).catch(async (error) => {
    await recordAudit({
      actorType: "system",
      action: "membership.welcome_email_failed",
      entityType: "pgws_membership",
      entityId: membership.id,
      afterState: { message: error.message },
    });
  });
  return { membership, myEff };
}

