"use client";

import { useState } from "react";
import { ActionForm, Submit } from "@/components/forms";
import type { ActionState } from "@/modules/shared/action";

/** Decisão do gestor: aprovar, reprovar (justificativa obrigatória) ou pedir nova entrevista. */
export function DecisionPanel({
  action, reviewId, reasons, onBehalfOf,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  reviewId: string;
  reasons: Array<{ id: string; label: string }>;
  onBehalfOf?: string | null;
}) {
  const [decision, setDecision] = useState("");
  const opts = [
    { v: "APROVADO", l: "Aprovar", c: "peer-checked:bg-emerald-600 peer-checked:border-emerald-600 peer-checked:text-white" },
    { v: "REPROVADO", l: "Reprovar", c: "peer-checked:bg-red-600 peer-checked:border-red-600 peer-checked:text-white" },
    { v: "NOVA_ENTREVISTA", l: "Nova entrevista", c: "peer-checked:bg-gold-500 peer-checked:border-gold-500 peer-checked:text-white" },
  ];
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="reviewId" value={reviewId} />
      {onBehalfOf && <p className="rounded bg-gold-100 px-2 py-1 text-xs text-gold-600">Você está registrando a decisão em nome de {onBehalfOf}. Informe como ela foi tomada.</p>}
      <div className="grid grid-cols-3 gap-2">
        {opts.map((o) => (
          <label key={o.v} className="cursor-pointer">
            <input type="radio" name="decision" value={o.v} checked={decision === o.v} onChange={() => setDecision(o.v)} className="peer sr-only" />
            <span className={`block rounded-lg border border-stone-300 bg-white px-2 py-2 text-center text-xs font-medium text-stone-700 hover:border-stone-500 ${o.c}`}>{o.l}</span>
          </label>
        ))}
      </div>
      {decision === "REPROVADO" && (
        <select name="reasonId" className="input" defaultValue="">
          <option value="">Motivo (opcional)…</option>
          {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      )}
      {decision && (
        <textarea
          name="justification"
          className="input min-h-16"
          placeholder={decision === "REPROVADO" || onBehalfOf ? "Justificativa (obrigatória)" : decision === "NOVA_ENTREVISTA" ? "O que avaliar na nova entrevista? (opcional)" : "Comentário (opcional)"}
        />
      )}
      <Submit className="btn-primary w-full">Confirmar decisão</Submit>
    </ActionForm>
  );
}
