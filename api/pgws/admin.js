import Stripe from "stripe";
import {
  cleanText,
  json,
  methodNotAllowed,
  publicOrigin,
  readJson,
} from "../_lib/http.js";
import {
  dbInsert,
  dbPatch,
  dbSelect,
  pgwsUrl,
  recordAudit,
  requireAdmin,
} from "../_lib/pgws.js";
import {
  activateMembership,
  ensureMyEffActivation,
} from "../_lib/membership.js";
import { sendMembershipWelcome } from "../_lib/email.js";

function serviceHeaders() {
  const key = process.env.PGWS_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("PGWS server access is not configured.");
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character],
  );
}

async function sendChapterScreeningEmail(application) {
  const bridgeUrl = String(process.env.MISS_PGWS_MAIL_BRIDGE_URL || "").trim();
  const bridgeSecret = String(process.env.PGWS_MAIL_BRIDGE_SECRET || "").trim();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!(bridgeUrl && bridgeSecret) && !apiKey)
    throw new Error("PGWS email delivery is not configured.");
  const firstName = String(application.founder_name || "Founder")
    .trim()
    .split(/\s+/)[0];
  const subject = `Your PGWS chapter application is in screening — ${application.institution}`;
  const text = `Hi ${firstName},\n\nYour Pretty Girls Who Serve chapter application has moved into national screening.\n\nReference: ${application.reference_number}\nInstitution: ${application.institution}\n\nDuring screening, PGWS Nationals is reviewing your application for mission alignment, Christ-centered service, leadership readiness, and the needs of your campus or community. Screening is not final approval and does not guarantee an interview or charter.\n\nUntil you receive written approval from PGWS Nationals, please do not recruit publicly, collect money, open chapter social-media accounts, use PGWS branding, or represent the chapter as approved. Stay close to your email; we will contact you if we need additional information or invite you to the next step.\n\nWith love,\nPretty Girls Who Serve Nationals\nFaith · Purpose · Sisterhood · Service`;
  const html = `<div style="max-width:640px;margin:auto;padding:32px 18px;font-family:Arial,sans-serif;color:#3d2430"><div style="padding:34px;border-radius:24px 24px 0 0;background:#26151e;color:white"><p style="margin:0;color:#f6b9d2;font-size:12px;letter-spacing:2px">PRETTY GIRLS WHO SERVE NATIONALS</p><h1 style="font-family:Georgia,serif;font-size:40px;line-height:1.05;margin:12px 0">Your application is<br>in screening.</h1></div><div style="padding:32px;border:1px solid #ead5df;border-top:0;background:white"><p>Hi ${escapeHtml(firstName)},</p><p>Your Pretty Girls Who Serve chapter application has moved into <b>national screening</b>.</p><p style="padding:16px;background:#fff0f6"><b>Reference:</b> ${escapeHtml(application.reference_number)}<br><b>Institution:</b> ${escapeHtml(application.institution)}</p><p>During screening, PGWS Nationals is reviewing your application for mission alignment, Christ-centered service, leadership readiness, and the needs of your campus or community. Screening is not final approval and does not guarantee an interview or charter.</p><p>Until you receive written approval from PGWS Nationals, please do not recruit publicly, collect money, open chapter social-media accounts, use PGWS branding, or represent the chapter as approved.</p><p>Stay close to your email. We will contact you if we need additional information or invite you to the next step.</p><p>With love,<br><b>Pretty Girls Who Serve Nationals</b><br>Faith · Purpose · Sisterhood · Service</p></div></div>`;
  const recipients = [application.founder_email, application.cofounder_email]
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .filter((value, index, values) => value && values.indexOf(value) === index);
  for (const recipient of recipients) {
    const useBridge = Boolean(bridgeUrl && bridgeSecret);
    const response = await fetch(
      useBridge ? bridgeUrl : "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          ...(useBridge
            ? { "x-pgws-mail-bridge-secret": bridgeSecret }
            : { Authorization: `Bearer ${apiKey}` }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          useBridge
            ? { recipient, subject, text, html }
            : {
                from:
                  process.env.PGWS_EMAIL_FROM ||
                  "Pretty Girls Who Serve <pgws@estherfundsinc.org>",
                to: [recipient],
                reply_to: "nationals@estherfundsinc.org",
                subject,
                text,
                html,
              },
        ),
      },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.message ||
          error.error ||
          `Screening email failed for ${recipient}.`,
      );
    }
  }
  return recipients.length;
}

