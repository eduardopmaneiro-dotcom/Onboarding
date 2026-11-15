"use client";

import { useMemo, useState } from "react";
import { ActionForm, Submit } from "@/components/forms";
import type { ActionState } from "@/modules/shared/action";
import { formatPhone } from "@/lib/text";

type Job = { id: string; label: string; unit: string; department: string; manager: string | null };
type Cand = { id: string; name: string; phone: string | null; jobIds: string[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Agendamento: escolhe a vaga (unidade, departamento e gestor aparecem sozinhos),
 * data, horário e um ou vários candidatos. Vários candidatos → horários em sequência ou no mesmo horário.
 */
export function ScheduleForm({
  action, jobs, candidates, interviewers, me, defaults,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  jobs: Job[];
  candidates: Cand[];
  interviewers: Array<{ id: string; name: string }>;
  me: string;
  defaults: { jobId?: string; candidateIds?: string[]; date: string; time: string };
}) {
  const [jobId, setJobId] = useState(defaults.jobId ?? "");
  const [selected, setSelected] = useState<string[]>(defaults.candidateIds ?? []);
  const [q, setQ] = useState("");
  const [time, setTime] = useState(defaults.time);
  const [duration, setDuration] = useState(30);
  const [sequential, setSequential] = useState(true);
  const job = jobs.find((j) => j.id === jobId);

  const list = useMemo(() => {
    const term = norm(q.trim());
    const base = candidates.filter((c) => !term || norm(c.name).includes(term) || (c.phone ?? "").includes(term.replace(/\D/g, "") || "§"));
    // candidatos já vinculados à vaga primeiro
    return base.sort((a, b) => Number(b.jobIds.includes(jobId)) - Number(a.jobIds.includes(jobId)) || a.name.localeCompare(b.name)).slice(0, 60);
  }, [candidates, q, jobId]);

  const slot = (i: number) => {
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h)) return "";
    const t = h * 60 + m + (sequential ? i * duration : 0);
    return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <ActionForm action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div>
          <label htmlFor="jobOpeningId" className="label">Vaga *</label>
          <select id="jobOpeningId" name="jobOpeningId" className="input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">Selecione a vaga…</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
          </select>
        </div>
        {job && (
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-riale-50 p-3 text-xs">
            <div><dt className="text-stone-500">Unidade</dt><dd className="font-medium text-riale-900">{job.unit}</dd></div>
            <div><dt className="text-stone-500">Departamento</dt><dd className="font-medium text-riale-900">{job.department}</dd></div>
            <div><dt className="text-stone-500">Gestor</dt><dd className="font-medium text-riale-900">{job.manager ?? "—"}</dd></div>
          </dl>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div><label htmlFor="date" className="label">Data *</label><input id="date" name="date" type="date" className="input" defaultValue={defaults.date} /></div>
          <div><label htmlFor="time" className="label">Horário *</label><input id="time" name="time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          <div>
            <label htmlFor="durationMin" className="label">Duração</label>
            <select id="durationMin" name="durationMin" className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[15, 20, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="interviewerUserId" className="label">Entrevistador</label>
          <select id="interviewerUserId" name="interviewerUserId" className="input" defaultValue={me}>
            {interviewers.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === me ? " (você)" : ""}</option>)}
          </select>
        </div>
        <div><label htmlFor="location" className="label">Local (opcional)</label><input id="location" name="location" className="input" placeholder="Ex.: Sala do RH — Brisa Barra" /></div>
        {selected.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" name="sequential" value="true" checked={sequential} onChange={(e) => setSequential(e.target.checked)} className="h-4 w-4 accent-riale-800" />
            Horários em sequência (um a cada {duration} min)
          </label>
        )}
        {!sequential && <input type="hidden" name="sequential" value="false" />}
        <Submit className="btn-gold w-full">{selected.length > 1 ? `Agendar ${selected.length} entrevistas` : "Agendar entrevista"}</Submit>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-riale-900">Candidatos * <span className="font-normal text-stone-500">({selected.length} selecionado{selected.length === 1 ? "" : "s"})</span></p>
          <a href={`/candidatos/novo${jobId ? `?vaga=${jobId}` : ""}`} className="text-xs font-medium text-gold-600 hover:underline">+ novo candidato</a>
        </div>
        <input className="input mt-3" placeholder="Buscar por nome ou telefone…" value={q} onChange={(e) => setQ(e.target.value)} />
        {selected.map((id) => <input key={id} type="hidden" name="candidateIds" value={id} />)}
        <ul className="mt-3 max-h-[420px] divide-y divide-stone-100 overflow-y-auto">
          {list.map((c) => {
            const i = selected.indexOf(c.id);
            return (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 px-1 py-2 hover:bg-riale-50">
                  <input type="checkbox" checked={i >= 0} onChange={() => toggle(c.id)} className="h-4 w-4 accent-riale-800" />
                  <span className="flex-1 text-sm">
                    {c.name}
                    {jobId && c.jobIds.includes(jobId) && <span className="ml-2 rounded bg-gold-100 px-1.5 text-[10px] text-gold-600">já na vaga</span>}
                    <span className="block text-xs text-stone-400">{c.phone ? formatPhone(c.phone) : "sem telefone"}</span>
                  </span>
                  {i >= 0 && <span className="font-mono text-xs text-riale-700">{slot(i)}</span>}
                </label>
              </li>
            );
          })}
          {!list.length && <li className="py-6 text-center text-sm text-stone-400">Nenhum candidato encontrado.</li>}
        </ul>
      </div>
    </ActionForm>
  );
}
