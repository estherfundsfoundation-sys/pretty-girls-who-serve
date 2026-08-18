import { timingSafeEqual } from "node:crypto";

import { json, methodNotAllowed, publicOrigin, readJson } from "../_lib/http.js";
import { sendSurpriseSisterInduction } from "../_lib/email.js";
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

async function generateSecureAccess(contestant, redirectTo) {
  const response = await fetch(`${pgwsUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      type: "magiclink",
      email: contestant.email,
      data: {
        display_name: contestant.preferredName || contestant.legalName || contestant.publicName,
        avatar_url: contestant.headshotUrl || undefined,
        pgws_source: "miss_pgws_2027_surprise_sister",
        contestant_number: contestant.contestantNumber,
      },
      redirect_to: redirectTo,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || "Secure PGWS access could not be created.");
  const accessUrl = body?.properties?.action_link || body?.action_link;
  const rawUser = body?.user || body?.properties?.user;
  if (!accessUrl) throw new Error("PGWS auth did not return a secure account link.");
  return { accessUrl, rawUser: rawUser?.id ? rawUser : null };
}

async function listAuthUsers() {
  const response = await fetch(`${pgwsUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: serviceHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || "PGWS accounts could not be verified.");
  return new Map((body.users || []).map((user) => [String(user.email || "").trim().toLowerCase(), user]));
}

async function connectContestantProfile(contestant, rawUser) {
  const userMetadata = {
    ...(rawUser.user_metadata || {}),
    display_name: contestant.preferredName || contestant.legalName || contestant.publicName,
    pgws_source: "miss_pgws_2027_surprise_sister",
    contestant_number: contestant.contestantNumber,
    ...(contestant.headshotUrl ? { avatar_url: contestant.headshotUrl, profile_photo_source: "miss_pgws_2027" } : {}),
  };
  const update = await fetch(`${pgwsUrl}/auth/v1/admin/users/${rawUser.id}`, {
    method: "PUT",
    headers: serviceHeaders(),
    body: JSON.stringify({ user_metadata: userMetadata }),
  });
  if (!update.ok) throw new Error("The contestant profile could not be connected to her PGWS account.");
  return {
    id: rawUser.id,
    email: String(rawUser.email || contestant.email).trim().toLowerCase(),
  };
}

function resolvedAuth(generated, contestant, userByEmail) {
  const rawUser = generated.rawUser || userByEmail.get(contestant.email);
  if (!rawUser?.id) throw new Error("The newly created PGWS account could not be verified.");
  return {
    accessUrl: generated.accessUrl,
    rawUser,
    user: {
      id: rawUser.id,
      email: String(rawUser.email || contestant.email).trim().toLowerCase(),
    },
  };
}

function validateBatch(body) {
  const expectedTotal = Number(body.expectedTotal);
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1)
    throw new Error("A verified expectedTotal is required.");
  if (expectedTotal !== 142)
    throw new Error("This induction is locked to the verified 142-contestant roster.");
  if (!Array.isArray(body.contestants) || !body.contestants.length || body.contestants.length > 10)
    throw new Error("Each batch must contain between 1 and 10 contestants.");
  const emails = new Set();
  return body.contestants.map((raw) => {
    const contestant = {
      contestantId: String(raw.contestantId || "").trim(),
      contestantNumber: Number(raw.contestantNumber),
      email: String(raw.email || "").trim().toLowerCase(),
      legalName: String(raw.legalName || "").trim(),
      preferredName: String(raw.preferredName || "").trim(),
      publicName: String(raw.publicName || "").trim(),
      college: String(raw.college || "").trim(),
      headshotUrl: String(raw.headshotUrl || "").trim(),
    };
    if (!contestant.contestantId || !Number.isInteger(contestant.contestantNumber))
      throw new Error("Every contestant must have a verified ID and contestant number.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contestant.email))
      throw new Error(`Contestant ${contestant.contestantNumber} has an invalid email.`);
    if (!contestant.legalName && !contestant.publicName)
      throw new Error(`Contestant ${contestant.contestantNumber} has no verified name.`);
    if (!contestant.college)
      throw new Error(`Contestant ${contestant.contestantNumber} has no verified school.`);
    if (contestant.headshotUrl && !/^https:\/\//i.test(contestant.headshotUrl))
      throw new Error(`Contestant ${contestant.contestantNumber} has an invalid headshot URL.`);
    if (emails.has(contestant.email)) throw new Error("A batch contains a duplicate email.");
    emails.add(contestant.email);
    return contestant;
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const configuredSecret = process.env.SURPRISE_SISTER_INDUCTION_SECRET;
    if (!configuredSecret || !secureMatch(req.headers["x-pgws-induction-secret"], configuredSecret))
      return json(res, 401, { error: "Authorized induction access is required." });
    const body = await readJson(req, 256_000);
    const contestants = validateBatch(body);
    if (body.mode === "validate")
      return json(res, 200, { valid: true, batchCount: contestants.length, expectedTotal: 142 });
    if (body.mode !== "send") throw new Error("Choose validate or send mode.");

    const appUrl = publicOrigin(req);
    const results = [];
    const generatedRows = [];
    for (const contestant of contestants) {
      try {
        const generated = await generateSecureAccess(contestant, `${appUrl}/p31?welcome=sister`);
        generatedRows.push({ contestant, generated });
      } catch (error) {
        results.push({
          contestantNumber: contestant.contestantNumber,
          status: "failed",
          error: String(error.message || "Induction failed.").slice(0, 300),
        });
      }
    }
    const needsLookup = generatedRows.some((item) => !item.generated.rawUser);
    const userByEmail = needsLookup ? await listAuthUsers() : new Map();
    for (const { contestant, generated } of generatedRows) {
      try {
        const auth = resolvedAuth(generated, contestant, userByEmail);
        auth.user = await connectContestantProfile(contestant, auth.rawUser);
        const activation = await activateMembership({
          user: auth.user,
          source: "complimentary",
          paymentStatus: "not_required",
          complimentaryReason: "Miss PGWS 2027 Surprise Sister lifetime induction",
          actorType: "system",
          requestId: `miss-pgws-2027-surprise-sister:${contestant.contestantId}`,
          appUrl,
          sendWelcome: false,
        });
        const email = await sendSurpriseSisterInduction({
          user: auth.user,
          profile: contestant,
          membership: activation.membership,
          myEffUrl: activation.myEff.url,
          accessUrl: auth.accessUrl,
          appUrl,
        });
        results.push({
          contestantNumber: contestant.contestantNumber,
          status: email.status,
          membershipActive: activation.membership.status === "active",
          complimentary: activation.membership.payment_status === "not_required",
        });
      } catch (error) {
        results.push({
          contestantNumber: contestant.contestantNumber,
          status: "failed",
          error: String(error.message || "Induction failed.").slice(0, 300),
        });
      }
    }
    return json(res, 200, {
      expectedTotal: 142,
      processed: results.length,
      sent: results.filter((item) => item.status === "sent").length,
      duplicates: results.filter((item) => item.status === "duplicate").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
    });
  } catch (error) {
    return json(res, 400, { error: error.message || "The induction batch was rejected." });
  }
}
