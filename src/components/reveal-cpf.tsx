"use client";

import { useState, useTransition } from "react";

/** Mostra o CPF mascarado; ao clicar, revela via server action (registrada na auditoria como PII_ACCESS). */
export function RevealCpf({ masked, reveal }: { masked: string; reveal: () => Promise<{ ok: boolean; value?: string; message?: string }> }) {
  const [value, setValue] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (value) return <span className="font-mono text-xs text-slate-900">{value}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-xs text-slate-500">{masked}</span>
      <button
        type="button"
        disabled={pending}
        title="Revelar CPF (acesso registrado em auditoria)"
        className="text-[11px] font-medium text-gold-600 hover:underline disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const r = await reveal();
            if (r.ok && r.value) setValue(r.value);
            else setErr(r.message ?? "Sem permissão");
          })
        }
      >
        {pending ? "…" : "revelar"}
      </button>
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </span>
  );
}
