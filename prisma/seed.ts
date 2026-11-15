/**
 * Seed da Fase 1 — idempotente (pode rodar várias vezes).
 * Carrega: catálogo de permissões, 3 unidades, departamentos, catálogo de cargos,
 * trilhas de carreira (RH-CAR-01), template de onboarding (RH-ONB-02),
 * gestores com hierarquia, usuários de teste e configurações padrão.
 */
import { PrismaClient, CareerLevel, OnboardingPeriod, ChecklistItemType, StageOwner, type Role } from "@prisma/client";
import { PERMISSION_CATALOG } from "../src/lib/permissions";
import { protectCpf, cpfHash } from "../src/lib/cpf";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

/** Gera um CPF válido a partir de 9 dígitos base (apenas para dados de teste). */
function testCpf(base9: string): string {
  const d = base9.split("").map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
    const r = (sum * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

export const SEED_PASSWORD = "Riale@2026Seguro";

export const TEST_USERS: Array<{ key: string; name: string; email: string; cpfBase: string; role: Role; unit?: string; manager?: string }> = [
  { key: "admin", name: "Administrador do Sistema", email: "admin@rialehoteis.com.br", cpfBase: "529982247", role: "ADMIN" },
  { key: "rhcorp", name: "Carla Mendes", email: "rh@rialehoteis.com.br", cpfBase: "111444777", role: "RH" },
  { key: "rhbrisa", name: "Paulo Henrique Lima", email: "rh.brisabarra@rialehoteis.com.br", cpfBase: "390533447", role: "RH", unit: "BRISA" },
  { key: "gestor", name: "Marina Souza", email: "marina.souza@rialehoteis.com.br", cpfBase: "168995350", role: "GESTOR", manager: "marina" },
];

async function main() {
  // ── Permissões (catálogo + concessões padrão) ──
  for (const [code, def] of Object.entries(PERMISSION_CATALOG)) {
    const p = await prisma.permission.upsert({
      where: { code },
      update: { module: def.module, description: def.description },
      create: { code, module: def.module, description: def.description },
    });
    for (const role of def.defaults) {
      await prisma.rolePermission.upsert({ where: { role_permissionId: { role, permissionId: p.id } }, update: {}, create: { role, permissionId: p.id } });
    }
  }

  // ── Unidades ──
  const unitsDef = [
    { name: "Brisa Barra", code: "BRISA", city: "Rio de Janeiro", state: "RJ" },
    { name: "Imperial", code: "IMPERIAL", city: "Rio de Janeiro", state: "RJ" },
    { name: "Vilamar", code: "VILAMAR", city: "Rio de Janeiro", state: "RJ" },
  ];
  const units: Record<string, { id: string }> = {};
  for (const u of unitsDef) units[u.code] = await prisma.unit.upsert({ where: { code: u.code }, update: {}, create: u });

  // ── Departamentos (mesma estrutura nas três unidades) ──
  const deptNames: Array<[string, string]> = [
    ["Diretoria", "DIR"], ["Recursos Humanos", "RH"], ["Recepção", "REC"], ["Governança", "GOV"],
    ["A&B — Cozinha", "COZ"], ["A&B — Salão", "SAL"], ["Reservas e Comercial", "COM"],
    ["Manutenção", "MAN"], ["Controladoria", "CTL"],
  ];
  const dept: Record<string, Record<string, { id: string }>> = {};
  for (const [code, unit] of Object.entries(units)) {
    dept[code] = {};
    for (const [name, dcode] of deptNames) {
      dept[code][dcode] = await prisma.department.upsert({
        where: { unitId_name: { unitId: unit.id, name } },
        update: {},
        create: { name, code: dcode, unitId: unit.id },
      });
    }
  }

  // ── Trilhas de carreira (RH-CAR-01) ──
  const tracksDef: Array<{ name: string; stages: Array<[CareerLevel, string, string]> }> = [
    {
      name: "Recepção e Portaria",
      stages: [
        [CareerLevel.N1, "6-12 meses", "Zero queixas formais de hóspede; controle de garagem sem divergência; dominar roteiros de apresentação do hotel"],
        [CareerLevel.N2, "12-24 meses", "Check-in e check-out autônomos em 100% dos casos; Totvs sem erro de tarifa; upselling em >= 30% dos check-ins"],
      ],
    },
    {
      name: "Governança e Hospedagem",
      stages: [
        [CareerLevel.N1, "6-12 meses", "Executar roteiro de limpeza de áreas comuns com conformidade >= 90%; acionar supervisor diante de não conformidade"],
        [CareerLevel.N2, "12-24 meses", "Arrumar UHs aprovadas na inspeção sem refazer; minibar sem divergência em 100% das UHs"],
      ],
    },
    { name: "A&B — Cozinha", stages: [] },
    { name: "A&B — Salão", stages: [] },
    { name: "Reservas, Comercial e Eventos", stages: [] },
    { name: "Manutenção", stages: [] },
    { name: "RH, Controladoria e Marketing", stages: [] },
  ];
  const tracks: Record<string, { id: string }> = {};
  for (const t of tracksDef) {
    tracks[t.name] = await prisma.careerTrack.upsert({ where: { name: t.name }, update: {}, create: { name: t.name } });
    for (const [i, [level, months, criteria]] of t.stages.entries()) {
      await prisma.careerStage.upsert({
        where: { careerTrackId_level: { careerTrackId: tracks[t.name].id, level } },
        update: {},
        create: { careerTrackId: tracks[t.name].id, level, typicalMonths: months, masteryCriteria: criteria, order: i + 1 },
      });
    }
  }

  // ── Catálogo corporativo de cargos ──
  const positionsDef: Array<{ key: string; title: string; level: CareerLevel; track?: string; leadership?: boolean }> = [
    { key: "dir", title: "Gerente Geral", level: CareerLevel.N7, leadership: true },
    { key: "recep", title: "Recepcionista", level: CareerLevel.N2, track: "Recepção e Portaria" },
    { key: "suprec", title: "Supervisor de Recepção", level: CareerLevel.N5, track: "Recepção e Portaria", leadership: true },
    { key: "camar", title: "Camareira", level: CareerLevel.N2, track: "Governança e Hospedagem" },
    { key: "govern", title: "Governanta", level: CareerLevel.N5, track: "Governança e Hospedagem", leadership: true },
    { key: "chef", title: "Chef de Cozinha", level: CareerLevel.N6, track: "A&B — Cozinha", leadership: true },
    { key: "maitre", title: "Maître", level: CareerLevel.N5, track: "A&B — Salão", leadership: true },
    { key: "gercom", title: "Gerente Comercial", level: CareerLevel.N6, track: "Reservas, Comercial e Eventos", leadership: true },
    { key: "supman", title: "Supervisor de Manutenção", level: CareerLevel.N5, track: "Manutenção", leadership: true },
    { key: "analrh", title: "Analista de RH", level: CareerLevel.N3, track: "RH, Controladoria e Marketing" },
    { key: "coordrh", title: "Coordenador de RH", level: CareerLevel.N5, track: "RH, Controladoria e Marketing", leadership: true },
  ];
  const pos: Record<string, { id: string }> = {};
  for (const p of positionsDef) {
    pos[p.key] = await prisma.position.upsert({
      where: { title: p.title },
      update: {},
      create: { title: p.title, level: p.level, isLeadership: !!p.leadership, careerTrackId: p.track ? tracks[p.track].id : null },
    });
  }

  // ── Gestores (com superior direto) ──
  const managersDef: Array<{ key: string; name: string; email: string; cpfBase?: string; internalId?: string; pos: string; unit: string; dept: string; superior?: string }> = [
    { key: "gg_brisa", name: "Ricardo Albuquerque", email: "ricardo.albuquerque@rialehoteis.com.br", internalId: "BR-0001", pos: "dir", unit: "BRISA", dept: "DIR" },
    { key: "marina", name: "Marina Souza", email: "marina.souza@rialehoteis.com.br", cpfBase: "168995350", internalId: "BR-0102", pos: "suprec", unit: "BRISA", dept: "REC", superior: "gg_brisa" },
    { key: "joao", name: "João Batista Rocha", email: "joao.rocha@rialehoteis.com.br", internalId: "BR-0108", pos: "suprec", unit: "BRISA", dept: "REC", superior: "gg_brisa" },
    { key: "lucia", name: "Lúcia Ferreira", email: "lucia.ferreira@rialehoteis.com.br", internalId: "BR-0120", pos: "govern", unit: "BRISA", dept: "GOV", superior: "gg_brisa" },
    { key: "gg_imp", name: "Fernanda Castro", email: "fernanda.castro@rialehoteis.com.br", internalId: "IM-0001", pos: "dir", unit: "IMPERIAL", dept: "DIR" },
    { key: "chef_imp", name: "André Moura", email: "andre.moura@rialehoteis.com.br", internalId: "IM-0230", pos: "chef", unit: "IMPERIAL", dept: "COZ", superior: "gg_imp" },
    { key: "gg_vila", name: "Roberto Nogueira", email: "roberto.nogueira@rialehoteis.com.br", internalId: "VL-0001", pos: "dir", unit: "VILAMAR", dept: "DIR" },
  ];
  const mgr: Record<string, { id: string }> = {};
  for (const m of managersDef) {
    mgr[m.key] = await prisma.manager.upsert({
      where: { email: m.email },
      update: {},
      create: {
        name: m.name,
        email: m.email,
        internalId: m.internalId,
        ...(m.cpfBase ? protectCpf(testCpf(m.cpfBase)) : {}),
        positionId: pos[m.pos].id,
        departmentId: dept[m.unit][m.dept].id,
        directSuperiorId: m.superior ? mgr[m.superior].id : null,
      },
    });
  }

  // ── Usuários de teste ──
  const passwordHash = await hashPassword(SEED_PASSWORD);
  for (const u of TEST_USERS) {
    const cpf = testCpf(u.cpfBase);
    const existing = await prisma.user.findUnique({ where: { cpfHash: cpfHash(cpf) } });
    const user =
      existing ??
      (await prisma.user.create({
        data: {
          name: u.name,
          email: u.email,
          ...protectCpf(cpf),
          role: u.role,
          unitId: u.unit ? units[u.unit].id : u.manager ? units.BRISA.id : null,
          passwordHash,
          passwordChangedAt: new Date(0),
        },
      }));
    if (u.manager) await prisma.manager.update({ where: { id: mgr[u.manager].id }, data: { userId: user.id } });
  }

  // ── Template de onboarding — 8 etapas (RH-ONB-02), preservado do MVP ──
  const template = await prisma.onboardingTemplate.upsert({
    where: { id: "tpl-onboarding-padrao" },
    update: {},
    create: { id: "tpl-onboarding-padrao", name: "Onboarding 90 dias — Riale Hotéis" },
  });
  const stageDefs: Array<{ name: string; period: OnboardingPeriod; start: number; end: number; owner: StageOwner; items: Array<[string, ChecklistItemType, number]> }> = [
    { name: "Etapa 1 — Pré-admissão", period: "PERIODO_1", start: -7, end: -1, owner: "RH", items: [["Mensagem de boas-vindas + acesso ao app Sólides", "TASK", -5], ["Termo de Ciência de Políticas enviado para leitura prévia", "DOCUMENT_SIGNATURE", -3]] },
    { name: "Etapa 2 — Imersão", period: "PERIODO_1", start: 1, end: 2, owner: "GESTOR", items: [["Termo de Ciência de Políticas assinado digitalmente", "DOCUMENT_SIGNATURE", 1], ["Tour completo + apresentação da equipe, gestor e buddy", "TASK", 1], ["Termo de Metas (Dias 3-45) assinado", "DOCUMENT_SIGNATURE", 2], ["Plano de carreira apresentado e registrado no PDI", "MEETING", 2]] },
    { name: "Etapa 3 — Aprendizado guiado", period: "PERIODO_1", start: 3, end: 15, owner: "BUDDY", items: [["Buddy demonstra os POPs do cargo (3x cada)", "TRAINING", 9], ["Primeira entrega real do cargo sem ajuda direta", "TASK", 12], ["Check de bem-estar — Dia 15", "SURVEY", 15]] },
    { name: "Etapa 4 — Autonomia progressiva", period: "PERIODO_1", start: 16, end: 30, owner: "GESTOR", items: [["Conversa de progresso — Dia 21", "MEETING", 21], ["Check-in tripartite (colaborador, gestor, RH) — Dia 30", "MEETING", 30]] },
    { name: "Etapa 5 — Consolidação", period: "PERIODO_1", start: 31, end: 45, owner: "GESTOR", items: [["Pré-avaliação — Dia 35", "MEETING", 35], ["Autoavaliação — Dia 40", "EVALUATION", 40], ["Avaliação formal D45 + devolutiva", "EVALUATION", 45]] },
    { name: "Etapa 6 — PDI e transição", period: "PERIODO_1", start: 46, end: 50, owner: "RH", items: [["PDI entregue com metas dos próximos 45 dias", "TASK", 48], ["Conversa de mudança de fase (Dia 50)", "MEETING", 50]] },
    { name: "Etapa 7 — Performance", period: "PERIODO_2", start: 51, end: 90, owner: "GESTOR", items: [["Meio de caminho — Dia 60", "MEETING", 60], ["Preparação para avaliação final — Dia 80", "MEETING", 80], ["Autoavaliação final — Dia 83", "EVALUATION", 83]] },
    { name: "Etapa 8 — Decisão", period: "PERIODO_2", start: 90, end: 95, owner: "RH", items: [["Avaliação final D90 e decisão de efetivação", "EVALUATION", 90]] },
  ];
  for (const [idx, def] of stageDefs.entries()) {
    const st = await prisma.onboardingStageTemplate.upsert({
      where: { id: `stp-${idx}` },
      update: {},
      create: { id: `stp-${idx}`, templateId: template.id, period: def.period, name: def.name, dayRangeStart: def.start, dayRangeEnd: def.end, owner: def.owner, order: idx + 1 },
    });
    for (const [j, [title, type, offset]] of def.items.entries()) {
      await prisma.checklistItemTemplate.upsert({
        where: { id: `cit-${idx}-${j}` },
        update: {},
        create: { id: `cit-${idx}-${j}`, stageTemplateId: st.id, title, type, dueDayOffset: offset, order: j + 1 },
      });
    }
  }

  console.log("Seed concluído.");
  console.log(`Senha dos usuários de teste: ${SEED_PASSWORD}`);
  for (const u of TEST_USERS) console.log(`  ${u.role.padEnd(7)} CPF ${testCpf(u.cpfBase).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")}  (${u.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
