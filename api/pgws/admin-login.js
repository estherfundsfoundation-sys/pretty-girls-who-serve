import { cleanText, json, methodNotAllowed, publicOrigin, readJson } from "../_lib/http.js";
import { dbSelect, pgwsUrl, recordAudit } from "../_lib/pgws.js";

const ACTION = "pgws_admin_login_link_requested";
const COOLDOWN_MS = 60_000;

function adminEmails() {
  return String(process.env.PGWS_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function serviceHeaders() {
  const key = String(process.env.PGWS_SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) throw new Error("PGWS server access is not configured.");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function parse(response, fallback) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || body?.msg || fallback);
  return body;
}

async function recentlyRequested(email) {
  const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
  const rows = await dbSelect(
    "pgws_audit_log",
    `select=created_at&action=eq.${ACTION}&after_state->>email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1`,
  );
  return Boolean(rows?.length);
}

async function generateLink(email, redirectTo) {
  const response = await fetch(`${pgwsUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      type: "magiclink",
      email,
      data: { pgws_role: "national_admin" },
      redirect_to: redirectTo,
    }),
  });
  const body = await parse(response, "A secure administrator link could not be created.");
  const link = body?.properties?.action_link || body?.action_link;
  if (!link) throw new Error("The authentication service did not return a secure link.");
  return link;
}

async function sendLink(email, link) {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  const bridgeUrl = String(process.env.MISS_PGWS_MAIL_BRIDGE_URL || "").trim();
  const bridgeSecret = String(process.env.PGWS_MAIL_BRIDGE_SECRET || "").trim();
  const useBridge = Boolean(bridgeUrl && bridgeSecret);
  if (!key && !useBridge) throw new Error("PGWS email delivery is not configured.");
  const subject = "Your secure PGWS Nationals administration link";
  const text = `Use this private, one-time link to enter PGWS Nationals Administration:\n\n${link}\n\nIf you did not request it, ignore this email. Never share this link.`;
  const html = `<div style="max-width:620px;margin:auto;padding:32px;font-family:Arial,sans-serif;color:#21131a"><p style="color:#a13e68;font-weight:700;letter-spacing:1px">PRETTY GIRLS WHO SERVE</p><h1 style="font-family:Georgia,serif">PGWS Nationals Administration</h1><p>Your private, one-time administrator link is ready.</p><p><a href="${link}" style="display:inline-block;background:#21131a;color:#fff;padding:14px 20px;border-radius:10px;text-decoration:none;font-weight:700">Enter administration →</a></p><p style="font-size:13px;color:#715764">If you did not request this link, ignore this email. Never share the link.</p></div>`;
  const response = await fetch(useBridge ? bridgeUrl : "https://api.resend.com/emails", {
    method: "POST",
    headers: {
      ...(useBridge
        ? { "x-pgws-mail-bridge-secret": bridgeSecret }
        : { Authorization: `Bearer ${key}` }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      useBridge
        ? { recipient: email, subject, text, html }
        : {
            from: process.env.PGWS_EMAIL_FROM || "Pretty Girls Who Serve <pgws@estherfundsinc.org>",
            to: [email],
            reply_to: "nationals@estherfundsinc.org",
            subject,
            text,
            html,
          },
    ),
  });
  await parse(response, "The administrator email could not be sent.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const body = await readJson(req);
    const email = cleanText(body.email, 320).toLowerCase();
    if (!email || !adminEmails().includes(email)) {
      return json(res, 403, { error: "Use an authorized PGWS Nationals administrator email." });
    }
    if (await recentlyRequested(email)) {
      return json(res, 429, { error: "A secure link was already sent. Please wait one minute before requesting another." });
    }
    const link = await generateLink(email, `${publicOrigin(req)}/pgws-admin`);
    await sendLink(email, link);
    await recordAudit({ action: ACTION, entityType: "admin_auth", afterState: { email } });
    return json(res, 200, { message: "Secure link sent. Check your inbox and spam." });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || "The secure login email could not be sent." });
  }
}
