import { NextResponse } from "next/server";
import { apiRoute, jsonBody } from "@/modules/shared/api";
import { createCandidate, DuplicateCandidateError, listCandidates } from "@/modules/recruitment/candidates";

export const GET = apiRoute("candidatos.view", (u, req) => {
  const sp = new URL(req.url).searchParams;
  return listCandidates(u, { q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, page: Number(sp.get("page")) || 1 });
});
/** 409 com os possíveis duplicados; reenvie com confirmNew=true ou useExistingId. */
export const POST = apiRoute("recrutamento.manage", async (u, req) => {
  try {
    return await createCandidate(u, await jsonBody(req));
  } catch (e) {
    if (e instanceof DuplicateCandidateError) return NextResponse.json({ error: e.message, duplicates: e.matches }, { status: 409 });
    throw e;
  }
});
