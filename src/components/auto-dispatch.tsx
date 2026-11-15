"use client";

import { useEffect } from "react";

/**
 * Enquanto alguém do RH está com a plataforma aberta, processa a fila de comunicação
 * a cada minuto (avisos consolidados, fechamento no horário, novas tentativas).
 * Complementa o cron — que no plano gratuito da Vercel roda só uma vez por dia.
 */
export function AutoDispatch({ tick }: { tick: () => Promise<void> }) {
  useEffect(() => {
    let alive = true;
    const run = () => { if (alive && document.visibilityState !== "hidden") tick().catch(() => undefined); };
    const first = setTimeout(run, 5_000);
    const id = setInterval(run, 60_000);
    return () => { alive = false; clearTimeout(first); clearInterval(id); };
  }, [tick]);
  return null;
}
