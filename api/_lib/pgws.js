import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const defaultUrl = "https://tocnikeuyitavjsbrhkp.supabase.co";
const defaultPublishableKey = "sb_publishable_QoawcaIkCq0Hpmrmfo_e8g_SiSaX1Is";

function cleanEnvironmentValue(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim();
}

export const pgwsUrl = cleanEnvironmentValue(
  process.env.PGWS_SUPABASE_URL || defaultUrl,
).replace(/\/+$/, "");
export const pgwsPublishableKey = cleanEnvironmentValue(
  process.env.PGWS_SUPABASE_PUBLISHABLE_KEY || defaultPublishableKey,
);

function serviceKey() {
  const value = cleanEnvironmentValue(
    process.env.PGWS_SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!value) throw new Error("PGWS server access is not configured.");
  return value;
}

function serviceHeaders(extra = {}) {
  const key = serviceKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function parse(response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(body?.message || body?.msg || body?.hint || "The PGWS database request failed.");
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

export async function getAuthUser(req) {
  const authorization = String(req.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) {
    const error = new Error("Please sign in to continue.");
    error.status = 401;
    throw error;
  }
  const response = await fetch(`${pgwsUrl}/auth/v1/user`, {
    headers: { apikey: pgwsPublishableKey, Authorization: authorization },
  });
  const user = await parse(response);
  if (!user?.id || !user?.email) {
    const error = new Error("Your PGWS session could not be verified.");
    error.status = 401;
    throw error;
  }
  return { id: user.id, email: String(user.email).trim().toLowerCase(), raw: user };
}

export async function dbSelect(table, query = "", options = {}) {
  const response = await fetch(`${pgwsUrl}/rest/v1/${table}?${query}`, {
    headers: serviceHeaders({
      Accept: options.object ? "application/vnd.pgrst.object+json" : "application/json",
    }),
  });
  return parse(response);
}

export async function dbInsert(table, rows, options = {}) {
  const query = options.onConflict ? `?on_conflict=${encodeURIComponent(options.onConflict)}` : "";
  const prefer = [
    options.upsert ? "resolution=merge-duplicates" : null,
    options.ignoreDuplicates ? "resolution=ignore-duplicates" : null,
    options.returning === false ? "return=minimal" : "return=representation",
  ].filter(Boolean).join(",");
  const response = await fetch(`${pgwsUrl}/rest/v1/${table}${query}`, {
    method: "POST",
    headers: serviceHeaders({ Prefer: prefer }),
    body: JSON.stringify(rows),
  });
  return parse(response);
}

export async function dbPatch(table, query, updates, options = {}) {
  const response = await fetch(`${pgwsUrl}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: serviceHeaders({ Prefer: options.returning === false ? "return=minimal" : "return=representation" }),
    body: JSON.stringify(updates),
  });
  return parse(response);
}

export async function dbDelete(table, query) {
  const response = await fetch(`${pgwsUrl}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: serviceHeaders({ Prefer: "return=representation" }),
  });
  return parse(response);
}

export async function getMembership(userId) {
  const rows = await dbSelect(
    "pgws_memberships",
    `select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  return rows?.[0] || null;
}

export async function isAdmin(user) {
  const envEmails = String(process.env.PGWS_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (envEmails.includes(user.email)) return true;
  const rows = await dbSelect(
    "pgws_admin_roles",
    `select=role&user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&limit=1`,
  );
  return Boolean(rows?.length);
}

export async function requireAdmin(req) {
  const user = await getAuthUser(req);
  if (!(await isAdmin(user))) {
    const error = new Error("This PGWS administration area is restricted.");
    error.status = 403;
    throw error;
  }
  return user;
}

export function createMembershipNumber() {
  const year = new Date().getUTCFullYear();
  return `PGWS-${year}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function connectionSecret() {
  const value = process.env.PGWS_MYEFF_CONNECTION_SECRET;
  if (!value || value.length < 32) throw new Error("The MyEFF connection secret is not configured.");
  return value;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function createMyEffActivationToken(payload) {
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", connectionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyMyEffActivationToken(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) throw new Error("Invalid MyEFF activation token.");
  const expected = createHmac("sha256", connectionSecret()).update(body).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("Invalid MyEFF activation token.");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) {
    throw new Error("The MyEFF activation link has expired.");
  }
  return payload;
}

export async function recordAudit({ actorUserId = null, actorType = "system", action, entityType, entityId = null, beforeState = null, afterState = null, requestId = null }) {
  await dbInsert("pgws_audit_log", {
    actor_user_id: actorUserId,
    actor_type: actorType,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_state: beforeState,
    after_state: afterState,
    request_id: requestId,
  }, { returning: false }).catch(() => null);
}

