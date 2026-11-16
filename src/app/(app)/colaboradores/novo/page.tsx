import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { todayKey } from "@/lib/datetime";
import { SCHEDULE_LABEL, SHIFT_LABEL } from "@/modules/recruitment/constants";
import { ActionForm, CpfField, Field, SelectField, Submit } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { createEmployeeAction } from "../actions";

export const metadata = { title: "Cadastrar colaborador" };

export default async function NewEmployeePage() {
  const user = await requirePermission("colaboradores.manage");
  const [positions, departments, managers] = await Promise.all([
    prisma.position.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    prisma.department.findMany({ where: { active: true, ...(user.role === "RH" && user.unitId ? { unitId: user.unitId } : {}) }, orderBy: [{ unit: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, unit: { select: { name: true } } } }),
    prisma.manager.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, department: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Cadastrar colaborador já admitido" subtitle="Para quem já trabalhava antes da plataforma — completa a base de tempo de casa e turnover. Novas contratações passam pelo processo de admissão." breadcrumb={{ href: "/colaboradores", label: "Colaboradores" }} />
      <Card className="max-w-4xl">
        <ActionForm action={createEmployeeAction} className="grid gap-4 sm:grid-cols-3">
          <Field name="fullName" label="Nome completo" className="sm:col-span-2" />
          <CpfField />
          <Field name="internalId" label="Matrícula (opcional — vazio gera automática)" />
          <Field name="admissionDate" label="Data de admissão" type="date" max={todayKey()} />
          <SelectField name="contractType" label="Contrato" options={[{ value: "CLT", label: "CLT" }, { value: "PJ", label: "PJ" }, { value: "ESTAGIO", label: "Estágio" }, { value: "TEMPORARIO", label: "Temporário" }, { value: "APRENDIZ", label: "Aprendiz" }]} />
          <SelectField name="positionId" label="Cargo" placeholder="Escolha…" options={positions.map((p) => ({ value: p.id, label: p.title }))} />
          <SelectField name="departmentId" label="Departamento (unidade)" placeholder="Escolha…" options={departments.map((d) => ({ value: d.id, label: `${d.name} — ${d.unit.name}` }))} />
          <SelectField name="managerId" label="Gestor" placeholder="—" options={managers.map((m) => ({ value: m.id, label: `${m.name} (${m.department.name})` }))} />
          <Field name="salary" label="Salário (R$, opcional)" inputMode="decimal" />
          <SelectField name="schedule" label="Escala" placeholder="—" options={Object.entries(SCHEDULE_LABEL).map(([value, label]) => ({ value, label }))} />
          <SelectField name="shift" label="Turno" placeholder="—" options={Object.entries(SHIFT_LABEL).map(([value, label]) => ({ value, label }))} />
          <Field name="email" label="E-mail (opcional)" type="email" />
          <Field name="phone" label="Telefone (opcional)" />
          <p className="text-xs text-stone-500 sm:col-span-3">Se a admissão for recente, os marcos de experiência ainda por vir são criados automaticamente; marcos já passados não geram alerta retroativo.</p>
          <div className="sm:col-span-3"><Submit>Cadastrar</Submit></div>
        </ActionForm>
      </Card>
    </>
  );
}
