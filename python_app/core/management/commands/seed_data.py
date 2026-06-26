import datetime

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import (
    AuditLog,
    CareerStage,
    CareerTrack,
    ChecklistItem,
    ChecklistItemTemplate,
    Department,
    Employee,
    OnboardingProcess,
    OnboardingStage,
    OnboardingStageTemplate,
    OnboardingTemplate,
    PDI,
    Position,
    Unit,
    User,
)

PASSWORD = "Riale@2026"

STAGE_DEFS = [
    ("PERIODO_1", "Etapa 1 — Pré-admissão", -7, 0, "RH_UNIDADE"),
    ("PERIODO_1", "Etapa 2 — Imersão", 1, 7, "GESTOR"),
    ("PERIODO_1", "Etapa 3 — Padronização de POPs", 8, 20, "GESTOR"),
    ("PERIODO_1", "Etapa 4 — Acompanhamento de buddy", 15, 30, "GESTOR"),
    ("PERIODO_1", "Etapa 5 — Avaliação D45", 31, 45, "RH_UNIDADE"),
    ("PERIODO_2", "Etapa 6 — Autonomia operacional", 46, 65, "GESTOR"),
    ("PERIODO_2", "Etapa 7 — Metas de produtividade", 66, 89, "GESTOR"),
    ("PERIODO_2", "Etapa 8 — Avaliação D90", 90, 90, "RH_UNIDADE"),
]


