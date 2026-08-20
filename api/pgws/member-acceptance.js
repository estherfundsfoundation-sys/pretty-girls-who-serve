import { cleanText, json, methodNotAllowed, publicOrigin, readJson } from "../_lib/http.js";
import { activateMembership } from "../_lib/membership.js";
import { dbInsert, pgwsUrl, recordAudit, requireAdmin } from "../_lib/pgws.js";

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

async function findOrCreateUser(profile, redirectTo) {
  const usersResponse = await fetch(`${pgwsUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: serviceHeaders(),
  });
  const usersBody = await parse(usersResponse, "PGWS accounts could not be verified.");
  let rawUser = (usersBody.users || []).find(
    (user) => String(user.email || "").trim().toLowerCase() === profile.email,
  );

  if (!rawUser) {
    const createResponse = await fetch(`${pgwsUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({
        type: "magiclink",
        email: profile.email,
        data: {
          display_name: profile.fullName,
          pgws_source: "national_member_acceptance",
          membership_classification: "lifetime",
        },
        redirect_to: redirectTo,
      }),
    });
    const created = await parse(createResponse, "The PGWS member account could not be created.");
    rawUser = created?.user || created?.properties?.user;
  }

  if (!rawUser?.id) throw new Error("The PGWS member account could not be verified.");
  const updateResponse = await fetch(`${pgwsUrl}/auth/v1/admin/users/${rawUser.id}`, {
    method: "PUT",
    headers: serviceHeaders(),
    body: JSON.stringify({
      user_metadata: {
        ...(rawUser.user_metadata || {}),
        display_name: profile.fullName,
        pgws_source: "national_member_acceptance",
        membership_classification: "lifetime",
      },
    }),
  });
  const updated = await parse(updateResponse, "The PGWS member profile could not be connected.");
  return {
    id: updated.id || rawUser.id,
    email: String(updated.email || rawUser.email || profile.email).trim().toLowerCase(),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const admin = await requireAdmin(req);
    const body = await readJson(req);
    const profile = {
      firstName: cleanText(body.firstName, 50, true),
      lastName: cleanText(body.lastName, 50, true),
      email: cleanText(body.email, 254, true).toLowerCase(),
      reason: cleanText(body.reason, 500) || "Complimentary lifetime membership granted by PGWS Nationals.",
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
      throw new Error("A valid member email address is required.");
    profile.fullName = `${profile.firstName} ${profile.lastName}`.trim();
    const appUrl = publicOrigin(req);
    const user = await findOrCreateUser(profile, `${appUrl}/p31?welcome=sister`);

    await dbInsert(
      "pgws_profiles",
      {
        id: user.id,
        display_name: profile.fullName,
        directory_visible: false,
        updated_at: new Date().toISOString(),
      },
      { upsert: true, onConflict: "id" },
    );

    const activation = await activateMembership({
      user,
      source: "complimentary",
      paymentStatus: "not_required",
      complimentaryReason: profile.reason,
      actorType: "admin",
      actorUserId: admin.id,
      requestId: `member-acceptance:${profile.email}:${Date.now()}`,
      appUrl,
    });
    await recordAudit({
      actorUserId: admin.id,
      actorType: "admin",
      action: "member.accepted_by_nationals",
      entityType: "pgws_membership",
      entityId: activation.membership.id,
      afterState: { email: profile.email, name: profile.fullName, classification: "lifetime" },
    });
    return json(res, 200, {
      accepted: true,
      fullName: profile.fullName,
      email: profile.email,
      classification: "lifetime",
      membershipId: activation.membership.membership_id,
      membershipStatus: activation.membership.status,
      complimentary: activation.membership.payment_status === "not_required",
      portalUrl: `${appUrl}/p31`,
    });
  } catch (error) {
    return json(res, Number(error.status || 400), {
      error: error.message || "The member acceptance could not be completed.",
    });
  }
}
