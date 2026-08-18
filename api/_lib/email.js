import { dbInsert, dbPatch, dbSelect } from "./pgws.js";

const surpriseSisterTemplate = "pgws_surprise_sister_induction_2027_v1";

function emailFrom() {
  return process.env.PGWS_EMAIL_FROM || "Pretty Girls Who Serve <pgws@estherfundsinc.org>";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character]));
}

export async function sendMembershipWelcome({ user, membership, myEffUrl, appUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { status: "skipped", reason: "RESEND_API_KEY is not configured" };
  const recipient = user.email.trim().toLowerCase();
  const deliveryRows = await dbInsert("pgws_email_deliveries", {
    user_id: user.id,
    membership_id: membership.id,
    template_key: "pgws_membership_welcome_v1",
    recipient_email: recipient,
    status: "queued",
  }, { ignoreDuplicates: true });
  const delivery = deliveryRows?.[0];
  if (!delivery) return { status: "duplicate" };
  const portalUrl = `${appUrl}/p31`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: emailFrom(),
      to: [recipient],
      reply_to: "nationals@estherfundsinc.org",
      subject: "Welcome home — your P31 Portal is ready",
      text: `Welcome to Pretty Girls Who Serve.\n\nYour lifetime membership is active.\nPGWS Membership ID: ${membership.membership_id}\n\nOpen your P31 Portal: ${portalUrl}\nActivate or connect your included free EFF national membership: ${myEffUrl}\n\nKeep your password and verification codes private. PGWS will never ask you to email them.\n\nPretty Girls Who Serve\nFaith. Purpose. Sisterhood. Service.`,
      html: `<!doctype html><html><body style="margin:0;background:#fff7fa;font-family:Arial,sans-serif;color:#3d2430"><div style="max-width:640px;margin:auto;padding:38px 22px"><div style="background:#21131a;color:white;border-radius:24px 24px 0 0;padding:35px"><p style="font-size:12px;letter-spacing:2px;margin:0;color:#f7bbd4">PRETTY GIRLS WHO SERVE</p><h1 style="font-family:Georgia,serif;font-size:42px;line-height:1.05;margin:12px 0">Welcome home,<br>sister.</h1><p style="line-height:1.6">Your lifetime PGWS membership is active and your P31 Portal is ready.</p></div><div style="background:white;border:1px solid #edd5e0;border-top:0;padding:32px"><p style="margin-top:0">Your official PGWS membership ID is:</p><p style="font-size:25px;font-weight:bold;color:#a13e68">${escapeHtml(membership.membership_id)}</p><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#21131a;color:#fff;text-decoration:none;padding:15px 20px;border-radius:12px;font-weight:bold">Open my P31 Portal →</a><h2 style="font-family:Georgia,serif;margin-top:34px">Your EFF national membership is included.</h2><p style="line-height:1.6">PGWS membership includes free Esther Funds Foundation national membership. Use the secure link below to connect an existing MyEFF account or create your separate MyEFF sign-in.</p><a href="${escapeHtml(myEffUrl)}" style="color:#a13e68;font-weight:bold">Connect my MyEFF access →</a><hr style="border:0;border-top:1px solid #edd5e0;margin:30px 0"><p style="font-size:13px;color:#715764">Keep your password and verification codes private. PGWS will never ask you to email them.</p></div></div></body></html>`,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    await dbPatch("pgws_email_deliveries", `id=eq.${delivery.id}`, {
      status: "failed",
      error_message: body?.message || "Email provider rejected the message.",
    }, { returning: false });
    throw new Error(body?.message || "The onboarding email could not be sent.");
  }
  await dbPatch("pgws_email_deliveries", `id=eq.${delivery.id}`, {
    status: "sent",
    provider_message_id: body.id || null,
    sent_at: new Date().toISOString(),
  }, { returning: false });
  return { status: "sent", id: body.id };
}

