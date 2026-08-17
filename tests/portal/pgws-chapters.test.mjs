import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("Chapter House has clean public routes and a complete application", () => {
  const routes = JSON.parse(read("vercel.json")).rewrites;
  assert.ok(routes.some((route) => route.source === "/chapters" && route.destination === "/chapters.html"));
  const html = read("chapters.html");
  assert.match(html, /id="chapterApplication"/);
  assert.match(html, /founderName/);
  assert.match(html, /cofounderName/);
  assert.match(html, /ministry/);
  assert.match(html, /acknowledgement/);
  assert.match(html, /written approval/i);
});

test("Chapter application storage is private, auditable, and duplicate-aware", () => {
  const migration = read("supabase/migrations/20260817090000_pgws_chapter_house.sql");
  const api = read("api/pgws/chapter-applications.js");
  assert.match(migration, /create table if not exists public\.pgws_chapter_applications/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.pgws_chapter_applications from anon, authenticated/);
  assert.match(api, /founder_email_key/);
  assert.match(api, /chapter_application\.submitted/);
  assert.match(api, /acknowledgement !== true/);
  assert.match(api, /not permission to recruit publicly/i);
});

test("PGWS chapter resources no longer borrow EFF chapter pages", () => {
  const html = read("index.html");
  assert.match(html, /href="\/chapters"/);
  assert.match(html, /pgws-chapter-launch-leadership-manual\.pdf/);
  assert.doesNotMatch(html, /estherfundsfoundation\.org\/(governance|operations|programming|branding|training|compliance|membership|new-eff|communitty|conflict)/i);
  assert.doesNotMatch(html, /linktr\.ee\/prettygirlswhoserve/i);
});

test("P31 loading state stays hidden when the app opens another view", () => {
  assert.match(read("p31.css"), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(read("p31.html"), /data-panel="chapter"/);
  assert.match(read("p31.html"), /data-panel-content="chapter"/);
  assert.match(read("p31.js"), /"chapter"/);
});

test("Nationals can review the chapter application pipeline", () => {
  const adminApi = read("api/pgws/admin.js");
  const adminHtml = read("pgws-admin.html");
  assert.match(adminApi, /pgws_chapter_applications/);
  assert.match(adminApi, /review_chapter_application/);
  assert.match(adminHtml, /data-admin-panel="chapters"/);
  assert.match(adminHtml, /id="chapterApplicationList"/);
});

test("the downloadable PGWS chapter manual is present", () => {
  const manual = path.join(root, "public/downloads/pgws-chapter-launch-leadership-manual.pdf");
  assert.ok(fs.existsSync(manual));
  assert.ok(fs.statSync(manual).size > 20_000);
});
