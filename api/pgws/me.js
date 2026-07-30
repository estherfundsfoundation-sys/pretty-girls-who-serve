import { json, methodNotAllowed, publicOrigin } from "../_lib/http.js";
import {
  dbSelect,
  getAuthUser,
  getMembership,
  isAdmin,
} from "../_lib/pgws.js";
import { ensureMyEffActivation } from "../_lib/membership.js";

function first(rows) {
  return rows?.[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const user = await getAuthUser(req);
    const [membership, profileRows, legacyRows, planRows, admin] = await Promise.all([
      getMembership(user.id),
      dbSelect("pgws_profiles", `select=*&id=eq.${encodeURIComponent(user.id)}&limit=1`),
      dbSelect(
        "pgws_legacy_members",
        `select=id,source_member_id,first_name,last_name,membership_type,joined_at,chapter_name,validation_status&email_key=eq.${encodeURIComponent(user.email)}&paid_status=in.(paid,complimentary)&claimed_by=is.null&limit=2`,
      ),
      dbSelect("pgws_membership_plans", "select=code,public_name,description,amount_cents,currency,benefits&code=eq.lifetime-2026&active=eq.true&limit=1"),
      isAdmin(user),
    ]);

    const active = membership?.status === "active" && ["paid", "not_required"].includes(membership.payment_status);
    if (!active) {
      return json(res, 200, {
        user: { id: user.id, email: user.email },
        profile: first(profileRows),
        membership,
        plan: first(planRows),
        legacy: {
          claimAvailable: legacyRows?.length === 1,
          needsReview: legacyRows?.length > 1,
          record: legacyRows?.length === 1 ? legacyRows[0] : null,
        },
        checkoutReady: Boolean(
          (process.env.STRIPE_PGWS_PAYMENT_LINK_URL || "https://buy.stripe.com/dRm9AU9RIfua3Fj05v7bW01")
          && process.env.STRIPE_SECRET_KEY
          && process.env.STRIPE_WEBHOOK_SECRET
          && process.env.PGWS_SUPABASE_SERVICE_ROLE_KEY
        ),
        admin,
        portalAccess: false,
      });
    }

    const [
      myEffRows,
      progressRows,
      chapterRows,
      events,
      announcements,
      resources,
      opportunities,
      serviceEntries,
      supportRequests,
    ] = await Promise.all([
      dbSelect("pgws_myeff_connections", `select=*&pgws_user_id=eq.${encodeURIComponent(user.id)}&limit=1`),
      dbSelect("pgws_member_progress", `select=*&user_id=eq.${encodeURIComponent(user.id)}&limit=1`),
      dbSelect("pgws_chapter_memberships", `select=*,pgws_chapters(name,slug,institution,city,state,status)&user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=1`),
      dbSelect("pgws_events", `select=id,title,description,starts_at,ends_at,timezone,location_type,location_label,access_url,audience&status=eq.published&starts_at=gte.${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&order=starts_at.asc&limit=8`),
      dbSelect("pgws_announcements", `select=id,title,body,category,href,published_at,expires_at,requires_acknowledgement&published_at=lte.${encodeURIComponent(new Date().toISOString())}&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})&order=published_at.desc&limit=8`),
      dbSelect("pgws_resources", "select=id,title,description,category,href,sort_order&active=eq.true&order=sort_order.asc&limit=40"),
      dbSelect("pgws_opportunities", `select=id,title,description,opportunity_type,href,opens_at,closes_at&active=eq.true&or=(closes_at.is.null,closes_at.gt.${encodeURIComponent(new Date().toISOString())})&order=closes_at.asc.nullslast&limit=12`),
      dbSelect("pgws_service_entries", `select=id,organization_name,service_date,hours,description,status,reviewer_notes,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=service_date.desc&limit=50`),
      dbSelect("pgws_support_requests", `select=id,category,subject,message,status,priority,resolution_notes,created_at,updated_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=20`),
    ]);

    const myEff = await ensureMyEffActivation({
      user,
      membership,
      appUrl: publicOrigin(req),
    });
    const approvedHours = (serviceEntries || [])
      .filter((entry) => entry.status === "approved")
      .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
    return json(res, 200, {
      user: { id: user.id, email: user.email },
      profile: first(profileRows),
      membership,
      plan: first(planRows),
      myEff: { ...(first(myEffRows) || myEff.connection), activationUrl: myEff.url },
      progress: first(progressRows),
      chapter: first(chapterRows),
      events: events || [],
      announcements: announcements || [],
      resources: resources || [],
      opportunities: opportunities || [],
      service: { entries: serviceEntries || [], approvedHours },
      supportRequests: supportRequests || [],
      admin,
      portalAccess: true,
    });
  } catch (error) {
    return json(res, Number(error.status || 500), {
      error: Number(error.status || 500) >= 500
        ? "The P31 Portal could not load your membership home."
        : error.message,
    });
  }
}

