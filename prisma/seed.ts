import { PrismaClient, Role, CareerLevel, OnboardingPeriod, ChecklistItemType, EmployeeStatus, ChecklistOrigin, ChecklistStatus, PDIOrigin, PDIStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ── Unidades (RH-ONB-01 / RH-ONB-02) ──
  const [brisaBarra, imperial, vilamar] = await Promise.all(
    [
      { name: "Brisa Barra", code: "BRISA" },
      { name: "Imperial", code: "IMPERIAL" },
      { name: "Vilamar", code: "VILAMAR" },
    ].map((u) => prisma.unit.upsert({ where: { code: u.code }, update: {}, create: u }))
  );

  // ── Departamentos por unidade (recorte: Brisa Barra como piloto) ──
  const deptNames = ["Recepção", "Governança", "Cozinha", "Salão", "Reservas", "Manutenção", "RH"];
  const depts = await Promise.all(
    deptNames.map((name) =>
      prisma.department.upsert({
        where: { unitId_name: { unitId: brisaBarra.id, name } },
        update: {},
        create: { name, unitId: brisaBarra.id },
      })
    )
  );
  const deptByName = Object.fromEntries(depts.map((d) => [d.name, d]));

  // ── Trilhas de carreira (RH-CAR-01) ──
  const trackRecepcao = await prisma.careerTrack.upsert({
    where: { name: "Recepção e Portaria" },
    update: {},
    create: { name: "Recepção e Portaria" },
  });
  const trackGovernanca = await prisma.careerTrack.upsert({
    where: { name: "Governança e Hospedagem" },
    update: {},
    create: { name: "Governança e Hospedagem" },
  });

  await prisma.careerStage.upsert({
    where: { careerTrackId_level: { careerTrackId: trackRecepcao.id, level: CareerLevel.N1 } },
    update: {},
    create: {
      careerTrackId: trackRecepcao.id,
      level: CareerLevel.N1,
      typicalMonths: "6-12 meses",
      masteryCriteria:
        "Zero queixas formais de hóspede; controle de garagem sem divergência; dominar roteiros de apresentação do hotel",
      order: 1,
    },
  });
  await prisma.careerStage.upsert({
    where: { careerTrackId_level: { careerTrackId: trackRecepcao.id, level: CareerLevel.N2 } },
    update: {},
    create: {
      careerTrackId: trackRecepcao.id,
      level: CareerLevel.N2,
      typicalMonths: "12-24 meses",
      masteryCriteria:
        "Check-in e check-out autônomos em 100% dos casos; Totvs sem erro de tarifa; upselling em >= 30% dos check-ins",
      order: 2,
    },
  });
  await prisma.careerStage.upsert({
    where: { careerTrackId_level: { careerTrackId: trackGovernanca.id, level: CareerLevel.N1 } },
    update: {},
    create: {
      careerTrackId: trackGovernanca.id,
      level: CareerLevel.N1,
      typicalMonths: "6-12 meses",
      masteryCriteria:
        "Executar roteiro de limpeza de áreas comuns com conformidade >= 90%; acionar supervisor diante de não conformidade",
      order: 1,
    },
  });
  await prisma.careerStage.upsert({
    where: { careerTrackId_level: { careerTrackId: trackGovernanca.id, level: CareerLevel.N2 } },
    update: {},
    create: {
      careerTrackId: trackGovernanca.id,
      level: CareerLevel.N2,
      typicalMonths: "12-24 meses",
      masteryCriteria:
        "Arrumar UHs aprovadas na inspeção sem refazer; minibar sem divergência em 100% das UHs",
      order: 2,
    },
  });

  // ── Cargos ──
  const posRecepcionista = await prisma.position.upsert({
    where: { id: "pos-recepcionista" },
    update: {},
    create: {
      id: "pos-recepcionista",
      title: "Recepcionista",
      level: CareerLevel.N2,
      departmentId: deptByName["Recepção"].id,
      careerTrackId: trackRecepcao.id,
    },
  });
  const posGestorRecepcao = await prisma.position.upsert({
    where: { id: "pos-gestor-recepcao" },
    update: {},
    create: {
      id: "pos-gestor-recepcao",
      title: "Supervisor de Recepção",
      level: CareerLevel.N5,
      departmentId: deptByName["Recepção"].id,
      careerTrackId: trackRecepcao.id,
    },
  });
  const posCamareira = await prisma.position.upsert({
    where: { id: "pos-camareira" },
    update: {},
    create: {
      id: "pos-camareira",
      title: "Aux./Assist. de Governança",
      level: CareerLevel.N2,
      departmentId: deptByName["Governança"].id,
      careerTrackId: trackGovernanca.id,
    },
  });
  const posRH = await prisma.position.upsert({
    where: { id: "pos-rh-generalista" },
    update: {},
    create: {
      id: "pos-rh-generalista",
      title: "Analista de RH",
      level: CareerLevel.N3,
      departmentId: deptByName["RH"].id,
    },
  });

  // ── Template de onboarding — As 8 etapas operacionais (RH-ONB-02) ──
  const template = await prisma.onboardingTemplate.upsert({
    where: { id: "tpl-onboarding-padrao" },
    update: {},
    create: { id: "tpl-onboarding-padrao", name: "Onboarding 90 dias — Rede Riale" },
  });

  const stageDefs: Array<{
    name: string;
    period: OnboardingPeriod;
    start: number;
    end: number;
    owner: Role;
    items: Array<{ title: string; type: ChecklistItemType; offset: number }>;
  }> = [
    {
      name: "Etapa 1 — Pré-admissão",
      period: OnboardingPeriod.PERIODO_1,
      start: -7,
      end: -1,
      owner: Role.RH_UNIDADE,
      items: [
        { title: "Mensagem de boas-vindas + acesso ao app Sólides", type: ChecklistItemType.TASK, offset: -5 },
        { title: "Termo de Ciência de Políticas enviado para leitura prévia", type: ChecklistItemType.DOCUMENT_SIGNATURE, offset: -3 },
      ],
    },
    {
      name: "Etapa 2 — Imersão",
      period: OnboardingPeriod.PERIODO_1,
      start: 1,
      end: 2,
      owner: Role.GESTOR,
      items: [
        { title: "Termo de Ciência de Políticas assinado digitalmente", type: ChecklistItemType.DOCUMENT_SIGNATURE, offset: 1 },
        { title: "Tour completo + apresentação da equipe, gestor e buddy", type: ChecklistItemType.TASK, offset: 1 },
        { title: "Termo de Metas (Dias 3-45) assinado", type: ChecklistItemType.DOCUMENT_SIGNATURE, offset: 2 },
        { title: "Plano de carreira apresentado e registrado no PDI", type: ChecklistItemType.MEETING, offset: 2 },
      ],
    },
    {
      name: "Etapa 3 — Aprendizado guiado",
      period: OnboardingPeriod.PERIODO_1,
      start: 3,
      end: 15,
      owner: Role.GESTOR,
      items: [
        { title: "Buddy demonstra os POPs do cargo (3x cada)", type: ChecklistItemType.TRAINING, offset: 9 },
        { title: "Primeira entrega real do cargo sem ajuda direta", type: ChecklistItemType.TASK, offset: 12 },
        { title: "Check de bem-estar — Dia 15", type: ChecklistItemType.SURVEY, offset: 15 },
      ],
    },
    {
      name: "Etapa 4 — Autonomia progressiva",
      period: OnboardingPeriod.PERIODO_1,
      start: 16,
      end: 30,
      owner: Role.GESTOR,
      items: [
        { title: "Conversa de progresso — Dia 21", type: ChecklistItemType.MEETING, offset: 21 },
        { title: "Check-in tripartite (colaborador, gestor, RH) — Dia 30", type: ChecklistItemType.MEETING, offset: 30 },
      ],
    },
    {
      name: "Etapa 5 — Consolidação",
      period: OnboardingPeriod.PERIODO_1,
      start: 31,
      end: 45,
      owner: Role.GESTOR,
      items: [
        { title: "Pré-avaliação — Dia 35", type: ChecklistItemType.MEETING, offset: 35 },
        { title: "Autoavaliação — Dia 40", type: ChecklistItemType.EVALUATION, offset: 40 },
        { title: "Avaliação formal D45 + devolutiva", type: ChecklistItemType.EVALUATION, offset: 45 },
      ],
    },
    {
      name: "Etapa 6 — PDI e transição",
      period: OnboardingPeriod.PERIODO_1,
      start: 46,
      end: 50,
      owner: Role.RH_UNIDADE,
      items: [
        { title: "PDI entregue com metas dos próximos 45 dias", type: ChecklistItemType.TASK, offset: 48 },
        { title: "Conversa de mudança de fase (Dia 50)", type: ChecklistItemType.MEETING, offset: 50 },
      ],
    },
    {
      name: "Etapa 7 — Performance",
      period: OnboardingPeriod.PERIODO_2,
      start: 51,
      end: 90,
      owner: Role.GESTOR,
      items: [
        { title: "Meio de caminho — Dia 60", type: ChecklistItemType.MEETING, offset: 60 },
        { title: "Preparação para avaliação final — Dia 80", type: ChecklistItemType.MEETING, offset: 80 },
        { title: "Autoavaliação final — Dia 83", type: ChecklistItemType.EVALUATION, offset: 83 },
      ],
    },
    {
      name: "Etapa 8 — Decisão",
      period: OnboardingPeriod.PERIODO_2,
      start: 90,
      end: 95,
      owner: Role.RH_UNIDADE,
      items: [
        { title: "Avaliação final D90 e decisão de efetivação", type: ChecklistItemType.EVALUATION, offset: 90 },
      ],
    },
  ];

  for (const [idx, def] of stageDefs.entries()) {
    const stageTemplate = await prisma.onboardingStageTemplate.upsert({
      where: { id: `stp-${idx}` },
      update: {},
      create: {
        id: `stp-${idx}`,
        templateId: template.id,
        period: def.period,
        name: def.name,
        dayRangeStart: def.start,
        dayRangeEnd: def.end,
        ownerRole: def.owner,
        order: idx + 1,
      },
    });
    for (const [itemIdx, item] of def.items.entries()) {
      await prisma.checklistItemTemplate.upsert({
        where: { id: `cit-${idx}-${itemIdx}` },
        update: {},
        create: {
          id: `cit-${idx}-${itemIdx}`,
          stageTemplateId: stageTemplate.id,
          title: item.title,
          type: item.type,
          dueDayOffset: item.offset,
          order: itemIdx + 1,
        },
      });
    }
  }

  // ── Colaboradores ──
  const gestorRecepcao = await prisma.employee.upsert({
    where: { id: "emp-gestor-recepcao" },
    update: {},
    create: {
      id: "emp-gestor-recepcao",
      fullName: "Marina Souza",
      unitId: brisaBarra.id,
      departmentId: deptByName["Recepção"].id,
      positionId: posGestorRecepcao.id,
      status: EmployeeStatus.ATIVO,
      admissionDate: new Date("2022-03-01"),
    },
  });

  const buddyRecepcao = await prisma.employee.upsert({
    where: { id: "emp-buddy-recepcao" },
    update: {},
    create: {
      id: "emp-buddy-recepcao",
      fullName: "Carlos Pereira",
      unitId: brisaBarra.id,
      departmentId: deptByName["Recepção"].id,
      positionId: posRecepcionista.id,
      managerId: gestorRecepcao.id,
      status: EmployeeStatus.ATIVO,
      admissionDate: new Date("2023-01-10"),
    },
  });

  const novoColaborador = await prisma.employee.upsert({
    where: { id: "emp-novo-recepcionista" },
    update: {},
    create: {
      id: "emp-novo-recepcionista",
      fullName: "Júlia Ramos",
      unitId: brisaBarra.id,
      departmentId: deptByName["Recepção"].id,
      positionId: posRecepcionista.id,
      managerId: gestorRecepcao.id,
      buddyId: buddyRecepcao.id,
      status: EmployeeStatus.EM_ONBOARDING,
      admissionDate: new Date(),
    },
  });

  const camareira = await prisma.employee.upsert({
    where: { id: "emp-camareira" },
    update: {},
    create: {
      id: "emp-camareira",
      fullName: "Beatriz Lima",
      unitId: brisaBarra.id,
      departmentId: deptByName["Governança"].id,
      positionId: posCamareira.id,
      managerId: gestorRecepcao.id,
      status: EmployeeStatus.ATIVO,
      admissionDate: new Date("2023-06-01"),
    },
  });

  const rhEmployee = await prisma.employee.upsert({
    where: { id: "emp-rh" },
    update: {},
    create: {
      id: "emp-rh",
      fullName: "Patrícia Gomes",
      unitId: brisaBarra.id,
      departmentId: deptByName["RH"].id,
      positionId: posRH.id,
      status: EmployeeStatus.ATIVO,
      admissionDate: new Date("2021-05-01"),
    },
  });

  // ── Usuários (um por perfil do RBAC) ──
  const passwordHash = await bcrypt.hash("Riale@2026", 10);
  const users: Array<{ id: string; email: string; name: string; role: Role; unitId?: string; employeeId?: string }> = [
    { id: "u-admin", email: "admin@rialehoteis.com.br", name: "Admin Riale", role: Role.ADMIN },
    { id: "u-rhcorp", email: "rh.corporativo@rialehoteis.com.br", name: "RH Corporativo", role: Role.RH_CORPORATIVO },
    { id: "u-rhunidade", email: "rh.brisabarra@rialehoteis.com.br", name: "Patrícia Gomes", role: Role.RH_UNIDADE, unitId: brisaBarra.id, employeeId: rhEmployee.id },
    { id: "u-gestor", email: "marina.souza@rialehoteis.com.br", name: "Marina Souza", role: Role.GESTOR, unitId: brisaBarra.id, employeeId: gestorRecepcao.id },
    { id: "u-colab", email: "julia.ramos@rialehoteis.com.br", name: "Júlia Ramos", role: Role.COLABORADOR, unitId: brisaBarra.id, employeeId: novoColaborador.id },
    { id: "u-diretoria", email: "diretoria@rialehoteis.com.br", name: "Diretoria Riale", role: Role.DIRETORIA_READONLY },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: { ...u, passwordHash },
    });
  }

  // ── Processo de onboarding real para Júlia Ramos ──
  const process = await prisma.onboardingProcess.upsert({
    where: { id: "onb-julia" },
    update: {},
    create: {
      id: "onb-julia",
      employeeId: novoColaborador.id,
      templateId: template.id,
      startDate: new Date(),
    },
  });

  const stageTemplates = await prisma.onboardingStageTemplate.findMany({
    where: { templateId: template.id },
    include: { checklistItemTemplates: true },
    orderBy: { order: "asc" },
  });

  for (const [idx, st] of stageTemplates.entries()) {
    const stage = await prisma.onboardingStage.upsert({
      where: { id: `os-julia-${idx}` },
      update: {},
      create: {
        id: `os-julia-${idx}`,
        processId: process.id,
        name: st.name,
        period: st.period,
        order: st.order,
        status: idx === 0 ? "CONCLUIDA" : idx === 1 ? "EM_ANDAMENTO" : "PENDENTE",
        responsibleId: st.ownerRole === Role.GESTOR ? gestorRecepcao.id : rhEmployee.id,
      },
    });

    for (const [itemIdx, cit] of st.checklistItemTemplates.entries()) {
      await prisma.checklistItem.upsert({
        where: { id: `ci-julia-${idx}-${itemIdx}` },
        update: {},
        create: {
          id: `ci-julia-${idx}-${itemIdx}`,
          title: cit.title,
          type: cit.type,
          origin: ChecklistOrigin.ONBOARDING,
          employeeId: novoColaborador.id,
          onboardingStageId: stage.id,
          responsibleId: st.ownerRole === Role.GESTOR ? gestorRecepcao.id : rhEmployee.id,
          dueDate: new Date(Date.now() + cit.dueDayOffset * 86400000),
          status: idx === 0 ? ChecklistStatus.CONCLUIDO : ChecklistStatus.PENDENTE,
        },
      });
    }
  }

  // ── PDI de exemplo ──
  await prisma.pDI.upsert({
    where: { id: "pdi-julia-1" },
    update: {},
    create: {
      id: "pdi-julia-1",
      employeeId: novoColaborador.id,
      onboardingProcessId: process.id,
      origin: PDIOrigin.PLANO_CARREIRA,
      gapDescription: "Ainda em curva de aprendizado no Totvs para emissão de tarifas.",
      developmentGoal: "Realizar check-in completo sem erro de tarifa em 100% dos atendimentos.",
      recommendedAction: "Acompanhamento diário do buddy por 2 semanas + treinamento Totvs na Sólides.",
      executorId: novoColaborador.id,
      monitorId: gestorRecepcao.id,
      status: PDIStatus.EM_ANDAMENTO,
      completionPct: 30,
      dueDate: new Date(Date.now() + 30 * 86400000),
    },
  });

  console.log("Seed concluído.");
  console.log("Usuários (senha para todos: Riale@2026):");
  users.forEach((u) => console.log(`  ${u.role.padEnd(20)} ${u.email}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
