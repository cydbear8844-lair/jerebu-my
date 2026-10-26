import { DataError, dataErrorResponse, getHistory, historyQuerySchema } from "../../../server/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const result = historyQuerySchema.safeParse({
      stationId: params.get("stationId"),
      start: params.get("start"),
      end: params.get("end"),
    });
    if (!result.success)
      throw new DataError("Provide stationId, start and end with explicit ISO timezones.", 400);
    const { stationId, start, end } = result.data;
    return Response.json(getHistory(stationId, start, end), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return dataErrorResponse(error);
  }
}
