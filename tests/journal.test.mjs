import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadStudies() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read("journal-data.js"), sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.PGWS_JOURNAL_STUDIES));
}

test("Her Return contains 45 substantial, sequential studies", () => {
  const studies = loadStudies();
  assert.equal(studies.length, 45);
  assert.deepEqual(
    studies.map((study) => study.day),
    Array.from({ length: 45 }, (_, index) => index + 1)
  );
  for (const study of studies) {
    assert.ok(study.title.length >= 20, `day ${study.day} title`);
    assert.ok(study.context.length >= 180, `day ${study.day} context`);
    assert.ok(study.lesson.length >= 350, `day ${study.day} lesson`);
    assert.equal(study.truths.length, 3, `day ${study.day} truths`);
    assert.equal(study.questions.length, 4, `day ${study.day} questions`);
    assert.ok(study.practice.length >= 100, `day ${study.day} practice`);
    assert.ok(study.prayer.length >= 80, `day ${study.day} prayer`);
    assert.ok(study.book && Number.isInteger(study.chapter));
  }
});

test("each of the five movements contains nine studies", () => {
  const studies = loadStudies();
  const counts = Object.groupBy(studies, (study) => study.movement);
  assert.deepEqual(
    Object.fromEntries(Object.entries(counts).map(([key, rows]) => [key, rows.length])),
    { RETURN: 9, ROOTED: 9, RENEWED: 9, "WISE LOVE": 9, SENT: 9 }
  );
});

test("the page exposes the study, private lock, editor, and assets", () => {
  const html = read("index.html");
  for (const expected of [
    'id="herJournal"',
    'id="journalDayGrid"',
    'id="journalPassphrase"',
    'id="journalEditor"',
    'id="journalReflection"',
    'href="#herJournal"',
    'href="journal.css"',
    'src="journal-data.js"',
    'src="journal.js"'
  ]) {
    assert.ok(html.includes(expected), expected);
  }
  assert.match(html, /PGWS Nationals and database viewers cannot read/);
  assert.match(html, /nobody at PGWS can recover your entries/);
});

test("journal storage contains ciphertext only and enforces user ownership", () => {
  const sql = read("pgws-private-journal.sql");
  assert.match(sql, /ciphertext text not null/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on table .* from anon/i);
  for (const action of ["select", "insert", "update", "delete"]) {
    assert.match(sql, new RegExp(`for ${action}`, "i"));
  }
  assert.match(sql, /auth\.uid\(\)\) = user_id/i);
  assert.doesNotMatch(sql, /\breflection\s+text\b/i);
  assert.doesNotMatch(sql, /\bprayer\s+text\b/i);
  assert.doesNotMatch(sql, /\bnext_step\s+text\b/i);
});

test("browser journal uses slow PBKDF2, AES-GCM, and no persistent passphrase storage", () => {
  const source = read("journal.js");
  assert.match(source, /name:\s*"PBKDF2"/);
  assert.match(source, /iterations:\s*250000/);
  assert.match(source, /hash:\s*"SHA-256"/);
  assert.match(source, /name:\s*"AES-GCM"/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /service[_-]?role/i);
});

test("the selected cryptography round-trips private journal text", async () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const passphrase = "Mercy meets me every morning";
  const plaintext = JSON.stringify({
    reflection: "This is private.",
    prayer: "God, lead me.",
    nextStep: "Read slowly."
  });
  const material = await webcrypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );
  assert.notEqual(Buffer.from(encrypted).toString("utf8"), plaintext);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted
  );
  assert.equal(decoder.decode(decrypted), plaintext);
});
