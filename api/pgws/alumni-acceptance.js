import { timingSafeEqual } from "node:crypto";

import { sendAlumniAcceptance } from "../_lib/email.js";
import { cleanText, json, methodNotAllowed, publicOrigin, readJson } from "../_lib/http.js";
import { activateMembership } from "../_lib/membership.js";
import { pgwsUrl } from "../_lib/pgws.js";

function secureMatch(left, right) {
  const first = Buffer.from(String(left || ""));
  const second = Buffer.from(String(right || ""));
  return first.length > 0 && first.length === second.length && timingSafeEqual(first, second);
}

function serviceHeaders() {
  const key = String(process.env.PGWS_SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) throw new Error("PGWS server access is not configured.");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function parse(response, fallback) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || body?.msg || fallback);
  return body;
}

async function generateSecureAccess(profile, redirectTo) {
  const response = await fetch(`${pgwsUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      type: "magiclink",
      email: profile.email,
      data: {
        display_name: profile.fullName,
        pgws_source: "national_alumni_acceptance",
        membership_classification: "alumni",
      },
      redirect_to: redirectTo,
    }),
  });
  const body = await parse(response, "Secure PGWS alumni access could not be created.");
  const accessUrl = body?.properties?.action_link || body?.action_link;
  if (!accessUrl) throw new Error("PGWS auth did not return a secure alumni access link.");
  return { accessUrl, rawUser: body?.user || body?.properties?.user || null };
}

async function findAuthUser(email) {
  const response = await fetch(`${pgwsUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: serviceHeaders(),
  });
  const body = await parse(response, "PGWS accounts could not be verified.");
  return (body.users || []).find(
    (user) => String(user.email || "").trim().toLowerCase() === email,
  );
}

async function connectAlumniProfile(profile, rawUser) {
  const response = await fetch(`${pgwsUrl}/auth/v1/admin/users/${rawUser.id}`, {
    method: "PUT",
    headers: serviceHeaders(),
    body: JSON.stringify({
      user_metadata: {
        ...(rawUser.user_metadata || {}),
        display_name: profile.fullName,
        pgws_source: "national_alumni_acceptance",
        membership_classification: "alumni",
      },
    }),
  });
  const updated = await parse(response, "The PGWS alumni profile could not be connected.");
  return {
    id: updated.id || rawUser.id,
    email: String(updated.email || rawUser.email || profile.email).trim().toLowerCase(),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    if (!secureMatch(req.headers["x-pgws-member-provision-secret"], process.env.PGWS_MEMBER_PROVISION_SECRET))
      return json(res, 401, { error: "Authorized membership provisioning is required." });
    const body = await readJson(req);
    const profile = {
      firstName: cleanText(body.firstName, 50, true),
      lastName: cleanText(body.lastName, 50, true),
      email: cleanText(body.email, 254, true).toLowerCase(),
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
      throw new Error("A valid alumni email address is required.");
    profile.fullName = `${profile.firstName} ${profile.lastName}`.trim();
    const appUrl = publicOrigin(req);
    const generated = await generateSecureAccess(profile, `${appUrl}/p31?welcome=sister`);
    const rawUser = generated.rawUser?.id ? generated.rawUser : await findAuthUser(profile.email);
    if (!rawUser?.id) throw new Error("The PGWS alumni account could not be verified.");
    const user = await connectAlumniProfile(profile, rawUser);
    const activation = await activateMembership({
      user,
      source: "complimentary",
      paymentStatus: "not_required",
      complimentaryReason: "Accepted by PGWS Nationals as a complimentary lifetime Alumni Member.",
      actorType: "admin",
      requestId: `alumni-acceptance:${profile.email}:${Date.now()}`,
      appUrl,
      sendWelcome: false,
    });
    const email = await sendAlumniAcceptance({
      user,
      profile,
      membership: activation.membership,
      myEffUrl: activation.myEff.url,
      accessUrl: generated.accessUrl,
      appUrl,
    });
    return json(res, 200, {
      accepted: true,
      fullName: profile.fullName,
      email: profile.email,
      classification: "alumni",
      membershipId: activation.membership.membership_id,
      membershipStatus: activation.membership.status,
      complimentary: activation.membership.payment_status === "not_required",
      emailStatus: email.status,
    });
  } catch (error) {
    return json(res, Number(error.status || 400), {
      error: error.message || "The alumni membership could not be accepted.",
    });
  }
}
