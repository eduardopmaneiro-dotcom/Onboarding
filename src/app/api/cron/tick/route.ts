import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { runTick } from "@/modules/email/digests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rotina periódica: envia avisos de agenda vencidos, faz o fechamento diário no horário
 * configurado e processa a fila (novas tentativas). Chamada pelo Cron da Vercel (cabeçalho
 * Authorization: Bearer CRON_SECRET) ou por um agendador externo com o mesmo segredo.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const r = await runTick();
  return NextResponse.json({ ok: true, ...r });
}
