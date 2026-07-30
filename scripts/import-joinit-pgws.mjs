import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

const PGWS_MEMBERSHIP_TYPES = new Set([
  "EFF + Pretty Girls Who Serve Membership",
  "Pretty Girls Who Serve National Membership Fee",
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
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
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim()));
}

function normalizedHeader(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function requireEnvironment(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function loadRecords(csvText) {
  const parsed = parseCsv(csvText);
  if (parsed.length < 2) throw new Error("The Join It export has no data rows.");
  const headers = parsed[0].map(normalizedHeader);
  const batchId = randomUUID();
  const records = parsed.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
  ).filter((row) => PGWS_MEMBERSHIP_TYPES.has(String(row.membership_type || "").trim()))
    .map((row) => {
      const email = String(row.email || "").trim().toLowerCase();
      const firstName = String(row.first_name || "").trim();
      const lastName = String(row.last_name || "").trim();
      if (!firstName || !lastName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new Error("A PGWS legacy row is missing a valid name or email.");
      }
      return {
        import_batch_id: batchId,
        source_system: "Join It",
        source_member_id: String(row.id || row.external_id || "").trim() || null,
        first_name: firstName.slice(0, 120),
        last_name: lastName.slice(0, 120),
        email,
        paid_status: "paid",
        membership_type: String(row.membership_type).trim(),
        joined_at: parseDate(row.joined_date),
        expiration_at: parseDate(row.expiration_date),
        chapter_name: null,
        raw_record: row,
        validation_status: "valid",
      };
    });
  const uniqueEmails = new Set(records.map((record) => record.email));
  if (uniqueEmails.size !== records.length) {
    throw new Error("Duplicate PGWS emails were found. Resolve them before importing.");
  }
  return records;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase import failed (${response.status}): ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error("Usage: node scripts/import-joinit-pgws.mjs <csv-path>");
  const supabaseUrl = requireEnvironment("PGWS_SUPABASE_URL").replace(/\/+$/, "");
  const serviceRole = requireEnvironment("PGWS_SUPABASE_SERVICE_ROLE_KEY");
  const records = loadRecords(await fs.readFile(csvPath, "utf8"));
  const headers = {
    apikey: serviceRole,
    authorization: `Bearer ${serviceRole}`,
    "content-type": "application/json",
  };
  const existing = await request(
    `${supabaseUrl}/rest/v1/pgws_legacy_members?select=email_key,source_member_id&source_system=eq.Join%20It`,
    { headers },
  );
  const existingKeys = new Set((existing || []).map((record) =>
    `${String(record.email_key || "").toLowerCase()}|${record.source_member_id || ""}`,
  ));
  const pending = records.filter((record) =>
    !existingKeys.has(`${record.email}|${record.source_member_id || ""}`),
  );
  for (let offset = 0; offset < pending.length; offset += 100) {
    await request(`${supabaseUrl}/rest/v1/pgws_legacy_members`, {
      method: "POST",
      headers: { ...headers, prefer: "return=minimal" },
      body: JSON.stringify(pending.slice(offset, offset + 100)),
    });
  }
  console.log(JSON.stringify({
    eligiblePgwsRows: records.length,
    alreadyImported: records.length - pending.length,
    imported: pending.length,
  }));
}

await main();
