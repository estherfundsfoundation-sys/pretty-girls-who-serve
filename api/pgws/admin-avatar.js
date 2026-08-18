import { cleanText, json, methodNotAllowed, readRaw } from "../_lib/http.js";
import { pgwsUrl, recordAudit, requireAdmin } from "../_lib/pgws.js";

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
  if (response.status !== 404)
    throw new Error("Profile photo storage is unavailable.");
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
  if (!created.ok && created.status !== 409)
    throw new Error("Profile photo storage could not be prepared.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const admin = await requireAdmin(req);
    const userId = cleanText(req.query?.userId, 80, true);
    const contentType = String(req.headers["content-type"] || "")
      .split(";")[0]
      .toLowerCase();
    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    }[contentType];
    if (!extension)
      return json(res, 400, {
        error: "Choose a JPG, PNG, or WebP profile photo.",
      });
    const bytes = await readRaw(req, 5_000_000);
    if (bytes.length < 100)
      return json(res, 400, {
        error: "That profile photo is empty or invalid.",
      });
    await ensureBucket();
    const objectPath = `${userId}/profile.${extension}`;
    const upload = await fetch(
      `${pgwsUrl}/storage/v1/object/pgws-avatars/${objectPath}`,
      {
        method: "POST",
        headers: serviceHeaders({
          "Content-Type": contentType,
          "x-upsert": "true",
        }),
        body: bytes,
      },
    );
    const uploadBody = await upload.json().catch(() => ({}));
    if (!upload.ok)
      throw new Error(
        uploadBody?.message || "The profile photo could not be uploaded.",
      );
    const avatarUrl = `${pgwsUrl}/storage/v1/object/public/pgws-avatars/${objectPath}?v=${Date.now()}`;
    const userResponse = await fetch(
      `${pgwsUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { headers: serviceHeaders() },
    );
    const target = await userResponse.json().catch(() => ({}));
    if (!userResponse.ok || !target?.id)
      throw new Error("The PGWS member account was not found.");
    const update = await fetch(
      `${pgwsUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: "PUT",
        headers: serviceHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          user_metadata: {
            ...(target.user_metadata || {}),
            avatar_url: avatarUrl,
            profile_photo_source: "national_admin",
          },
        }),
      },
    );
    if (!update.ok)
      throw new Error(
        "The photo could not be connected to the member profile.",
      );
    await recordAudit({
      actorUserId: admin.id,
      actorType: "admin",
      action: "member_profile.avatar_updated",
      entityType: "pgws_profile",
      entityId: userId,
      afterState: { avatar_url: avatarUrl },
    });
    return json(res, 200, { avatarUrl });
  } catch (error) {
    return json(res, Number(error.status || 400), {
      error: error.message || "The profile photo could not be saved.",
    });
  }
}
