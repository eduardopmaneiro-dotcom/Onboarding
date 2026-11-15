"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import type { ActionState } from "@/modules/shared/action";

type Dup = { id: string; fullName: string; phone: string | null; email: string | null; reason: string; lastJob?: string | null };

function Err({ state, name }: { state: ActionState; name: string }) {
  const e = state?.fieldErrors?.[name];
  return e?.length ? <p className="mt-1 text-xs text-red-600">{e.join("; ")}</p> : null;
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Cadastro simples de candidato. Antes de gravar, verifica duplicidade (telefone, e-mail, nome);
 * se houver, mostra os possíveis cadastros e o RH decide: usar o existente ou confirmar um novo.
 */
export function CandidateForm({
  action, jobs, positions, sources, defaultJobId,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  jobs: Array<{ id: string; label: string; positionId: string }>;
  positions: Array<{ id: string; title: string }>;
  sources: Record<string, string>;
  defaultJobId?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [phone, setPhone] = useState("");
  const dups = (state?.data?.duplicates as Dup[] | undefined) ?? [];

  function submitWith(extra: Record<string, string>) {
    const form = ref.current!;
    const fd = new FormData(form);
    fd.set("next", "ver");
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(() => formAction(fd));
  }

  return (
    <form
      ref={ref}
      action={formAction}
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        // Envio controlado: o React não limpa os campos se houver erro ou duplicidade
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null);
        startTransition(() => formAction(fd));
      }}
    >
      {state && !state.ok && !dups.length && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}

      {dups.length > 0 && (
        <div role="alert" className="rounded-xl border border-gold-400 bg-gold-100/60 p-4">
          <p className="font-medium text-riale-900">Encontramos {dups.length === 1 ? "um cadastro parecido" : `${dups.length} cadastros parecidos`}. É a mesma pessoa?</p>
          <ul className="mt-3 space-y-2">
            {dups.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 rounded-lg bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <Link href={`/candidatos/${d.id}`} target="_blank" className="font-medium text-riale-900 hover:underline">{d.fullName}</Link>
                  <p className="text-xs text-stone-500">{[d.phone, d.email, d.lastJob && `última vaga: ${d.lastJob}`].filter(Boolean).join(" · ")}</p>
                  <p className="text-xs text-gold-600">Coincidência: {d.reason}</p>
                </div>
                <button type="button" disabled={pending} onClick={() => submitWith({ useExistingId: d.id })} className="btn-primary btn-sm">Sim, usar este cadastro</button>
              </li>
            ))}
          </ul>
          <button type="button" disabled={pending} onClick={() => submitWith({ confirmNew: "true" })} className="mt-3 text-sm font-medium text-gold-600 hover:underline">
            Não, é outra pessoa — cadastrar mesmo assim
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="fullName" className="label">Nome completo *</label>
          <input id="fullName" name="fullName" className="input" autoComplete="off" autoFocus />
          <Err state={state} name="fullName" />
        </div>
        <div>
          <label htmlFor="phone" className="label">Telefone / WhatsApp *</label>
          <input id="phone" name="phone" className="input" inputMode="tel" placeholder="(21) 99999-9999" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} />
          <Err state={state} name="phone" />
        </div>
        <div>
          <label htmlFor="email" className="label">E-mail (se tiver)</label>
          <input id="email" name="email" type="email" className="input" />
          <Err state={state} name="email" />
        </div>
        <div>
          <label htmlFor="jobOpeningId" className="label">Vaga</label>
          <select id="jobOpeningId" name="jobOpeningId" className="input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">— Sem vaga (banco de talentos) —</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="desiredPositionId" className="label">Cargo pretendido</label>
          {jobId ? (
            <p className="input bg-stone-50 text-stone-500">{positions.find((p) => p.id === jobs.find((j) => j.id === jobId)?.positionId)?.title} <span className="text-xs">(da vaga)</span></p>
          ) : (
            <select id="desiredPositionId" name="desiredPositionId" className="input" defaultValue="">
              <option value="">—</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          )}
        </div>
        <div>
          <label htmlFor="source" className="label">Origem</label>
          <select id="source" name="source" className="input" defaultValue="INDICACAO">
            {Object.entries(sources).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes" className="label">Observações (opcional)</label>
          <textarea id="notes" name="notes" className="input min-h-16" />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" name="next" value="agendar" disabled={pending} className="btn-gold">{pending ? "Salvando…" : "Salvar e agendar entrevista"}</button>
        <button type="submit" name="next" value="ver" disabled={pending} className="btn-primary">Salvar</button>
        <button type="submit" name="next" value="novo" disabled={pending} className="btn-ghost">Salvar e cadastrar outro</button>
      </div>
    </form>
  );
}
