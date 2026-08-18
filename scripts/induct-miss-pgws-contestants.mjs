import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const args = {
    send: false,
    expectedCount: null,
    limit: null,
    missEnv: "",
    pgwsEnv: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--send") args.send = true;
    else if (token === "--miss-env") args.missEnv = argv[++index] || "";
    else if (token === "--pgws-env") args.pgwsEnv = argv[++index] || "";
    else if (token === "--expected-count") args.expectedCount = Number(argv[++index]);
    else if (token === "--limit") args.limit = Number(argv[++index]);
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/induct-miss-pgws-contestants.mjs \\
    --miss-env <miss-pgws-production.env> \\
    --pgws-env <pgws-production.env> \\
    [--expected-count <number>] [--limit <number>] [--send]

The command is a read-only roster validation unless --send is supplied.
--send requires --expected-count and will stop unless the verified roster count matches.`;
}

export function parseEnv(text) {
  const output = {};
  for (const rawLine of String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const splitAt = normalized.indexOf("=");
    if (splitAt < 1) continue;
    const key = normalized.slice(0, splitAt).trim();
    let value = normalized.slice(splitAt + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value.replace(/\\n/g, "\n");
  }
  return output;
}

function required(env, key, label) {
  const value = String(env[key] || "").trim();
  if (!value) throw new Error(`${label} is missing ${key}.`);
  return value;
}

function serviceHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    throw new Error(body?.message || body?.msg || `Request failed (${response.status}).`);
  }
  return body;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function joinContestantRoster(contestants, profiles) {
  const profileByUserId = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
  const seenEmails = new Map();
  const errors = [];
  const roster = (contestants || []).map((contestant) => {
    const profile = profileByUserId.get(contestant.user_id);
    const email = String(profile?.email || "").trim().toLowerCase();
    const legalName = String(profile?.legal_name || "").trim();
    const preferredName = String(profile?.preferred_name || "").trim();
    const publicName = String(contestant.public_name || "").trim();
    const college = String(profile?.college || contestant.college || "").trim();
    const label = `Contestant ${contestant.contestant_number || contestant.id}`;
    if (!profile) errors.push(`${label} has no linked contestant profile.`);
    if (!validEmail(email)) errors.push(`${label} has a missing or invalid email address.`);
    if (!legalName && !preferredName && !publicName) errors.push(`${label} has no usable name.`);
    if (!college) errors.push(`${label} has no school or university.`);
    if (email && seenEmails.has(email)) {
      errors.push(`${label} shares an email address with ${seenEmails.get(email)}.`);
    } else if (email) {
      seenEmails.set(email, label);
    }
    return {
      contestantId: contestant.id,
      userId: contestant.user_id,
      contestantNumber: contestant.contestant_number,
      email,
      legalName,
      preferredName,
      publicName,
      college,
    };
  });
  return { roster, errors };
}

async function loadRoster(missEnv) {
  const url = required(missEnv, "NEXT_PUBLIC_SUPABASE_URL", "Miss PGWS environment").replace(/\/+$/, "");
  const key = required(missEnv, "SUPABASE_SECRET_KEY", "Miss PGWS environment");
  const headers = serviceHeaders(key);
  const contestants = await fetchJson(
    `${url}/rest/v1/pgws_contestants?public_profile_status=neq.archived&select=id,user_id,contestant_number,public_name,college,public_profile_status&order=contestant_number.asc&limit=1000`,
    { headers },
  );
  const profiles = await fetchJson(
    `${url}/rest/v1/pgws_profiles?select=user_id,legal_name,preferred_name,email,college&limit=1000`,
    { headers },
  );
  return joinContestantRoster(contestants, profiles);
}

async function generateSecureAccess({ pgwsUrl, serviceKey, contestant, redirectTo }) {
  const body = await fetchJson(`${pgwsUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: serviceHeaders(serviceKey),
    body: JSON.stringify({
      type: "magiclink",
      email: contestant.email,
      data: {
        display_name:
          contestant.preferredName || contestant.legalName || contestant.publicName,
        pgws_source: "miss_pgws_2027_surprise_sister",
        contestant_number: contestant.contestantNumber,
      },
      redirect_to: redirectTo,
    }),
  });
  const accessUrl = body?.properties?.action_link || body?.action_link;
  const user = body?.user || body?.properties?.user;
  if (!accessUrl || !user?.id) {
    throw new Error("PGWS auth did not return a secure account link and user.");
  }
  return {
    accessUrl,
    user: { id: user.id, email: String(user.email || contestant.email).trim().toLowerCase() },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.missEnv || !args.pgwsEnv) throw new Error(`${usage()}\n\nBoth environment files are required.`);
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error("--limit must be a positive whole number.");
  }
  if (args.expectedCount !== null && (!Number.isInteger(args.expectedCount) || args.expectedCount < 1)) {
    throw new Error("--expected-count must be a positive whole number.");
  }
  if (args.send && args.expectedCount === null) {
    throw new Error("--send requires --expected-count so the campaign cannot send to an unverified roster.");
  }

  const [missEnvText, pgwsEnvText] = await Promise.all([
    readFile(resolve(args.missEnv), "utf8"),
    readFile(resolve(args.pgwsEnv), "utf8"),
  ]);
  const missEnv = parseEnv(missEnvText);
  const pgwsEnv = parseEnv(pgwsEnvText);
  for (const [key, value] of Object.entries(pgwsEnv)) {
    if (value) process.env[key] = value;
  }

  const { roster, errors } = await loadRoster(missEnv);
  console.log(`Verified active contestant roster: ${roster.length}`);
  console.log(`Valid unique emails: ${new Set(roster.map((row) => row.email).filter(Boolean)).size}`);
  if (errors.length) {
    console.error(`Roster validation failed with ${errors.length} issue(s):`);
    errors.forEach((error) => console.error(`- ${error}`));
    throw new Error("No memberships or emails were created because the roster did not pass validation.");
  }
  if (args.expectedCount !== null && roster.length !== args.expectedCount) {
    throw new Error(`Expected ${args.expectedCount} contestants, but the verified roster contains ${roster.length}.`);
  }
  if (!args.send) {
    console.log("Dry run complete. No accounts, memberships, or emails were created.");
    return;
  }

  required(pgwsEnv, "RESEND_API_KEY", "PGWS environment");
  const pgwsUrl = required(pgwsEnv, "PGWS_SUPABASE_URL", "PGWS environment").replace(/\/+$/, "");
  const serviceKey = required(pgwsEnv, "PGWS_SUPABASE_SERVICE_ROLE_KEY", "PGWS environment");
  required(pgwsEnv, "PGWS_MYEFF_CONNECTION_SECRET", "PGWS environment");
  const appUrl = String(pgwsEnv.PUBLIC_APP_URL || "https://prettygirlswhoserve.org").replace(/\/+$/, "");
  const selectedRoster = args.limit ? roster.slice(0, args.limit) : roster;
  const [{ activateMembership }, { sendSurpriseSisterInduction }] = await Promise.all([
    import(pathToFileURL(resolve("api/_lib/membership.js")).href),
    import(pathToFileURL(resolve("api/_lib/email.js")).href),
  ]);
  const result = { processed: 0, memberships: 0, sent: 0, duplicate: 0, failed: 0 };

  for (const contestant of selectedRoster) {
    try {
      const auth = await generateSecureAccess({
        pgwsUrl,
        serviceKey,
        contestant,
        redirectTo: `${appUrl}/p31?welcome=sister`,
      });
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
      result.memberships += 1;
      const email = await sendSurpriseSisterInduction({
        user: auth.user,
        profile: contestant,
        membership: activation.membership,
        myEffUrl: activation.myEff.url,
        accessUrl: auth.accessUrl,
        appUrl,
      });
      if (email.status === "sent") result.sent += 1;
      else if (email.status === "duplicate") result.duplicate += 1;
      else throw new Error(email.reason || `Unexpected email status: ${email.status}`);
    } catch (error) {
      result.failed += 1;
      console.error(
        `Contestant ${contestant.contestantNumber || contestant.contestantId} failed: ${error.message}`,
      );
    } finally {
      result.processed += 1;
      if (result.processed % 10 === 0 || result.processed === selectedRoster.length) {
        console.log(`Progress ${result.processed}/${selectedRoster.length}`);
      }
    }
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.failed) {
    throw new Error(`${result.failed} contestant induction(s) failed. Rerun is safe and retries unsent email.`);
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || "")).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
