import { cleanText, json, methodNotAllowed, readJson } from "../_lib/http.js";
import { dbInsert, getAuthUser, getMembership, recordAudit } from "../_lib/pgws.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  try {
    const user = await getAuthUser(req);
    const membership = await getMembership(user.id);
    if (membership?.status !== "active") return json(res, 403, { error: "Active PGWS membership is required." });
    const body = await readJson(req);
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 500) throw new Error("Enter valid service hours.");
    const date = cleanText(body.serviceDate, 10, true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a valid service date.");
    const entryRows = await dbInsert("pgws_service_entries", {
      user_id: user.id,
      organization_name: cleanText(body.organizationName, 180, true),
      service_date: date,
      hours,
      description: cleanText(body.description, 2000, true),
      verification_contact_name: cleanText(body.verificationContactName, 120) || null,
      verification_contact_email: cleanText(body.verificationContactEmail, 254) || null,
      status: "submitted",
    });
    await recordAudit({
      actorUserId: user.id,
      actorType: "user",
      action: "service.submitted",
      entityType: "pgws_service_entry",
      entityId: entryRows?.[0]?.id,
      afterState: { hours, service_date: date },
    });
    return json(res, 201, { entry: entryRows?.[0] });
  } catch (error) {
    return json(res, Number(error.status || 400), { error: error.message || "Service entry could not be submitted." });
  }
}

