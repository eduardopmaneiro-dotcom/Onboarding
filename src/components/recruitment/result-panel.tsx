"use client";

import { useState } from "react";
import { ActionForm, Submit } from "@/components/forms";
import type { ActionState } from "@/modules/shared/action";

const OPTIONS: Array<{ value: string; label: string; cls: string }> = [
  { value: "APROVADO", label: "Aprovado", cls: "peer-checked:border-emerald-600 peer-checked:bg-emerald-600 peer-checked:text-white" },
  { value: "REPROVADO", label: "Reprovado", cls: "peer-checked:border-red-600 peer-checked:bg-red-600 peer-checked:text-white" },
  { value: "PENDENTE", label: "Pendente", cls: "peer-checked:border-gold-500 peer-checked:bg-gold-500 peer-checked:text-white" },
  { value: "NAO_COMPARECEU", label: "Não compareceu", cls: "peer-checked:border-stone-600 peer-checked:bg-stone-600 peer-checked:text-white" },
  { value: "DESISTIU", label: "Desistiu", cls: "peer-checked:border-stone-600 peer-checked:bg-stone-600 peer-checked:text-white" },
];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parse = (v: string) => {
  const s = v.replace(/[^\d,.]/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return s && Number.isFinite(n) ? n : null;
};

/** Registro do resultado em poucos cliques: 1 botão + (se reprovado) 1 motivo. Salário é opcional. */
export function ResultPanel({
  action, interviewId, reasons, benefits, current, showSalary, defaultOffer, compact = false,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  interviewId: string;
  reasons: Array<{ id: string; label: string; requiresNote: boolean }>;
  benefits: string[];
  current?: { result?: string; reasonId?: string | null; note?: string | null };
  showSalary: boolean;
  defaultOffer?: string | null;
  compact?: boolean;
}) {
  const [result, setResult] = useState(current?.result && current.result !== "PENDENTE" ? current.result : "");
  const [reasonId, setReasonId] = useState(current?.reasonId ?? "");
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [offer, setOffer] = useState(defaultOffer ?? "");
  const [expected, setExpected] = useState("");
  const needsReason = result === "REPROVADO" || result === "DESISTIU";
  const reason = reasons.find((r) => r.id === reasonId);
  const o = parse(offer), e = parse(expected);
  const gap = o && e ? { v: e - o, p: ((e - o) / o) * 100 } : null;

  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="interviewId" value={interviewId} />
      <div className={`grid gap-2 ${compact ? "grid-cols-5" : "grid-cols-2 sm:grid-cols-5"}`}>
        {OPTIONS.map((opt) => (
          <label key={opt.value} className="cursor-pointer">
            <input type="radio" name="result" value={opt.value} checked={result === opt.value} onChange={() => setResult(opt.value)} className="peer sr-only" />
            <span className={`flex h-full items-center justify-center rounded-lg border border-stone-300 bg-white text-center font-medium leading-tight text-stone-700 transition hover:border-stone-500 ${compact ? "px-1 py-1.5 text-[11px]" : "px-2 py-2 text-xs"} ${opt.cls}`}>{opt.label}</span>
          </label>
        ))}
      </div>

      {needsReason && (
        <div>
          <label htmlFor={`reason-${interviewId}`} className="label">Motivo {result === "REPROVADO" ? "*" : "(opcional)"}</label>
          <select id={`reason-${interviewId}`} name="reasonId" className="input" value={reasonId} onChange={(ev) => setReasonId(ev.target.value)}>
            <option value="">Selecione…</option>
            {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      )}
      {(reason?.requiresNote || !compact) && result && (
        <div>
          <label htmlFor={`note-${interviewId}`} className="label">{reason?.requiresNote ? "Descreva o motivo *" : "Observação (opcional)"}</label>
          <input id={`note-${interviewId}`} name="note" className="input" defaultValue={current?.note ?? ""} placeholder={reason?.requiresNote ? "Ex.: mora longe e o vale-transporte não cobre" : ""} />
        </div>
      )}
      {result === "APROVADO" && (
        <label className="flex items-center gap-2 text-xs text-stone-600">
          <input type="checkbox" name="externalCheck" value="true" className="h-4 w-4 accent-riale-800" /> Enviar também para avaliação externa (AGINCO / sindicância)
        </label>
      )}

      {showSalary && result && !compact && (
        <div className="rounded-lg border border-stone-200">
          <button type="button" onClick={() => setSalaryOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-stone-600">
            Pretensão salarial (opcional) <span>{salaryOpen ? "−" : "+"}</span>
          </button>
          {salaryOpen && (
            <div className="space-y-3 border-t border-stone-100 p-3">
              <div className="grid grid-cols-3 gap-2">
                <div><label className="label">Oferta (R$)</label><input name="offeredSalary" className="input" inputMode="decimal" value={offer} onChange={(ev) => setOffer(ev.target.value)} /></div>
                <div><label className="label">Pretensão (R$)</label><input name="expectedSalary" className="input" inputMode="decimal" value={expected} onChange={(ev) => setExpected(ev.target.value)} /></div>
                <div><label className="label">Último salário</label><input name="lastSalary" className="input" inputMode="decimal" /></div>
              </div>
              {gap && (
                <p className={`text-xs font-medium ${gap.v > 0 ? "text-red-700" : "text-emerald-700"}`}>
                  Diferença: {gap.v > 0 ? "+" : ""}{brl(gap.v)} ({gap.p > 0 ? "+" : ""}{gap.p.toFixed(1)}%) — {gap.v > 0 ? "pretensão acima da oferta" : "pretensão dentro da oferta"}
                </p>
              )}
              <fieldset>
                <legend className="label">Benefícios mais importantes para o candidato</legend>
                <div className="flex flex-wrap gap-1.5">
                  {benefits.map((b) => (
                    <label key={b} className="cursor-pointer">
                      <input type="checkbox" name="valuedBenefits" value={b} className="peer sr-only" />
                      <span className="chip peer-checked:chip-active">{b}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </div>
      )}
      <Submit className="btn-primary w-full" pendingText="Registrando…">Registrar resultado</Submit>
    </ActionForm>
  );
}
