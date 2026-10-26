import { timestampSchema } from "../../../lib/domain";
import { DataError, dataErrorResponse, loadSnapshot, getTimeline } from "../../../server/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if (query.get("timeline") === "1")
      return Response.json(getTimeline(), { headers: { "Cache-Control": "no-store" } });
    if (process.env.DATA_MODE === "live")
      return Response.json(
        {
          error:
            "Public live-data proxy disabled. Current observations are available through the dashboard's bounded server-rendered requests.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    const at = query.get("at");
    if (at !== null && !timestampSchema.safeParse(at).success)
      throw new DataError("Use an ISO timestamp with an explicit timezone.", 400);
    const snapshot = await loadSnapshot(at ?? undefined);
    return Response.json(snapshot, {
      status: snapshot.status === "available" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return dataErrorResponse(error);
  }
}
