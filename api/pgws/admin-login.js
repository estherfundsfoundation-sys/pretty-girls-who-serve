import { createHash, randomInt, randomUUID } from "node:crypto";
import { cleanText, json, methodNotAllowed, readJson } from "../_lib/http.js";
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
  if (!response.ok) throw new Error(body?.message || body?.msg || body?.error || fallback);
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

async function ensureAuthUser(email) {
  const response = await fetch(`${pgwsUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      type: "magiclink",
      email,
      data: { pgws_role: "national_admin" },
      redirect_to: "https://prettygirlswhoserve.org/pgws-admin",
    }),
  });
  const body = await parse(response, "A secure administrator link could not be created.");
  const returnedUser = body?.user || body?.properties?.user;
  if (returnedUser?.id) return returnedUser;
  const usersResponse = await fetch(`${pgwsUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: serviceHeaders(),
  });
  const usersBody = await parse(usersResponse, "The administrator account could not be located.");
  const matched = usersBody?.users?.find(
    (item) => String(item.email || "").trim().toLowerCase() === email,
  );
  if (!matched?.id) throw new Error("The administrator account could not be located after enrollment.");
  return matched;
}

async function sendCode(email, code) {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  const bridgeUrl = String(process.env.MISS_PGWS_MAIL_BRIDGE_URL || "").trim();
  const bridgeSecret = String(process.env.PGWS_MAIL_BRIDGE_SECRET || "").trim();
  const useBridge = Boolean(bridgeUrl && bridgeSecret);
  if (!key && !useBridge) throw new Error("PGWS email delivery is not configured.");
  const subject = "Your PGWS Nationals verification code";
  const text = `Your one-time PGWS Nationals Administration code is ${code}. It expires in 10 minutes. Never share this code.`;
  const html = `<div style="max-width:620px;margin:auto;padding:32px;font-family:Arial,sans-serif;color:#21131a"><p style="color:#a13e68;font-weight:700;letter-spacing:1px">PRETTY GIRLS WHO SERVE</p><h1 style="font-family:Georgia,serif">PGWS Nationals Administration</h1><p>Enter this private, one-time code on the administrator sign-in screen:</p><p style="font-size:34px;font-weight:800;letter-spacing:8px">${code}</p><p style="font-size:13px;color:#715764">The code expires in 10 minutes. If you did not request it, ignore this email. Never share the code.</p></div>`;
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
    const user = await ensureAuthUser(email);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const requestId = randomUUID();
    const codeHash = createHash("sha256").update(`${requestId}:${email}:${code}`).digest("hex");
    await sendCode(email, code);
    await recordAudit({ action: ACTION, entityType: "admin_auth", entityId: requestId, afterState: { email, user_id: user.id, code_hash: codeHash, expires_at: new Date(Date.now() + 600_000).toISOString() } });
    return json(res, 200, { requestId, message: "Verification code sent. Check your inbox and spam." });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || "The secure login email could not be sent." });
  }
}
