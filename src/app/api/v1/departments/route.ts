import { apiRoute, jsonBody } from "@/modules/shared/api";
import { createDepartment, listDepartments } from "@/modules/org/service";

export const GET = apiRoute(null, (u, req) => listDepartments(u, { unitId: new URL(req.url).searchParams.get("unitId") ?? undefined }));
export const POST = apiRoute("org.manage", async (u, req) => createDepartment(u, await jsonBody(req)));
