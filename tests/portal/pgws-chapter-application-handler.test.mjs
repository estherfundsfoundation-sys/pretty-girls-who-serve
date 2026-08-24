import assert from "node:assert/strict";
import test from "node:test";

import { createChapterApplicationHandler } from "../../api/pgws/chapter-applications.js";

const validApplication = {
  founderName: "Test Founder",
  founderEmail: "founder@example.com",
  founderPhone: "(813) 555-0100 ext. 2",
  cofounderName: "",
  cofounderEmail: "",
  chapterType: "campus",
  institution: "Example University",
  city: "Tampa",
  state: "FL",
  whyPgws: "I want to build a Christ-centered sisterhood.",
  leadership: "I lead with care, accountability, and follow-through.",
  ministry: "It means loving and serving women consistently.",
  communityNeed: "Students need faith-filled support and belonging.",
  experience: "I have led campus service projects and small groups.",
  acknowledgement: "on",
  membershipAcknowledgement: "on",
};

function request(body = validApplication) {
  return {
    method: "POST",
    body,
    headers: {
      host: "prettygirlswhoserve.org",
      "x-forwarded-proto": "https",
      "x-vercel-id": "test-request",
    },
  };
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(payload) {
      this.body = JSON.parse(payload);
    },
  };
}

test("a saved chapter application succeeds when notification tracking fails", async () => {
  const handler = createChapterApplicationHandler({
    select: async () => [],
    insert: async (_table, application) => [
      { id: "application-1", ...application },
    ],
    patch: async () => {
      throw new Error("tracking column unavailable");
    },
    audit: async () => {
      throw new Error("audit unavailable");
    },
    sendApplicantReceipt: async () => ({ status: "sent" }),
    sendNationalsNotification: async () => ({ status: "sent" }),
    makeReference: () => "PGWS-CH-2026-TEST01",
    now: () => new Date("2026-08-17T12:00:00.000Z"),
  });
  const res = response();

  await handler(request(), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.reference, "PGWS-CH-2026-TEST01");
  assert.equal(res.body.receipt, "sent");
  assert.equal(res.body.nationalNotification, "sent");
});

test("a saved chapter application succeeds when the email provider is unavailable", async () => {
  const handler = createChapterApplicationHandler({
    select: async () => [],
    insert: async (_table, application) => [
      { id: "application-email-failure", ...application },
    ],
    audit: async () => {},
    sendApplicantReceipt: async () => {
      throw new Error("email unavailable");
    },
    sendNationalsNotification: async () => {
      throw new Error("email unavailable");
    },
    makeReference: () => "PGWS-CH-2026-TEST03",
    now: () => new Date("2026-08-17T12:00:00.000Z"),
  });
  const res = response();

  await handler(request(), res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.reference, "PGWS-CH-2026-TEST03");
  assert.equal(res.body.receipt, "failed");
  assert.equal(res.body.nationalNotification, "failed");
});

test("the application accepts common phone formatting and form checkbox values", async () => {
  let savedApplication;
  const handler = createChapterApplicationHandler({
    select: async () => [],
    insert: async (_table, application) => {
      savedApplication = application;
      return [{ id: "application-2", ...application }];
    },
    patch: async () => [],
    audit: async () => {},
    sendApplicantReceipt: async () => ({ status: "skipped" }),
    sendNationalsNotification: async () => ({ status: "skipped" }),
    makeReference: () => "PGWS-CH-2026-TEST02",
    now: () => new Date("2026-08-17T12:00:00.000Z"),
  });
  const res = response();

  await handler(request(), res);

  assert.equal(res.statusCode, 201);
  assert.equal(savedApplication.founder_phone, "(813) 555-0100 ext. 2");
  assert.equal(savedApplication.acknowledgement, true);
});

test("a missing answer identifies the exact field before database access", async () => {
  let selected = false;
  const handler = createChapterApplicationHandler({
    select: async () => {
      selected = true;
      return [];
    },
  });
  const res = response();

  await handler(request({ ...validApplication, ministry: "" }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.error,
    "Your Christ-centered service response is required.",
  );
  assert.equal(selected, false);
});
