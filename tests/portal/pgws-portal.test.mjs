import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("P31 is hosted on the PGWS site with clean routes", () => {
  const vercel = JSON.parse(read("vercel.json"));
  assert.ok(vercel.rewrites.some((route) => route.source === "/p31" && route.destination === "/p31.html"));
  assert.ok(vercel.rewrites.some((route) => route.source === "/pgws-admin" && route.destination === "/pgws-admin.html"));
  assert.match(read("index.html"), /href="\/p31"/);
  assert.doesNotMatch(read("index.html"), /joinit\.com/i);
});

test("the approved Stripe link is account-bound and never unlocks from the browser", () => {
  const checkout = read("api/pgws/checkout.js");
  const webhook = read("api/pgws/webhook.js");
  const browser = read("p31.js");
  assert.match(checkout, /https:\/\/buy\.stripe\.com\/dRm9AU9RIfua3Fj05v7bW01/);
  assert.match(checkout, /client_reference_id/);
  assert.match(checkout, /prefilled_email/);
  assert.match(webhook, /STRIPE_PGWS_PAYMENT_LINK_ID/);
  assert.match(webhook, /Number\(session\.amount_total\) !== 2000/);
  assert.match(webhook, /constructEvent\(rawBody, signature/);
  assert.match(browser, /\/api\/pgws\/me/);
  assert.doesNotMatch(browser, /activateMembership|payment_status\s*=\s*"paid"/);
});

test("membership has one welcome flow and returns from checkout automatically", () => {
  const html = read("p31.html");
  const browser = read("p31.js");
  assert.match(html, /Welcome,<br><em>Sister\.<\/em>/);
  assert.match(html, /id="chooseJoin"/);
  assert.match(html, /id="chooseSignIn"/);
  assert.match(html, /id="gateWelcomeName"/);
  assert.match(browser, /window\.open\("about:blank", "pgws-secure-checkout"\)/);
  assert.match(browser, /waitForPayment\(checkoutWindow\)/);
  assert.doesNotMatch(browser, /location\.assign\(result\.checkoutUrl\)/);
  assert.match(browser, /checkout === "success"/);
  assert.match(browser, /legacyClaimInFlight/);
});

test("the public site no longer exposes a second member-profile login", () => {
  const html = read("index.html");
  const browser = read("member-portal.js");
  assert.match(html, /href="\/p31\?panel=profile"/);
  assert.match(html, /href="\/p31\?panel=sisterhood"/);
  assert.doesNotMatch(html, /id="memberPortalModal"/);
  assert.doesNotMatch(browser, /signInWithPassword|signUp\(/);
});

test("every P31 button id referenced by the portal script exists", () => {
  const html = read("p31.html");
  const browser = read("p31.js");
  const ids = [...browser.matchAll(/\$\("([A-Za-z][A-Za-z0-9_-]*)"\)/g)].map((match) => match[1]);
  for (const id of new Set(ids)) assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  const panels = [...html.matchAll(/data-panel="([^"]+)"/g)].map((match) => match[1]);
  for (const panel of panels) assert.match(html, new RegExp(`data-panel-content="${panel}"`), `missing panel ${panel}`);
});

test("MyEFF connection uses signed server callbacks and separate records", () => {
  const membership = read("api/_lib/membership.js");
  const callback = read("api/pgws/myeff-link.js");
  assert.match(membership, /createMyEffActivationToken/);
  assert.match(membership, /\/join\?pgws_token=/);
  assert.match(callback, /X-PGWS-Callback-Signature/i);
  assert.match(callback, /timingSafeEqual/);
  assert.match(callback, /pgws_myeff_connections/);
});

test("member and admin responses are non-cacheable and protected", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const apiHeaders = vercel.headers.find((entry) => entry.source === "/api/(.*)")?.headers || [];
  assert.ok(apiHeaders.some((header) => header.key === "Cache-Control" && header.value === "no-store"));
  assert.match(read("pgws-admin.html"), /noindex,nofollow/);
  assert.match(read("api/pgws/admin.js"), /requireAdmin/);
});

test("private journal remains separate from paid membership records", () => {
  const migration = read("supabase/migrations/20260730100000_mypgws_membership_foundation.sql");
  const membership = read("api/_lib/membership.js");
  assert.doesNotMatch(migration, /journal_entries|journal_ciphertext/i);
  assert.doesNotMatch(membership, /journal_entries|journal_ciphertext/i);
  assert.match(read("p31.html"), /journal, prayer records, community moderation, and private sisterhood data are never copied into MyEFF/i);
});
