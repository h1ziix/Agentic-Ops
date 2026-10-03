import { mutationError } from "@/server/http/mutations";
import { getHistoryPage, parseHistoryParams } from "@/server/services/history-service";

export async function GET(request: Request) {
  try {
    const result = await getHistoryPage(parseHistoryParams(new URL(request.url).searchParams));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return mutationError(error); }
}
