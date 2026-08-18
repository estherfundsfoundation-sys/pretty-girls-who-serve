import { json, methodNotAllowed, readRaw } from "../_lib/http.js";
import { getAuthUser, getMembership, pgwsUrl, recordAudit } from "../_lib/pgws.js";

function serviceHeaders(extra = {}) {
  const key = String(process.env.PGWS_SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) throw new Error("PGWS server access is not configured.");
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function ensureBucket() {
  const response = await fetch(`${pgwsUrl}/storage/v1/bucket/pgws-avatars`, {
    headers: serviceHeaders(),
  });
  if (response.ok) return;
  if (response.status !== 404) throw new Error("Profile photo storage is unavailable.");
  const created = await fetch(`${pgwsUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: "pgws-avatars",
      name: "pgws-avatars",
      public: true,
      file_size_limit: 5_000_000,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    }),
  });
  if (!created.ok && created.status !== 409) throw new Error("Profile photo storage could not be prepared.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const user = await getAuthUser(req);
    const membership = await getMembership(user.id);
    if (membership?.status !== "active") return json(res, 403, { error: "Active PGWS membership is required." });
    const contentType = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
    const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const extension = extensions[contentType];
    if (!extension) return json(res, 400, { error: "Choose a JPG, PNG, or WebP profile photo." });
    const bytes = await readRaw(req, 5_000_000);
    if (bytes.length < 100) return json(res, 400, { error: "That profile photo file is empty or invalid." });
    await ensureBucket();
    const objectPath = `${user.id}/profile.${extension}`;
    const upload = await fetch(`${pgwsUrl}/storage/v1/object/pgws-avatars/${objectPath}`, {
      method: "POST",
      headers: serviceHeaders({ "Content-Type": contentType, "x-upsert": "true" }),
      body: bytes,
    });
    const uploadBody = await upload.json().catch(() => ({}));
    if (!upload.ok) throw new Error(uploadBody?.message || "The profile photo could not be uploaded.");
    const avatarUrl = `${pgwsUrl}/storage/v1/object/public/pgws-avatars/${objectPath}`;
    const update = await fetch(`${pgwsUrl}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: serviceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        user_metadata: {
          ...(user.raw?.user_metadata || {}),
          avatar_url: avatarUrl,
          profile_photo_source: "member_upload",
        },
      }),
    });
    if (!update.ok) throw new Error("The uploaded photo could not be connected to the member profile.");
    await recordAudit({
      actorUserId: user.id,
      actorType: "user",
      action: "profile.avatar_updated",
      entityType: "pgws_profile",
      entityId: user.id,
      afterState: { avatar_url: avatarUrl },
    });
    return json(res, 200, { avatarUrl });
  } catch (error) {
    return json(res, Number(error.status || 400), { error: error.message || "The profile photo could not be saved." });
  }
}
