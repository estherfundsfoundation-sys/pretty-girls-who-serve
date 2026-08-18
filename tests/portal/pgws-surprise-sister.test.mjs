import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  alumniAcceptanceMessage,
  surpriseSisterInductionMessage,
} from "../../api/_lib/email.js";
import {
  joinContestantRoster,
  parseEnv,
} from "../../scripts/induct-miss-pgws-contestants.mjs";
import {
  parseCsv,
  rosterFromCsv,
} from "../../scripts/run-surprise-sister-csv.mjs";

test("surprise sister email is a personalized acceptance and induction letter", () => {
  const message = surpriseSisterInductionMessage({
    user: { id: "user-1", email: "avery@example.edu" },
    profile: {
      preferredName: "Avery Jones",
      contestantNumber: 7,
      college: "Esther University",
    },
    membership: { id: "membership-1", membership_id: "PGWS-2026-QUEEN" },
    myEffUrl: "https://my.estherfundsfoundation.org/join?token=secure",
    accessUrl: "https://auth.example.org/secure-magic-link",
    appUrl: "https://prettygirlswhoserve.org",
  });

  assert.match(message.subject, /Avery/);
  assert.match(message.subject, /Sisters 4L/i);
  assert.match(message.text, /OFFICIAL ACCEPTANCE LETTER/);
  assert.match(message.text, /OFFICIAL SISTERHOOD INDUCTION/);
  assert.match(message.text, /SISTERS 4L!/);
  assert.match(message.text, /PGWS-2026-QUEEN/);
  assert.match(message.text, /Contestant #007/);
  assert.match(message.text, /Esther University/);
  assert.match(message.text, /https:\/\/auth\.example\.org\/secure-magic-link/);
  assert.match(message.text, /https:\/\/prettygirlswhoserve\.org\/chapters#apply/);
  assert.match(message.text, /does not automatically approve a campus chapter/i);
  assert.match(message.html, /Accept &amp; enter my P31 Portal|Accept & enter my P31 Portal/);
  assert.equal(message.recipient, "avery@example.edu");
});

test("alumni acceptance is personalized and never labels the member as a contestant", () => {
  const message = alumniAcceptanceMessage({
    user: { id: "user-alumni", email: "amanda@example.com" },
    profile: { fullName: "Amanda Tinker" },
    membership: { id: "membership-alumni", membership_id: "PGWS-2026-ALUMNI" },
    myEffUrl: "https://my.estherfundsfoundation.org/join?token=secure",
    accessUrl: "https://auth.example.org/alumni-magic-link",
    appUrl: "https://prettygirlswhoserve.org",
  });

  assert.match(message.subject, /Amanda/);
  assert.match(message.subject, /Alumni Membership/i);
  assert.match(message.text, /OFFICIAL ALUMNI MEMBERSHIP ACCEPTANCE/);
  assert.match(message.text, /complimentary lifetime PGWS Alumni Member/);
  assert.match(message.text, /SISTERS 4L!/);
  assert.match(message.text, /PGWS-2026-ALUMNI/);
  assert.match(message.text, /https:\/\/auth\.example\.org\/alumni-magic-link/);
  assert.doesNotMatch(message.text, /contestant/i);
  assert.equal(message.recipient, "amanda@example.com");
});

test("roster validation joins profiles and rejects unsafe bulk-send input", () => {
  const contestants = [
    {
      id: "contestant-1",
      user_id: "profile-1",
      contestant_number: 12,
      public_name: "Avery J.",
      college: "",
    },
  ];
  const profiles = [
    {
      user_id: "profile-1",
      legal_name: "Avery Jones",
      preferred_name: "Avery",
      email: " Avery@Example.edu ",
      college: "Esther University",
    },
  ];
  const valid = joinContestantRoster(contestants, profiles);
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.roster[0].email, "avery@example.edu");
  assert.equal(valid.roster[0].college, "Esther University");

  const invalid = joinContestantRoster(
    [...contestants, { ...contestants[0], id: "contestant-2", contestant_number: 13 }],
    profiles,
  );
  assert.ok(invalid.errors.some((error) => /shares an email address/i.test(error)));
});

test("environment parser handles Vercel-style quoted values", () => {
  assert.deepEqual(parseEnv('A="one"\nexport B=two\n# comment\nC="line\\nvalue"'), {
    A: "one",
    B: "two",
    C: "line\nvalue",
  });
});

test("exported admin CSV becomes a safe contestant induction roster", () => {
  const csv = '\uFEFF"Contestant number","Contestant ID","Public name","Legal name","Email","School"\r\n"007","contestant-7","Avery, J.","Avery Jones","avery@example.edu","Esther University"\r\n';
  const roster = rosterFromCsv(parseCsv(csv));
  assert.equal(roster.length, 1);
  assert.equal(roster[0].contestantNumber, 7);
  assert.equal(roster[0].publicName, "Avery, J.");
  assert.equal(roster[0].email, "avery@example.edu");
});

test("bulk induction stays explicit, count-guarded, magic-link based, and passwordless", async () => {
  const [script, membership, portalHtml, portalScript, batchEndpoint] = await Promise.all([
    readFile(new URL("../../scripts/induct-miss-pgws-contestants.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../api/_lib/membership.js", import.meta.url), "utf8"),
    readFile(new URL("../../p31.html", import.meta.url), "utf8"),
    readFile(new URL("../../p31.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/pgws/surprise-sister-batch.js", import.meta.url), "utf8"),
  ]);
  assert.match(script, /--send/);
  assert.match(script, /--expected-count/);
  assert.match(script, /admin\/generate_link/);
  assert.match(script, /type: "magiclink"/);
  assert.match(script, /p31\?welcome=sister/);
  assert.doesNotMatch(script, /password\s*:/i);
  assert.match(membership, /sendWelcome = true/);
  assert.match(membership, /if \(sendWelcome\)/);
  assert.match(portalHtml, /Welcome, Sister/);
  assert.match(portalHtml, /Your \$20 lifetime membership is our gift to you/);
  assert.match(portalHtml, /SISTERS 4L!/);
  assert.match(portalScript, /showSurpriseSisterWelcome/);
  assert.match(portalScript, /membership\?\.source !== "complimentary"/);
  assert.match(batchEndpoint, /expectedTotal !== 142/);
  assert.match(batchEndpoint, /paymentStatus: "not_required"/);
  assert.match(batchEndpoint, /sendWelcome: false/);
});
