import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (name) => fs.readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");

test("Pretty Girls Overcome is a complete public seven-day plan", () => {
  const context = { window: {} };
  vm.runInNewContext(read("overcome-data.js"), context);
  const plan = context.window.PGWS_OVERCOME_PLAN;
  assert.equal(plan.days.length, 7);
  assert.ok(plan.closingLetter.length >= 5);
  for (const [index, day] of plan.days.entries()) {
    assert.equal(day.day, index + 1);
    assert.ok(day.story.length >= 3);
    assert.ok(day.bibleStory.length >= 3);
    assert.ok(day.bibleStory.join(" ").length >= 700);
    assert.ok(day.questions.length >= 5);
    assert.ok(day.activity.length >= 4);
    assert.match(day.prayer, /Amen\.$/);
  }
});

test("the plan is free to read and keeps social features optional", () => {
  const html = read("overcome.html");
  assert.match(html, /Public and free\. No account required/);
  assert.match(html, /private on this device/i);
  assert.match(html, /Sign In Through P31/);
  assert.match(html, /does not replace licensed mental-health treatment/);
  assert.match(html, /call or text <a href="tel:988">988<\/a>/);
  assert.match(html, /My dearest, prettiest sister/);
});

test("the homepage prominently invites visitors into the free plan", () => {
  const html = read("index.html");
  assert.match(html, /class="overcome-invitation"/);
  assert.match(html, /Begin the free 7-day plan/);
  assert.match(html, /href="\/plans\/pretty-girls-overcome"/);
  assert.match(html, /Pretty-Girls-Overcome-Instagram-4x5\.png/);
});

test("private responses are device-encrypted and circle sharing is deliberate", () => {
  const browser = read("overcome.js");
  assert.match(browser, /AES-GCM/);
  assert.match(browser, /indexedDB\.open\("pgws-private-plan-keys"/);
  assert.match(browser, /share_with_circles:shared/);
  assert.match(browser, /pgws_social_reports/);
  assert.match(browser, /pgws_social_blocks/);
});
