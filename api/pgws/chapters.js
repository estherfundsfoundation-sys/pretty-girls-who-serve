import { json, methodNotAllowed } from "../_lib/http.js";
import { dbSelect } from "../_lib/pgws.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const chapters = await dbSelect(
      "pgws_chapters",
      "select=id,name,slug,institution,city,state,status,public_description,chapter_type&public_listing=eq.true&status=in.(forming,active)&order=state.asc,name.asc&limit=500",
    );
    return json(res, 200, { chapters });
  } catch (error) {
    return json(res, Number(error.status) || 500, {
      error: "The public PGWS chapter directory is temporarily unavailable.",
    });
  }
}
