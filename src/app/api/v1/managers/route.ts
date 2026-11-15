import { apiRoute, jsonBody } from "@/modules/shared/api";
import { createManager, listManagers } from "@/modules/managers/service";

/** Lista gestores com CPF sempre mascarado. */
export const GET = apiRoute(null, (u, req) => listManagers(u, { departmentId: new URL(req.url).searchParams.get("departmentId") ?? undefined }));
export const POST = apiRoute("managers.manage", async (u, req) => createManager(u, await jsonBody(req)));
