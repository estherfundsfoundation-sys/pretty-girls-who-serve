import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const args = { csv: "", endpoint: "", mode: "validate", expectedTotal: 142, limit: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--csv") args.csv = argv[++index] || "";
    else if (token === "--endpoint") args.endpoint = argv[++index] || "";
    else if (token === "--mode") args.mode = argv[++index] || "";
    else if (token === "--expected-total") args.expectedTotal = Number(argv[++index]);
    else if (token === "--limit") args.limit = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const value = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  const [headers = [], ...records] = rows;
  return records.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
}

export function rosterFromCsv(records) {
  const roster = records.map((row) => {
    const contestantNumber = Number(row["Contestant number"]);
    const exportedHeadshot = String(row["Headshot URL"] || "").trim();
    const archiveHeadshot = contestantNumber >= 1 && contestantNumber <= 140
      ? `https://misspgws.estherfundsfoundation.org/voting-contestants/${String(contestantNumber).padStart(3, "0")}.jpg`
      : "";
    return {
    contestantId: String(row["Contestant ID"] || "").trim(),
    contestantNumber,
    publicName: String(row["Public name"] || "").trim(),
    legalName: String(row["Legal name"] || "").trim(),
    preferredName: "",
    email: String(row.Email || "").trim().toLowerCase(),
    college: String(row.School || "").trim(),
    headshotUrl: exportedHeadshot || archiveHeadshot,
  };
  });
  const emails = new Set();
  for (const contestant of roster) {
    if (!contestant.contestantId || !Number.isInteger(contestant.contestantNumber))
      throw new Error("The roster contains a missing contestant ID or number.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contestant.email))
      throw new Error(`Contestant ${contestant.contestantNumber} has an invalid email.`);
    if (!contestant.publicName && !contestant.legalName)
      throw new Error(`Contestant ${contestant.contestantNumber} has no name.`);
    if (!contestant.college) throw new Error(`Contestant ${contestant.contestantNumber} has no school.`);
    if (emails.has(contestant.email)) throw new Error("The roster contains a duplicate email.");
    emails.add(contestant.email);
  }
  return roster;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.csv || !args.endpoint) throw new Error("--csv and --endpoint are required.");
  if (!['validate', 'send'].includes(args.mode)) throw new Error("--mode must be validate or send.");
  const secret = String(process.env.SURPRISE_SISTER_INDUCTION_SECRET || "");
  if (!secret) throw new Error("SURPRISE_SISTER_INDUCTION_SECRET is required.");
  const roster = rosterFromCsv(parseCsv(await readFile(args.csv, "utf8")));
  if (roster.length !== args.expectedTotal)
    throw new Error(`Expected ${args.expectedTotal} contestants, but the CSV contains ${roster.length}.`);
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > roster.length))
    throw new Error("--limit must be a positive whole number within the verified roster.");
  console.log(`Locally verified roster: ${roster.length} contestants / ${new Set(roster.map((row) => row.email)).size} unique emails`);
  const selectedRoster = args.limit ? roster.slice(0, args.limit) : roster;

  const summary = { processed: 0, sent: 0, duplicates: 0, failed: 0 };
  const failureMessages = new Map();
  for (let offset = 0; offset < selectedRoster.length; offset += 10) {
    const contestants = selectedRoster.slice(offset, offset + 10);
    const response = await fetch(args.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pgws-induction-secret": secret,
      },
      body: JSON.stringify({
        mode: args.mode,
        expectedTotal: args.expectedTotal,
        offset,
        contestants,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Batch ${offset / 10 + 1} was rejected.`);
    summary.processed += Number(body.processed || body.batchCount || 0);
    summary.sent += Number(body.sent || 0);
    summary.duplicates += Number(body.duplicates || 0);
    summary.failed += Number(body.failed || 0);
    for (const failure of (body.results || []).filter((item) => item.status === "failed")) {
      const error = String(failure.error || "Unknown batch failure");
      failureMessages.set(error, (failureMessages.get(error) || 0) + 1);
    }
    console.log(`${args.mode} batch ${offset / 10 + 1}: ${contestants.length} contestants`);
  }
  console.log(JSON.stringify(summary, null, 2));
  if (failureMessages.size) {
    console.error("Failure groups:");
    for (const [error, count] of failureMessages) console.error(`- ${count} × ${error}`);
  }
  if (summary.processed !== selectedRoster.length) throw new Error("Not every selected contestant was processed.");
  if (summary.failed) throw new Error(`${summary.failed} induction(s) failed. Rerun is idempotent.`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || "")).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
