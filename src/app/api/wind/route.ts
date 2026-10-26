import { timestampSchema } from "../../../lib/domain";
import { loadWind, WindError } from "../../../server/wind-provider";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const query = new URL(request.url).searchParams;
    const at = query.get("at");
    if (!at || !timestampSchema.safeParse(at).success)
      throw new WindError("Use an ISO timestamp with an explicit timezone.", 400);
    return Response.json(
      await loadWind(query.get("source") ?? "demo", at, query.get("scenario") ?? "varied"),
      { headers },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof WindError ? error.message : "Wind unavailable for this time." },
      { status: error instanceof WindError ? error.status : 503, headers },
    );
  }
}
