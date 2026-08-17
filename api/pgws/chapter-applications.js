import { randomBytes } from "node:crypto";
import {
  cleanText,
  json,
  methodNotAllowed,
  publicOrigin,
  readJson,
} from "../_lib/http.js";
import { dbInsert, dbPatch, dbSelect, recordAudit } from "../_lib/pgws.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+()\d\s.-]{7,30}$/;
const states = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
]);

function reference() {
  return `PGWS-CH-${new Date().getUTCFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
}

async function sendReceipt({ email, name, applicationReference, appUrl }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "skipped" };
  const firstName = name.trim().split(/\s+/)[0] || "Founder";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.PGWS_EMAIL_FROM ||
        "Pretty Girls Who Serve <pgws@estherfundsinc.org>",
      to: [email],
      reply_to: "chapters@estherfundsinc.org",
      subject: "We received your PGWS chapter application 💗",
      text: `Hi ${firstName},\n\nThank you for applying to start a Pretty Girls Who Serve chapter. We received your application and it is now in national review.\n\nReference: ${applicationReference}\n\nSubmitting an application is not permission to recruit publicly, collect money, open social-media accounts, use PGWS branding, or represent a chapter as approved. Qualified applicants will receive a separate invitation to interview. Only written approval from PGWS Nationals allows a founding team to begin the official launch pathway.\n\nReview the Chapter House: ${appUrl}/chapters\n\nStay close to your email, and please reply if your founder or co-founder contact information changes.\n\nWith love,\nPretty Girls Who Serve Nationals\nFaith · Purpose · Sisterhood · Service`,
      html: `<!doctype html><html><body style="margin:0;background:#fff7fa;font-family:Arial,sans-serif;color:#3d2430"><div style="max-width:640px;margin:auto;padding:32px 18px"><div style="padding:34px;border-radius:24px 24px 0 0;background:#26151e;color:white"><p style="margin:0;color:#f6b9d2;font-size:12px;letter-spacing:2px">PRETTY GIRLS WHO SERVE</p><h1 style="font-family:Georgia,serif;font-size:40px;line-height:1;margin:12px 0">We received your<br>chapter application.</h1></div><div style="padding:32px;border:1px solid #ead5df;border-top:0;background:white"><p>Hi ${escapeHtml(firstName)},</p><p>Thank you for applying to start a Pretty Girls Who Serve chapter. Your application is now in national review.</p><p style="padding:16px;background:#fff0f6"><b>Application reference:</b><br>${escapeHtml(applicationReference)}</p><p>Submitting an application is not permission to recruit publicly, collect money, open social-media accounts, use PGWS branding, or represent a chapter as approved. Qualified applicants will receive a separate invitation to interview. Only written approval from PGWS Nationals allows a founding team to begin the official launch pathway.</p><p><a href="${escapeHtml(appUrl)}/chapters" style="color:#b84b7d;font-weight:bold">Review the PGWS Chapter House →</a></p><p>Stay close to your email, and reply if your founder or co-founder contact information changes.</p><p>With love,<br><b>Pretty Girls Who Serve Nationals</b><br>Faith · Purpose · Sisterhood · Service</p></div></div></body></html>`,
    }),
  });
  if (!response.ok) return { status: "failed" };
  return { status: "sent" };
}

async function sendNationalNotification({ application, appUrl }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "skipped" };
  const nationalEmail =
    process.env.PGWS_CHAPTER_NOTIFICATION_EMAIL ||
    "nationals@estherfundsinc.org";
  const cofounder = application.cofounder_name
    ? `${application.cofounder_name}${application.cofounder_email ? ` (${application.cofounder_email})` : ""}`
    : "Not provided";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.PGWS_EMAIL_FROM ||
        "Pretty Girls Who Serve <pgws@estherfundsinc.org>",
      to: [nationalEmail],
      reply_to: application.founder_email,
      subject: `New PGWS chapter application — ${application.institution}`,
      text: `A new PGWS chapter application was submitted.\n\nReference: ${application.reference_number}\nFounder: ${application.founder_name}\nFounder email: ${application.founder_email}\nFounder phone: ${application.founder_phone}\nCo-founder: ${cofounder}\nChapter type: ${application.chapter_type}\nInstitution: ${application.institution}\nLocation: ${application.city}, ${application.state}\n\nReview the application: ${appUrl}/pgws-admin\n\nThis is an internal PGWS Nationals notification.`,
      html: `<!doctype html><html><body style="margin:0;background:#fff7fa;font-family:Arial,sans-serif;color:#3d2430"><div style="max-width:640px;margin:auto;padding:32px 18px"><div style="padding:30px;border-radius:24px 24px 0 0;background:#26151e;color:white"><p style="margin:0;color:#f6b9d2;font-size:12px;letter-spacing:2px">PGWS NATIONALS · NEW SUBMISSION</p><h1 style="font-family:Georgia,serif;font-size:36px;line-height:1.1;margin:12px 0">A chapter application is ready for review.</h1></div><div style="padding:30px;border:1px solid #ead5df;border-top:0;background:white"><p><b>Reference:</b> ${escapeHtml(application.reference_number)}</p><p><b>Founder:</b> ${escapeHtml(application.founder_name)}<br><b>Email:</b> ${escapeHtml(application.founder_email)}<br><b>Phone:</b> ${escapeHtml(application.founder_phone)}</p><p><b>Co-founder:</b> ${escapeHtml(cofounder)}</p><p><b>Chapter:</b> ${escapeHtml(application.chapter_type)}<br><b>Institution:</b> ${escapeHtml(application.institution)}<br><b>Location:</b> ${escapeHtml(application.city)}, ${escapeHtml(application.state)}</p><p style="margin-top:28px"><a href="${escapeHtml(appUrl)}/pgws-admin" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#b84b7d;color:white;text-decoration:none;font-weight:bold">Open the Nationals review desk →</a></p><p style="margin-top:24px;color:#725766;font-size:12px">Internal PGWS Nationals notification. Replying sends your message to the founder.</p></div></div></body></html>`,
    }),
  });
  if (!response.ok) return { status: "failed" };
  return { status: "sent" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const body = await readJson(req, 32_000);
    if (cleanText(body.website, 200))
      return json(res, 200, { reference: "PGWS-RECEIVED" });
    const founderName = cleanText(body.founderName, 120, true);
    const founderEmail = cleanText(body.founderEmail, 254, true).toLowerCase();
    const founderPhone = cleanText(body.founderPhone, 30, true);
    const cofounderName = cleanText(body.cofounderName, 120);
    const cofounderEmail = cleanText(body.cofounderEmail, 254).toLowerCase();
    const chapterType = cleanText(body.chapterType, 20, true);
    const state = cleanText(body.state, 2, true).toUpperCase();
    if (
      !emailPattern.test(founderEmail) ||
      (cofounderEmail && !emailPattern.test(cofounderEmail))
    )
      throw new Error("Enter a valid founder and co-founder email address.");
    if (!phonePattern.test(founderPhone))
      throw new Error("Enter a valid founder phone number.");
    if (
      !states.has(state) ||
      !["campus", "community", "virtual"].includes(chapterType)
    )
      throw new Error("Choose a valid chapter type and state.");
    if (body.acknowledgement !== true)
      throw new Error(
        "You must acknowledge the pre-approval rules before submitting.",
      );
    const existing = await dbSelect(
      "pgws_chapter_applications",
      `select=reference_number,created_at,status&founder_email_key=eq.${encodeURIComponent(founderEmail)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 7 * 86400000).toISOString())}&status=neq.withdrawn&order=created_at.desc&limit=1`,
    );
    if (existing?.[0])
      return json(res, 200, {
        reference: existing[0].reference_number,
        duplicate: true,
      });
    const rows = await dbInsert("pgws_chapter_applications", {
      reference_number: reference(),
      founder_name: founderName,
      founder_email: founderEmail,
      founder_phone: founderPhone,
      cofounder_name: cofounderName || null,
      cofounder_email: cofounderEmail || null,
      chapter_type: chapterType,
      institution: cleanText(body.institution, 180, true),
      city: cleanText(body.city, 100, true),
      state,
      why_pgws: cleanText(body.whyPgws, 2500, true),
      leadership_response: cleanText(body.leadership, 2500, true),
      ministry_response: cleanText(body.ministry, 2500, true),
      community_need: cleanText(body.communityNeed, 2500, true),
      experience: cleanText(body.experience, 2500, true),
      acknowledgement: true,
    });
    const application = rows?.[0];
    if (!application)
      throw new Error("The chapter application could not be saved.");
    await recordAudit({
      actorType: "public_applicant",
      action: "chapter_application.submitted",
      entityType: "pgws_chapter_application",
      entityId: application.id,
      requestId: String(req.headers["x-vercel-id"] || ""),
    });
    const receipt = await sendReceipt({
      email: founderEmail,
      name: founderName,
      applicationReference: application.reference_number,
      appUrl: publicOrigin(req),
    });
    if (receipt.status === "sent")
      await dbPatch(
        "pgws_chapter_applications",
        `id=eq.${application.id}`,
        { confirmation_sent_at: new Date().toISOString() },
        { returning: false },
      );
    const nationalNotification = await sendNationalNotification({
      application,
      appUrl: publicOrigin(req),
    });
    if (nationalNotification.status === "sent")
      await dbPatch(
        "pgws_chapter_applications",
        `id=eq.${application.id}`,
        { national_notification_sent_at: new Date().toISOString() },
        { returning: false },
      );
    return json(res, 201, {
      reference: application.reference_number,
      receipt: receipt.status,
      nationalNotification: nationalNotification.status,
    });
  } catch (error) {
    return json(res, Number(error.status) || 400, {
      error: error.message || "The application could not be submitted.",
    });
  }
}