async function findAuthUser({ userId, email }) {
  if (userId) {
    const response = await fetch(
      `${pgwsUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { headers: serviceHeaders() },
    );
    const user = await response.json();
    if (response.ok && user?.id)
      return { id: user.id, email: String(user.email || "").toLowerCase() };
  }
  if (email) {
    const response = await fetch(
      `${pgwsUrl}/auth/v1/admin/users?page=1&per_page=1000`,
      { headers: serviceHeaders() },
    );
    const body = await response.json();
    const user = body?.users?.find(
      (item) =>
        String(item.email || "")
          .trim()
          .toLowerCase() === email.trim().toLowerCase(),
    );
    if (user)
      return { id: user.id, email: String(user.email).trim().toLowerCase() };
  }
  throw new Error(
    "No PGWS account matched that member. Ask her to create or claim her PGWS account first.",
  );
}

async function summary() {
  const now = new Date().toISOString();
  const [
    members,
    payments,
    events,
    legacy,
    connections,
    service,
    support,
    chapters,
    chapterApplications,
    profiles,
  ] = await Promise.all([
    dbSelect("pgws_memberships", "select=*&order=created_at.desc&limit=500"),
    dbSelect(
      "pgws_payment_transactions",
      "select=*&order=created_at.desc&limit=300",
    ),
    dbSelect(
      "pgws_stripe_events",
      "select=event_id,event_type,livemode,processing_status,error_message,received_at,processed_at&order=received_at.desc&limit=150",
    ),
    dbSelect(
      "pgws_legacy_members",
      "select=id,import_batch_id,source_member_id,first_name,last_name,email,paid_status,membership_type,joined_at,chapter_name,validation_status,validation_notes,claimed_at&order=created_at.desc&limit=1000",
    ),
    dbSelect(
      "pgws_myeff_connections",
      "select=*&order=updated_at.desc&limit=500",
    ),
    dbSelect(
      "pgws_service_entries",
      "select=*&order=created_at.desc&limit=500",
    ),
    dbSelect(
      "pgws_support_requests",
      "select=*&order=created_at.desc&limit=500",
    ),
    dbSelect("pgws_chapters", "select=*&order=name.asc&limit=200"),
    dbSelect(
      "pgws_chapter_applications",
      "select=*&order=created_at.desc&limit=500",
    ),
    dbSelect(
      "pgws_profiles",
      "select=id,display_name,city_state,chapter_name&limit=1000",
    ),
  ]);
  const usersResponse = await fetch(
    `${pgwsUrl}/auth/v1/admin/users?page=1&per_page=1000`,
    {
      headers: serviceHeaders(),
    },
  );
  const usersBody = await usersResponse.json().catch(() => ({}));
  const authUsers = usersResponse.ok ? usersBody.users || [] : [];
  const profilesById = new Map(profiles.map((item) => [item.id, item]));
  const usersById = new Map(authUsers.map((item) => [item.id, item]));
  const memberDirectory = members.map((item) => ({
    ...item,
    email: usersById.get(item.user_id)?.email || "",
    display_name: profilesById.get(item.user_id)?.display_name || "",
    city_state: profilesById.get(item.user_id)?.city_state || "",
    chapter_name: profilesById.get(item.user_id)?.chapter_name || "",
  }));
  return {
    metrics: {
      members: members.length,
      activeMembers: members.filter((item) => item.status === "active").length,
      paidMembers: members.filter((item) => item.payment_status === "paid")
        .length,
      legacyUnclaimed: legacy.filter(
        (item) => item.validation_status !== "claimed",
      ).length,
      myEffReady: connections.filter(
        (item) => item.status === "activation_ready",
      ).length,
      myEffLinked: connections.filter((item) => item.status === "linked")
        .length,
      paymentNeedsReview: members.filter((item) => item.access_review_required)
        .length,
      servicePending: service.filter((item) => item.status === "submitted")
        .length,
      supportOpen: support.filter(
        (item) => !["resolved", "closed"].includes(item.status),
      ).length,
      webhookFailures: events.filter((item) =>
        ["failed", "needs_review"].includes(item.processing_status),
      ).length,
      chapterApplicationsOpen: chapterApplications.filter(
        (item) => !["declined", "withdrawn", "converted"].includes(item.status),
      ).length,
      generatedAt: now,
    },
    members: memberDirectory,
    payments,
    stripeEvents: events,
    legacy,
    connections,
    service,
    support,
    chapters,
    chapterApplications,
  };
}

async function postAction(req, user, body) {
  const action = cleanText(body.action, 80, true);
  if (action === "grant_complimentary") {
    const target = await findAuthUser({
      userId: body.userId,
      email: cleanText(body.email, 254),
    });
    const reason = cleanText(body.reason, 500, true);
    const result = await activateMembership({
      user: target,
      source: "complimentary",
      paymentStatus: "not_required",
      complimentaryReason: reason,
      actorType: "admin",
      actorUserId: user.id,
      requestId: `admin:${Date.now()}`,
      appUrl: publicOrigin(req),
    });
    return {
      membership: result.membership,
      message: "Complimentary lifetime membership is active.",
    };
  }
  if (action === "set_membership_status") {
    const membershipId = cleanText(body.membershipId, 80, true);
    const status = cleanText(body.status, 40, true);
    if (!["active", "suspended", "revoked", "archived"].includes(status))
      throw new Error("Choose a valid membership status.");
    const before = (
      await dbSelect(
        "pgws_memberships",
        `select=*&id=eq.${encodeURIComponent(membershipId)}&limit=1`,
      )
    )?.[0];
    if (!before) throw new Error("Membership record was not found.");
    const rows = await dbPatch(
      "pgws_memberships",
      `id=eq.${encodeURIComponent(membershipId)}`,
      {
        status,
        suspended_at:
          status === "suspended"
            ? new Date().toISOString()
            : before.suspended_at,
        ended_at: ["revoked", "archived"].includes(status)
          ? new Date().toISOString()
          : null,
        notes: cleanText(body.notes, 1000) || before.notes,
      },
    );
    await recordAudit({
      actorUserId: user.id,
      actorType: "admin",
      action: `membership.${status}`,
      entityType: "pgws_membership",
      entityId: membershipId,
      beforeState: before,
      afterState: rows?.[0],
    });
    return { membership: rows?.[0], message: `Membership is now ${status}.` };
  }
  if (action === "review_service") {
    const entryId = cleanText(body.entryId, 80, true);
    const status = cleanText(body.status, 30, true);
    if (!["approved", "returned", "rejected"].includes(status))
      throw new Error("Choose a valid service-review decision.");
    const rows = await dbPatch(
      "pgws_service_entries",
      `id=eq.${encodeURIComponent(entryId)}`,
      {
        status,
        reviewer_id: user.id,
        reviewer_notes: cleanText(body.notes, 2000) || null,
        reviewed_at: new Date().toISOString(),
      },
    );
    await recordAudit({
      actorUserId: user.id,
      actorType: "admin",
      action: `service.${status}`,
      entityType: "pgws_service_entry",
      entityId: entryId,
      afterState: rows?.[0],
    });
    return { entry: rows?.[0], message: `Service entry is ${status}.` };
  }
  if (action === "resolve_support") {
    const requestId = cleanText(body.requestId, 80, true);
    const status = cleanText(body.status, 30, true);
    if (
      !["in_progress", "waiting_on_member", "resolved", "closed"].includes(
        status,
      )
    )
      throw new Error("Choose a valid support status.");
    const rows = await dbPatch(
      "pgws_support_requests",
      `id=eq.${encodeURIComponent(requestId)}`,
      {
        status,
        assigned_to: user.id,
        resolution_notes: cleanText(body.notes, 3000) || null,
        resolved_at: ["resolved", "closed"].includes(status)
          ? new Date().toISOString()
          : null,
      },
    );
    return {
      request: rows?.[0],
      message: `Support request is ${status.replaceAll("_", " ")}.`,
    };
  }
  if (action === "review_chapter_application") {
    const applicationId = cleanText(body.applicationId, 80, true);
    const status = cleanText(body.status, 30, true);
    const allowed = [
      "screening",
      "interview_invited",
      "interviewed",
      "second_interview",
      "accepted",
      "declined",
      "withdrawn",
    ];
    if (!allowed.includes(status))
      throw new Error("Choose a valid chapter-application decision.");
    const before = (
      await dbSelect(
        "pgws_chapter_applications",
        `select=*&id=eq.${encodeURIComponent(applicationId)}&limit=1`,
      )
    )?.[0];
    if (!before) throw new Error("Chapter application was not found.");
    const rows = await dbPatch(
      "pgws_chapter_applications",
      `id=eq.${encodeURIComponent(applicationId)}`,
      {
        status,
        assigned_to: user.id,
        reviewer_notes: cleanText(body.notes, 3000) || before.reviewer_notes,
        updated_at: new Date().toISOString(),
      },
    );
    await recordAudit({
      actorUserId: user.id,
      actorType: "admin",
      action: `chapter_application.${status}`,
      entityType: "pgws_chapter_application",
      entityId: applicationId,
      beforeState: before,
      afterState: rows?.[0],
    });
    let screeningEmailCount = 0;
    const priorScreeningEmails =
      status === "screening"
        ? await dbSelect(
            "pgws_audit_log",
            `select=id&action=eq.chapter_application.screening_email_sent&entity_id=eq.${encodeURIComponent(applicationId)}&limit=1`,
          )
        : [];
    if (status === "screening" && !priorScreeningEmails?.length) {
      screeningEmailCount = await sendChapterScreeningEmail(
        rows?.[0] || before,
      );
      await recordAudit({
        actorUserId: user.id,
        actorType: "admin",
        action: "chapter_application.screening_email_sent",
        entityType: "pgws_chapter_application",
        entityId: applicationId,
        afterState: { recipients: screeningEmailCount },
      });
    }
    return {
      application: rows?.[0],
      message: `Chapter application is now ${status.replaceAll("_", " ")}.${screeningEmailCount ? ` Screening email sent to ${screeningEmailCount} applicant contact${screeningEmailCount === 1 ? "" : "s"}.` : ""}`,
    };
  }
  if (action === "resend_welcome") {
    const target = await findAuthUser({
      userId: cleanText(body.userId, 80, true),
    });
    const memberships = await dbSelect(
      "pgws_memberships",
      `select=*&user_id=eq.${encodeURIComponent(target.id)}&limit=1`,
    );
    const membership = memberships?.[0];
    if (!membership || membership.status !== "active")
      throw new Error("An active membership was not found.");
    const myEff = await ensureMyEffActivation({
      user: target,
      membership,
      appUrl: publicOrigin(req),
    });
    await dbPatch(
      "pgws_email_deliveries",
      `membership_id=eq.${membership.id}&template_key=eq.pgws_membership_welcome_v1&recipient_email=eq.${encodeURIComponent(target.email)}`,
      {
        status: "suppressed",
      },
      { returning: false },
    ).catch(() => null);
    const result = await sendMembershipWelcome({
      user: target,
      membership,
      myEffUrl: myEff.url,
      appUrl: publicOrigin(req),
    });
    return { result, message: "The PGWS welcome email was requested again." };
  }
  if (action === "reconcile_stripe_session") {
    if (!process.env.STRIPE_SECRET_KEY)
      throw new Error("Stripe is not configured.");
    const sessionId = cleanText(body.sessionId, 180, true);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid")
      throw new Error("Stripe does not show this Checkout Session as paid.");
    if (
      session.mode !== "payment" ||
      session.payment_status !== "paid" ||
      Number(session.amount_total) !== 2000 ||
      String(session.currency || "").toLowerCase() !== "usd"
    )
      throw new Error(
        "The Stripe Session is not a paid one-time $20.00 USD PGWS membership.",
      );
    const expectedPaymentLinkId = process.env.STRIPE_PGWS_PAYMENT_LINK_ID;
    const actualPaymentLinkId =
      typeof session.payment_link === "string"
        ? session.payment_link
        : session.payment_link?.id;
    if (
      expectedPaymentLinkId &&
      actualPaymentLinkId !== expectedPaymentLinkId
    ) {
      throw new Error(
        "The Stripe Session did not originate from the approved PGWS Payment Link.",
      );
    }
    const intentId =
      session.metadata?.checkout_intent_id || session.client_reference_id;
    const intents = intentId
      ? await dbSelect(
          "pgws_checkout_intents",
          `select=*&id=eq.${encodeURIComponent(intentId)}&limit=1`,
        )
      : [];
    const intent = intents?.[0];
    if (!intent)
      throw new Error("No PGWS checkout intent matches this Stripe Session.");
    const target = await findAuthUser({ userId: intent.user_id });
    const result = await activateMembership({
      user: target,
      source: "administrative_reconciliation",
      paymentStatus: "paid",
      stripe: {
        customerId:
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id,
        checkoutSessionId: session.id,
        paymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id,
      },
      actorType: "admin",
      actorUserId: user.id,
      requestId: `reconcile:${session.id}`,
      appUrl: publicOrigin(req),
    });
    await dbPatch(
      "pgws_checkout_intents",
      `id=eq.${intent.id}`,
      {
        status: "completed",
        stripe_checkout_session_id: session.id,
        completed_at: new Date().toISOString(),
      },
      { returning: false },
    );
    return {
      membership: result.membership,
      message:
        "The verified Stripe payment was reconciled and access is active.",
    };
  }
  throw new Error("Unknown PGWS administration action.");
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method))
    return methodNotAllowed(res, ["GET", "POST"]);
  try {
    const user = await requireAdmin(req);
    if (req.method === "GET") return json(res, 200, await summary());
    const body = await readJson(req, 500_000);
    return json(res, 200, await postAction(req, user, body));
  } catch (error) {
    const status = Number(
      error.status ||
        (String(error.message || "").includes("restricted") ? 403 : 400),
    );
    return json(res, status, {
      error:
        error.message || "PGWS administration could not complete that request.",
    });
  }
}
