import { getSetting } from "@/modules/settings/service";
import { parseMilestones, type ProbationRule } from "@/modules/people/rules";

/** Regra da experiência vigente (Configurações › Admissões). */
export async function currentRule(): Promise<ProbationRule & { leadDays: number; email: boolean }> {
  const [m, count, lead, email] = await Promise.all([
    getSetting("experiencia.marcos"), getSetting("experiencia.conta_dia_admissao"), getSetting("experiencia.aviso_dias"), getSetting("experiencia.alerta_email"),
  ]);
  return { milestones: parseMilestones(m), countAdmissionDay: count, leadDays: lead, email };
}
