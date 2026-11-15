import { apiRoute, jsonBody } from "@/modules/shared/api";
import { createUnit, listUnits } from "@/modules/org/service";

export const GET = apiRoute(null, (u) => listUnits(u));
export const POST = apiRoute("org.manage", async (u, req) => createUnit(u, await jsonBody(req)));
