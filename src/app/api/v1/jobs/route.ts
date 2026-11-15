import { apiRoute, jsonBody } from "@/modules/shared/api";
import { createJob, listJobs } from "@/modules/recruitment/jobs";

export const GET = apiRoute("vagas.view", (u, req) => {
  const sp = new URL(req.url).searchParams;
  return listJobs(u, { status: sp.get("status") ?? undefined, unitId: sp.get("unitId") ?? undefined });
});
export const POST = apiRoute("recrutamento.manage", async (u, req) => createJob(u, await jsonBody(req)));
