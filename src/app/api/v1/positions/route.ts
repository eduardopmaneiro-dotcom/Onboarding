import { apiRoute, jsonBody } from "@/modules/shared/api";
import { createPosition, listPositions } from "@/modules/org/service";

export const GET = apiRoute("carreira.view", (u) => listPositions(u));
export const POST = apiRoute("org.manage", async (u, req) => createPosition(u, await jsonBody(req)));