export function surpriseSisterInductionMessage({
  user,
  profile,
  membership,
  myEffUrl,
  accessUrl,
  appUrl,
}) {
  const fullName =
    String(profile.preferredName || profile.legalName || profile.publicName || "")
      .trim() || String(user.email).split("@")[0];
  const firstName = fullName.split(/\s+/)[0] || "Sister";
  const contestantNumber = profile.contestantNumber
    ? `#${String(profile.contestantNumber).padStart(3, "0")}`
    : "Official 2027 Contestant";
  const school = String(profile.college || "your campus").trim();
  const portalUrl = `${appUrl}/p31`;
  const chapterUrl = `${appUrl}/chapters#apply`;
  const subject = `${firstName}, you’re officially a PGWS Sister — Sisters 4L! 💗`;
  const text = `Dear ${firstName},

OFFICIAL ACCEPTANCE LETTER

Congratulations! In celebration of your selection as a Miss Pretty Girls Who Serve 2027 contestant, Pretty Girls Who Serve is overjoyed to officially accept you into our national Christ-centered sisterhood as a complimentary lifetime member.

You were selected for more than a pageant. You are becoming part of a ministry of women committed to faith, purpose, sisterhood, service, leadership, and discovering our beauty in Christ. Our prayer is that you leave this experience loving Jesus more deeply and carrying genuine sisters with you for life.

OFFICIAL SISTERHOOD INDUCTION

Welcome home, ${firstName}. From this day forward: SISTERS 4L!

PGWS Membership ID: ${membership.membership_id}
Miss PGWS 2027: Contestant ${contestantNumber}
School: ${school}

Activate your complimentary membership and enter the P31 Portal:
${accessUrl}

Your membership includes the P31 Portal, national sisterhood access, faith and leadership resources, service opportunities, a digital membership identity, and included Esther Funds Foundation national membership.

Connect your included MyEFF membership:
${myEffUrl}

START YOUR PRETTY GIRLS WHO SERVE CHAPTER TODAY

Imagine a sisterhood in Christ growing at ${school}. If God is placing that vision on your heart, begin the official chapter-interest process here:
${chapterUrl}

PGWS membership does not automatically approve a campus chapter. Please wait for written approval from PGWS Nationals before recruiting publicly, collecting funds, opening chapter social-media accounts, or representing a chapter as approved.

If your secure access link expires, visit ${portalUrl}, enter this email address, and request a new secure email sign-in link. Never share passwords or verification codes.

With so much love,
Shayna Vincent
Founder & CEO, Esther Funds Foundation
Founder, Pretty Girls Who Serve

Pretty Girls Who Serve
Faith. Purpose. Sisterhood. Service.
SISTERS 4L!`;
  const html = `<!doctype html><html><body style="margin:0;background:#fff5f8;font-family:Arial,sans-serif;color:#35212b"><div style="max-width:680px;margin:auto;padding:34px 16px"><div style="background:#24141d;color:white;border-radius:28px 28px 0 0;padding:40px 34px;text-align:center"><p style="font-size:12px;letter-spacing:3px;margin:0;color:#f7b7d1">MISS PGWS 2027 × PRETTY GIRLS WHO SERVE</p><h1 style="font-family:Georgia,serif;font-size:44px;line-height:1.04;margin:18px 0 12px">You’re officially<br>a PGWS Sister.</h1><p style="font-size:21px;color:#ffd8e8;margin:0">SISTERS 4L! 💗</p></div><div style="background:white;border:1px solid #efd3df;border-top:0;padding:36px 34px"><p style="font-family:Georgia,serif;font-size:22px">Dear ${escapeHtml(firstName)},</p><p style="font-size:12px;letter-spacing:2px;color:#a13e68;font-weight:bold">OFFICIAL ACCEPTANCE LETTER</p><p style="font-size:16px;line-height:1.75">Congratulations! In celebration of your selection as a <b>Miss Pretty Girls Who Serve 2027 contestant</b>, Pretty Girls Who Serve is overjoyed to officially accept you into our national Christ-centered sisterhood as a <b>complimentary lifetime member</b>.</p><p style="font-size:16px;line-height:1.75">You were selected for more than a pageant. You are becoming part of a ministry of women committed to faith, purpose, sisterhood, service, leadership, and discovering our beauty in Christ. Our prayer is that you leave this experience loving Jesus more deeply and carrying genuine sisters with you for life.</p><div style="margin:30px 0;padding:24px;background:#fff0f6;border-left:5px solid #c55787"><p style="font-size:12px;letter-spacing:2px;color:#8d315d;font-weight:bold;margin-top:0">OFFICIAL SISTERHOOD INDUCTION</p><h2 style="font-family:Georgia,serif;font-size:30px;margin:8px 0">Welcome home, ${escapeHtml(firstName)}.</h2><p style="font-size:18px;margin-bottom:0"><b>From this day forward: SISTERS 4L!</b></p></div><table role="presentation" style="width:100%;border-collapse:collapse;margin:24px 0;font-size:15px"><tr><td style="padding:10px;border-bottom:1px solid #efd3df;color:#785d69">Membership ID</td><td style="padding:10px;border-bottom:1px solid #efd3df;font-weight:bold;text-align:right">${escapeHtml(membership.membership_id)}</td></tr><tr><td style="padding:10px;border-bottom:1px solid #efd3df;color:#785d69">Miss PGWS 2027</td><td style="padding:10px;border-bottom:1px solid #efd3df;font-weight:bold;text-align:right">Contestant ${escapeHtml(contestantNumber)}</td></tr><tr><td style="padding:10px;color:#785d69">School</td><td style="padding:10px;font-weight:bold;text-align:right">${escapeHtml(school)}</td></tr></table><div style="text-align:center;margin:30px 0"><a href="${escapeHtml(accessUrl)}" style="display:inline-block;background:#24141d;color:white;text-decoration:none;padding:17px 25px;border-radius:999px;font-weight:bold">Accept & enter my P31 Portal →</a></div><p style="font-size:15px;line-height:1.7">Your membership includes the P31 Portal, national sisterhood access, faith and leadership resources, service opportunities, a digital membership identity, and included Esther Funds Foundation national membership.</p><p><a href="${escapeHtml(myEffUrl)}" style="color:#a13e68;font-weight:bold">Connect my included MyEFF membership →</a></p><div style="margin:34px 0;padding:28px;background:#24141d;color:white;border-radius:20px"><p style="font-size:12px;letter-spacing:2px;color:#f7b7d1;font-weight:bold">BUILD YOUR SISTERHOOD IN CHRIST</p><h2 style="font-family:Georgia,serif;font-size:30px;margin:10px 0">Start your PGWS chapter today.</h2><p style="line-height:1.65">Imagine a sisterhood in Christ growing at ${escapeHtml(school)}. If God is placing that vision on your heart, begin the official chapter-interest process.</p><a href="${escapeHtml(chapterUrl)}" style="display:inline-block;background:#f7b7d1;color:#24141d;text-decoration:none;padding:14px 20px;border-radius:999px;font-weight:bold">Start my chapter interest →</a></div><p style="font-size:12px;line-height:1.6;color:#745c67">PGWS membership does not automatically approve a campus chapter. Please wait for written approval from PGWS Nationals before recruiting publicly, collecting funds, opening chapter social-media accounts, or representing a chapter as approved.</p><hr style="border:0;border-top:1px solid #efd3df;margin:30px 0"><p style="font-family:Georgia,serif;font-size:19px;line-height:1.55">With so much love,<br><b>Shayna Vincent</b><br><span style="font-family:Arial,sans-serif;font-size:13px;color:#745c67">Founder & CEO, Esther Funds Foundation<br>Founder, Pretty Girls Who Serve</span></p><p style="font-size:12px;line-height:1.6;color:#745c67">If your secure access link expires, visit <a href="${escapeHtml(portalUrl)}" style="color:#a13e68">the P31 Portal</a>, enter this email address, and request a new secure email sign-in link. Never share passwords or verification codes.</p></div></div></body></html>`;
  return { subject, text, html, recipient: user.email.trim().toLowerCase() };
}

