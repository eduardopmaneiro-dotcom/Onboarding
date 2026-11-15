import { apiRoute, jsonBody } from "@/modules/shared/api";
import { listInterviews, scheduleInterviews } from "@/modules/recruitment/workflow";
import { addDays, localToDate, todayKey } from "@/lib/datetime";

export const GET = apiRoute("entrevistas.view", (u, req) => {
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? todayKey();
  const to = sp.get("to") ?? addDays(from, 7);
  return listInterviews(u, localToDate(from), localToDate(to), { unitId: sp.get("unitId") ?? undefined });
});
export const POST = apiRoute("recrutamento.manage", async (u, req) => scheduleInterviews(u, await jsonBody(req)));
