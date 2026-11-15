"use client";

import { useMemo, useState } from "react";
import { ActionForm, Field, SelectField, Submit, TextAreaField } from "@/components/forms";
import type { ActionState } from "@/modules/shared/action";

type Opt = {
  units: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; unitId: string }>;
  positions: Array<{ id: string; title: string; level: string; defaultDepartmentName: string | null }>;
  managers: Array<{ id: string; name: string; departmentId: string; unitId: string; label: string }>;
};
type Labels = { schedule: Record<string, string>; shift: Record<string, string>; status: Record<string, string> };
type Defaults = Partial<{
  id: string; positionId: string; unitId: string; departmentId: string; requestingManagerId: string; headcount: number; openedAt: string;
  expectedSalary: string; schedule: string; shift: string; weeklyHours: number; workHours: string; status: string; description: string;
}>;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Formulário de vaga: unidade → departamento → gestor vêm da estrutura (nada é digitado). */
export function JobForm({ action, options, labels, defaults = {}, today }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; options: Opt; labels: Labels; defaults?: Defaults; today: string }) {
  const [positionId, setPositionId] = useState(defaults.positionId ?? "");
  const [unitId, setUnitId] = useState(defaults.unitId ?? (options.units.length === 1 ? options.units[0].id : ""));
  const [departmentId, setDepartmentId] = useState(defaults.departmentId ?? "");
  const [managerId, setManagerId] = useState(defaults.requestingManagerId ?? "");

  const depts = useMemo(() => options.departments.filter((d) => d.unitId === unitId), [options.departments, unitId]);
  const managers = useMemo(() => {
    const inDept = options.managers.filter((m) => m.departmentId === departmentId);
    const inUnit = options.managers.filter((m) => m.unitId === unitId && m.departmentId !== departmentId);
    return { inDept, inUnit };
  }, [options.managers, departmentId, unitId]);

  function suggestDept(posId: string, uId: string) {
    const p = options.positions.find((x) => x.id === posId);
    if (!p?.defaultDepartmentName) return;
    const d = options.departments.find((x) => x.unitId === uId && norm(x.name) === norm(p.defaultDepartmentName!));
    if (d) pickDept(d.id);
  }
  function pickDept(id: string) {
    setDepartmentId(id);
    const ms = options.managers.filter((m) => m.departmentId === id);
    setManagerId(ms.length === 1 ? ms[0].id : "");
  }
  const mgr = options.managers.find((m) => m.id === managerId);

  return (
    <ActionForm action={action} className="space-y-6">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-riale-900">1. Cargo e local</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField name="positionId" label="Cargo *" placeholder="Selecione o cargo…" value={positionId}
            onChange={(e) => { setPositionId(e.target.value); if (unitId) suggestDept(e.target.value, unitId); }}
            options={options.positions.map((p) => ({ value: p.id, label: `${p.title} (${p.level})` }))} />
          <SelectField name="unitId" label="Unidade *" placeholder="Selecione a unidade…" value={unitId}
            onChange={(e) => { setUnitId(e.target.value); setDepartmentId(""); setManagerId(""); if (positionId) suggestDept(positionId, e.target.value); }}
            options={options.units.map((u) => ({ value: u.id, label: u.name }))} />
          <SelectField name="departmentId" label="Departamento *" placeholder={unitId ? "Selecione…" : "Escolha a unidade primeiro"} value={departmentId}
            onChange={(e) => pickDept(e.target.value)} disabled={!unitId} options={depts.map((d) => ({ value: d.id, label: d.name }))} />
          <div>
            <label htmlFor="requestingManagerId" className="label">Gestor responsável</label>
            <select id="requestingManagerId" name="requestingManagerId" className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)} disabled={!departmentId}>
              <option value="">{departmentId ? (managers.inDept.length ? "Selecione…" : "Nenhum gestor neste departamento") : "Escolha o departamento"}</option>
              {managers.inDept.length > 0 && <optgroup label="Gestores do departamento">{managers.inDept.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>}
              {managers.inUnit.length > 0 && <optgroup label="Outros gestores da unidade">{managers.inUnit.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>}
            </select>
            <p className="mt-1 text-xs text-stone-400">{mgr ? "Receberá os candidatos aprovados pelo RH." : "Cadastre gestores em Configurações › Gestores."}</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-riale-900">2. Condições</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field name="headcount" label="Quantidade de vagas *" type="number" min={1} defaultValue={defaults.headcount ?? 1} />
          <Field name="openedAt" label="Data de abertura *" type="date" defaultValue={defaults.openedAt ?? today} />
          <Field name="expectedSalary" label="Salário previsto (R$)" inputMode="decimal" placeholder="Ex.: 2.150,00" defaultValue={defaults.expectedSalary ?? ""} />
          <SelectField name="schedule" label="Escala" placeholder="—" defaultValue={defaults.schedule ?? ""} options={Object.entries(labels.schedule).map(([value, label]) => ({ value, label }))} />
          <SelectField name="shift" label="Turno" placeholder="—" defaultValue={defaults.shift ?? ""} options={Object.entries(labels.shift).map(([value, label]) => ({ value, label }))} />
          <Field name="weeklyHours" label="Jornada semanal (h)" type="number" min={1} max={60} placeholder="44" defaultValue={defaults.weeklyHours ?? ""} />
          <Field name="workHours" label="Horário" placeholder="Ex.: 07:00 às 15:20" defaultValue={defaults.workHours ?? ""} className="sm:col-span-2" />
          <SelectField name="status" label="Status" defaultValue={defaults.status ?? "ABERTA"} options={Object.entries(labels.status).map(([value, label]) => ({ value, label }))} />
        </div>
      </section>

      <TextAreaField name="description" label="Observações (opcional)" defaultValue={defaults.description ?? ""} placeholder="Requisitos, informações para o RH…" />
      <div className="flex gap-3">
        <Submit className="btn-primary">{defaults.id ? "Salvar alterações" : "Criar vaga"}</Submit>
      </div>
    </ActionForm>
  );
}