export async function sendSurpriseSisterInduction(input) {
  const apiKey = process.env.RESEND_API_KEY;
  const bridgeUrl = String(process.env.MISS_PGWS_MAIL_BRIDGE_URL || "").trim();
  const bridgeSecret = String(process.env.PGWS_MAIL_BRIDGE_SECRET || "").trim();
  if (!apiKey && !(bridgeUrl && bridgeSecret))
    return { status: "skipped", reason: "Transactional email is not configured" };
  const message = surpriseSisterInductionMessage(input);
  const existing = await dbSelect(
    "pgws_email_deliveries",
    `select=*&membership_id=eq.${encodeURIComponent(input.membership.id)}&template_key=eq.${surpriseSisterTemplate}&recipient_email=eq.${encodeURIComponent(message.recipient)}&limit=1`,
  );
  if (existing?.[0]?.status === "sent") return { status: "duplicate" };
  let delivery = existing?.[0];
  if (delivery) {
    const rows = await dbPatch(
      "pgws_email_deliveries",
      `id=eq.${delivery.id}`,
      { status: "queued", error_message: null },
    );
    delivery = rows?.[0] || delivery;
  } else {
    const rows = await dbInsert("pgws_email_deliveries", {
      user_id: input.user.id,
      membership_id: input.membership.id,
      template_key: surpriseSisterTemplate,
      recipient_email: message.recipient,
      status: "queued",
    });
    delivery = rows?.[0];
  }
  if (!delivery) return { status: "duplicate" };
  const useBridge = Boolean(bridgeUrl && bridgeSecret);
  const response = await fetch(useBridge ? bridgeUrl : "https://api.resend.com/emails", {
    method: "POST",
    headers: {
      ...(useBridge
        ? { "x-pgws-mail-bridge-secret": bridgeSecret }
        : { Authorization: `Bearer ${apiKey}` }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      useBridge
        ? {
            recipient: message.recipient,
            subject: message.subject,
            text: message.text,
            html: message.html,
          }
        : {
            from: emailFrom(),
            to: [message.recipient],
            reply_to: "nationals@estherfundsinc.org",
            subject: message.subject,
            text: message.text,
            html: message.html,
          },
    ),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    await dbPatch(
      "pgws_email_deliveries",
      `id=eq.${delivery.id}`,
      {
        status: "failed",
        error_message: body?.message || body?.error || "Email provider rejected the message.",
      },
      { returning: false },
    );
    throw new Error(body?.message || body?.error || "The induction email could not be sent.");
  }
  await dbPatch(
    "pgws_email_deliveries",
    `id=eq.${delivery.id}`,
    {
      status: "sent",
      provider_message_id: body.id || null,
      sent_at: new Date().toISOString(),
    },
    { returning: false },
  );
  return { status: "sent", id: body.id };
}