class Command(BaseCommand):
    help = "Popula unidades, cargos, trilhas, template de onboarding e usuários de teste."

    @transaction.atomic
    def handle(self, *args, **options):
        AuditLog.objects.all().delete()
        ChecklistItem.objects.all().delete()
        OnboardingStage.objects.all().delete()
        OnboardingProcess.objects.all().delete()
        PDI.objects.all().delete()
        ChecklistItemTemplate.objects.all().delete()
        OnboardingStageTemplate.objects.all().delete()
        OnboardingTemplate.objects.all().delete()
        Employee.objects.all().delete()
        Position.objects.all().delete()
        CareerStage.objects.all().delete()
        CareerTrack.objects.all().delete()
        Department.objects.all().delete()
        Unit.objects.all().delete()
        User.objects.all().delete()

        brisa = Unit.objects.create(name="Brisa Barra", code="BBA")
        Unit.objects.create(name="Imperial", code="IMP")
        Unit.objects.create(name="Vilamar", code="VIL")

        recepcao = Department.objects.create(name="Recepção e Portaria", unit=brisa)
        governanca = Department.objects.create(name="Governança e Hospedagem", unit=brisa)
        rh_dept = Department.objects.create(name="RH", unit=brisa)

        trilha_recepcao = CareerTrack.objects.create(
            name="Recepção e Portaria", description="Trilha de recepção e portaria"
        )
        trilha_governanca = CareerTrack.objects.create(
            name="Governança e Hospedagem", description="Trilha de governança e hospedagem"
        )

        for trilha in (trilha_recepcao, trilha_governanca):
            for i, level in enumerate(["N1", "N2", "N3"], start=1):
                CareerStage.objects.create(
                    career_track=trilha,
                    level=level,
                    typical_months="12-24 meses",
                    mastery_criteria=f"Critérios de domínio para avançar a {level} na trilha {trilha.name}.",
                    order=i,
                )

        cargo_recepcionista = Position.objects.create(
            title="Recepcionista", level="N1", department=recepcao, career_track=trilha_recepcao
        )
        Position.objects.create(
            title="Recepcionista Sênior", level="N2", department=recepcao, career_track=trilha_recepcao
        )
        cargo_camareira = Position.objects.create(
            title="Camareira", level="N1", department=governanca, career_track=trilha_governanca
        )
        cargo_gestor = Position.objects.create(
            title="Gestor de Unidade", level="N4", department=recepcao, career_track=trilha_recepcao
        )
        cargo_rh = Position.objects.create(title="Analista de RH", level="N3", department=rh_dept)

        marina = Employee.objects.create(
            full_name="Marina Souza",
            unit=brisa,
            department=recepcao,
            position=cargo_gestor,
            status="ATIVO",
            admission_date=datetime.date(2023, 1, 10),
        )
        carlos = Employee.objects.create(
            full_name="Carlos Pereira",
            unit=brisa,
            department=recepcao,
            position=Position.objects.get(title="Recepcionista Sênior"),
            manager=marina,
            status="ATIVO",
            admission_date=datetime.date(2023, 6, 1),
        )
        julia = Employee.objects.create(
            full_name="Júlia Ramos",
            unit=brisa,
            department=recepcao,
            position=cargo_recepcionista,
            manager=marina,
            buddy=carlos,
            status="EM_ONBOARDING",
            admission_date=datetime.date.today() - datetime.timedelta(days=20),
        )
        beatriz = Employee.objects.create(
            full_name="Beatriz Lima",
            unit=brisa,
            department=governanca,
            position=cargo_camareira,
            status="ATIVO",
            admission_date=datetime.date(2024, 2, 1),
        )
        patricia = Employee.objects.create(
            full_name="Patrícia Gomes",
            unit=brisa,
            department=rh_dept,
            position=cargo_rh,
            status="ATIVO",
            admission_date=datetime.date(2022, 3, 1),
        )

        users = [
            ("admin@rialehoteis.com.br", "Admin Riale", "ADMIN", None, None),
            ("rh.corporativo@rialehoteis.com.br", "RH Corporativo", "RH_CORPORATIVO", None, None),
            ("rh.brisabarra@rialehoteis.com.br", "RH Brisa Barra", "RH_UNIDADE", brisa, patricia),
            ("marina.souza@rialehoteis.com.br", "Marina Souza", "GESTOR", brisa, marina),
            ("julia.ramos@rialehoteis.com.br", "Júlia Ramos", "COLABORADOR", brisa, julia),
            ("diretoria@rialehoteis.com.br", "Diretoria", "DIRETORIA_READONLY", None, None),
        ]
        created_users = {}
        for email, name, role, unit, employee in users:
            user = User.objects.create_user(
                email=email, password=PASSWORD, name=name, role=role, unit=unit, employee=employee
            )
            created_users[email] = user

        template = OnboardingTemplate.objects.create(
            name="Template oficial de onboarding", position=cargo_recepcionista
        )
        stage_templates = []
        for i, (period, name, start, end, owner_role) in enumerate(STAGE_DEFS, start=1):
            st = OnboardingStageTemplate.objects.create(
                template=template,
                period=period,
                name=name,
                day_range_start=start,
                day_range_end=end,
                owner_role=owner_role,
                order=i,
            )
            stage_templates.append(st)
            ChecklistItemTemplate.objects.create(
                stage_template=st,
                title=f"Checklist — {name}",
                description=f"Item padrão de checklist para {name}.",
                type="TASK",
                due_day_offset=end,
                order=1,
            )

        process = OnboardingProcess.objects.create(
            employee=julia, template=template, start_date=julia.admission_date
        )
        for i, st in enumerate(stage_templates, start=1):
            due = julia.admission_date + datetime.timedelta(days=st.day_range_end)
            status = "CONCLUIDA" if st.day_range_end < 20 else "EM_ANDAMENTO" if st.day_range_start <= 20 else "PENDENTE"
            stage = OnboardingStage.objects.create(
                process=process,
                name=st.name,
                period=st.period,
                due_date=due,
                completed_date=due if status == "CONCLUIDA" else None,
                status=status,
                responsible=marina,
                order=i,
            )
            for cit in st.checklist_item_templates.all():
                ChecklistItem.objects.create(
                    title=cit.title,
                    description=cit.description,
                    type=cit.type,
                    origin="ONBOARDING",
                    employee=julia,
                    onboarding_stage=stage,
                    responsible=marina,
                    due_date=due,
                    status="CONCLUIDO" if status == "CONCLUIDA" else "PENDENTE",
                    completed_date=due if status == "CONCLUIDA" else None,
                    completed_by=marina if status == "CONCLUIDA" else None,
                )

        PDI.objects.create(
            employee=julia,
            onboarding_process=process,
            origin="AVALIACAO_ONBOARDING",
            gap_description="Dificuldade em seguir o script de atendimento telefônico.",
            development_goal="Atingir 100% de conformidade no script de atendimento.",
            recommended_action="Treinamento prático com o buddy + checklist de acompanhamento semanal.",
            executor=carlos,
            monitor=marina,
            due_date=julia.admission_date + datetime.timedelta(days=45),
            completion_pct=30,
        )

        AuditLog.objects.create(
            entity_type="OnboardingProcess",
            entity_id=process.id,
            action="CREATE",
            actor=created_users["rh.brisabarra@rialehoteis.com.br"],
            actor_role="RH_UNIDADE",
            impacted_employee=julia,
            new_value={"status": "ATIVO"},
            notes="Onboarding criado via seed.",
        )

        self.stdout.write(self.style.SUCCESS("Seed concluído: 3 unidades, 1 onboarding real, 6 usuários."))
