import { cleanText, json, methodNotAllowed, readJson } from "../_lib/http.js";
import {
  dbInsert,
  getAuthUser,
  getMembership,
  recordAudit,
} from "../_lib/pgws.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const user = await getAuthUser(req);
    const membership = await getMembership(user.id);
    if (membership?.status !== "active") return json(res, 403, { error: "Active PGWS membership is required." });
    const body = await readJson(req);
    const interests = Array.isArray(body.interests)
      ? body.interests.map((value) => cleanText(value, 40)).filter(Boolean).slice(0, 12)
      : cleanText(body.interests, 500).split(",").map((value) => value.trim()).filter(Boolean).slice(0, 12);
    const profile = {
      id: user.id,
      display_name: cleanText(body.displayName, 50, true),
      city_state: cleanText(body.cityState, 100) || null,
      chapter_name: cleanText(body.chapterName, 100) || null,
      bio: cleanText(body.bio, 500) || null,
      interests,
      directory_visible: Boolean(body.directoryVisible),
      updated_at: new Date().toISOString(),
    };
    const rows = await dbInsert("pgws_profiles", profile, { upsert: true, onConflict: "id" });
    await recordAudit({
      actorUserId: user.id,
      actorType: "user",
      action: "profile.updated",
      entityType: "pgws_profile",
      entityId: user.id,
      afterState: { directory_visible: profile.directory_visible },
    });
    return json(res, 200, { profile: rows?.[0] || profile });
  } catch (error) {
    return json(res, Number(error.status || 400), { error: error.message || "Profile could not be saved." });
  }
}

