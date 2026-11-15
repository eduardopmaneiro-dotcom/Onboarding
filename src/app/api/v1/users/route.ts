import { apiRoute, jsonBody } from "@/modules/shared/api";
import { createUser, listUsers } from "@/modules/users/service";

export const GET = apiRoute("users.view", (u) => listUsers(u));
export const POST = apiRoute("users.manage", async (u, req) => createUser(u, await jsonBody(req)));
