import { randomUUID } from "node:crypto";
import { cleanText, json, methodNotAllowed, readJson } from "../_lib/http.js";
import { dbInsert, dbSelect, recordAudit, requireAdmin } from "../_lib/pgws.js";

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

function pick(record, names) {
  for (const name of names) if (record[name]) return String(record[name]).trim();
  return "";
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const admin = await requireAdmin(req);
    const body = await readJson(req, 2_500_000);
    const csv = cleanText(body.csv, 2_400_000, true);
    const parsed = parseCsv(csv);
    if (parsed.length < 2) throw new Error("The membership export does not contain data rows.");
    if (parsed.length > 10_001) throw new Error("Import no more than 10,000 rows at a time.");
    const headers = parsed[0].map(normalizedHeader);
    const batchId = randomUUID();
    const records = [];
    const errors = [];
    const emailCounts = new Map();
    for (let index = 1; index < parsed.length; index += 1) {
      const values = parsed[index];
      const raw = Object.fromEntries(headers.map((header, position) => [header, values[position] || ""]));
      const firstName = pick(raw, ["first_name", "firstname", "given_name"]);
      const lastName = pick(raw, ["last_name", "lastname", "surname", "family_name"]);
      const email = pick(raw, ["email", "email_address", "member_email"]).toLowerCase();
      const sourceMemberId = pick(raw, ["member_id", "membership_id", "id"]);
      if (!firstName || !lastName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errors.push({ row: index + 1, message: "A valid first name, last name, and email are required." });
        continue;
      }
      emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
      records.push({
        import_batch_id: batchId,
        source_system: "Join It",
        source_member_id: sourceMemberId || null,
        first_name: firstName.slice(0, 120),
        last_name: lastName.slice(0, 120),
        email,
        paid_status: /complimentary|waived|free/i.test(pick(raw, ["payment_status", "status", "membership_status"]))
          ? "complimentary"
          : "paid",
        membership_type: pick(raw, ["membership_type", "membership", "plan"]) || null,
        joined_at: parseDate(pick(raw, ["joined_at", "joined_date", "join_date", "created_at", "start_date"])),
        expiration_at: parseDate(pick(raw, ["expiration_at", "expiration_date", "expires_at", "end_date"])),
        chapter_name: pick(raw, ["chapter", "chapter_name", "group"]) || null,
        raw_record: raw,
        validation_status: "valid",
      });
    }
    for (const record of records) {
      if ((emailCounts.get(record.email) || 0) > 1) {
        record.validation_status = "ambiguous";
        record.validation_notes = "More than one row in this import uses the same email.";
      }
    }
    const existing = records.length
      ? await dbSelect("pgws_legacy_members", `select=email_key,source_member_id&email_key=in.(${records.map((record) => `"${record.email.replaceAll('"', '\\"')}"`).join(",")})`)
      : [];
    const existingKeys = new Set((existing || []).map((item) => `${item.email_key}|${item.source_member_id || ""}`));
    for (const record of records) {
      if (existingKeys.has(`${record.email}|${record.source_member_id || ""}`)) {
        record.validation_status = "duplicate";
        record.validation_notes = "This legacy record was already imported.";
      }
    }
    const inserted = [];
    for (let offset = 0; offset < records.length; offset += 250) {
      const rows = records.slice(offset, offset + 250);
      if (rows.length) inserted.push(...await dbInsert("pgws_legacy_members", rows, { ignoreDuplicates: true }));
    }
    await recordAudit({
      actorUserId: admin.id,
      actorType: "admin",
      action: "legacy.imported",
      entityType: "pgws_legacy_import_batch",
      entityId: batchId,
      afterState: {
        submittedRows: parsed.length - 1,
        insertedRows: inserted.length,
        invalidRows: errors.length,
        ambiguousRows: records.filter((record) => record.validation_status === "ambiguous").length,
      },
    });
    return json(res, 200, {
      batchId,
      submittedRows: parsed.length - 1,
      insertedRows: inserted.length,
      invalidRows: errors.length,
      ambiguousRows: records.filter((record) => record.validation_status === "ambiguous").length,
      errors: errors.slice(0, 100),
    });
  } catch (error) {
    return json(res, Number(error.status || 400), { error: error.message || "The legacy membership import failed." });
  }
}

