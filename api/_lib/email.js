import { dbInsert, dbPatch } from "./pgws.js";

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

