import { json, methodNotAllowed } from "../_lib/http.js";
import { clearAdminSessionCookie } from "../_lib/pgws.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  res.setHeader("Set-Cookie", clearAdminSessionCookie());
  return json(res, 200, { message: "Signed out." });
}
