import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


def gen_id():
    return uuid.uuid4().hex


ROLE_CHOICES = [
    ("ADMIN", "Admin"),
    ("RH_CORPORATIVO", "RH Corporativo"),
    ("RH_UNIDADE", "RH Unidade"),
    ("GESTOR", "Gestor"),
    ("COLABORADOR", "Colaborador"),
    ("DIRETORIA_READONLY", "Diretoria (somente leitura)"),
]

CAREER_LEVEL_CHOICES = [(f"N{i}", f"N{i}") for i in range(1, 8)]

ONBOARDING_PERIOD_CHOICES = [
    ("PERIODO_1", "Período 1 — D-7 a D45 (adaptação/padronização)"),
    ("PERIODO_2", "Período 2 — D46 a D90 (produtividade/autonomia)"),
]

CHECKLIST_ITEM_TYPE_CHOICES = [
    ("DOCUMENT_SIGNATURE", "Assinatura de documento"),
    ("TRAINING", "Treinamento"),
    ("MEETING", "Reunião"),
    ("EVALUATION", "Avaliação"),
    ("TASK", "Tarefa"),
    ("SURVEY", "Pesquisa"),
]

STAGE_STATUS_CHOICES = [
    ("PENDENTE", "Pendente"),
    ("EM_ANDAMENTO", "Em andamento"),
    ("CONCLUIDA", "Concluída"),
    ("ATRASADA", "Atrasada"),
    ("REABERTA", "Reaberta"),
]

CHECKLIST_STATUS_CHOICES = [
    ("PENDENTE", "Pendente"),
    ("EM_ANDAMENTO", "Em andamento"),
    ("CONCLUIDO", "Concluído"),
    ("ATRASADO", "Atrasado"),
    ("CANCELADO", "Cancelado"),
]

CHECKLIST_ORIGIN_CHOICES = [
    ("ONBOARDING", "Onboarding"),
    ("CAREER_TRACK", "Plano de carreira"),
    ("PDI", "PDI"),
    ("PDL", "PDL"),
]

PRIORITY_CHOICES = [
    ("BAIXA", "Baixa"),
    ("MEDIA", "Média"),
    ("ALTA", "Alta"),
    ("CRITICA", "Crítica"),
]

EMPLOYEE_STATUS_CHOICES = [
    ("PRE_ADMISSAO", "Pré-admissão"),
    ("EM_ONBOARDING", "Em onboarding"),
    ("ATIVO", "Ativo"),
    ("PERIODO_ESTENDIDO", "Período estendido"),
    ("DESVINCULADO", "Desvinculado"),
]

ONBOARDING_STATUS_CHOICES = [
    ("ATIVO", "Ativo"),
    ("CONCLUIDO", "Concluído"),
    ("ENCERRADO_PERIODO_EXPERIENCIA", "Encerrado (período de experiência)"),
    ("ESTENDIDO", "Estendido"),
]

PDI_ORIGIN_CHOICES = [
    ("AVALIACAO_ONBOARDING", "Avaliação de onboarding"),
    ("AVALIACAO_EXPERIENCIA", "Avaliação de experiência"),
    ("FEEDBACK_GESTOR", "Feedback do gestor"),
    ("PLANO_CARREIRA", "Plano de carreira"),
    ("GAP_RH", "Gap identificado pelo RH"),
    ("SOLIDES_IMPORT", "Importado do Sólides"),
    ("PDL", "PDL"),
]

PDI_STATUS_CHOICES = [
    ("ABERTO", "Aberto"),
    ("EM_ANDAMENTO", "Em andamento"),
    ("CONCLUIDO", "Concluído"),
    ("CANCELADO", "Cancelado"),
]

AUDIT_ACTION_CHOICES = [
    ("CREATE", "Criação"),
    ("UPDATE", "Atualização"),
    ("DELETE", "Exclusão"),
    ("STATUS_CHANGE", "Mudança de status"),
    ("APPROVE", "Aprovação"),
    ("REJECT", "Rejeição"),
    ("REOPEN", "Reabertura"),
    ("LOGIN", "Login"),
    ("EXPORT", "Exportação"),
]


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        email = self.normalize_email(email)
        user = self.model(email=email, username=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "ADMIN")
        extra_fields.setdefault("name", email)
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    """Usuário do sistema. Login é feito por e-mail (USERNAME_FIELD)."""

    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=200)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    active = models.BooleanField(default=True)
    unit = models.ForeignKey("Unit", null=True, blank=True, on_delete=models.SET_NULL, related_name="users")
    employee = models.OneToOneField(
        "Employee", null=True, blank=True, on_delete=models.SET_NULL, related_name="user"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return f"{self.name} ({self.email})"


class Unit(models.Model):
    """Brisa Barra, Imperial, Vilamar."""

    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=20, unique=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Department(models.Model):
    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    name = models.CharField(max_length=120)
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="departments")
    active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("unit", "name")

    def __str__(self):
        return f"{self.name} · {self.unit.name}"


class CareerTrack(models.Model):
    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(null=True, blank=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Position(models.Model):
    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    title = models.CharField(max_length=150)
    level = models.CharField(max_length=2, choices=CAREER_LEVEL_CHOICES)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name="positions")
    career_track = models.ForeignKey(
        CareerTrack, null=True, blank=True, on_delete=models.SET_NULL, related_name="positions"
    )
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.title} ({self.level})"


class CareerStage(models.Model):
    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    career_track = models.ForeignKey(CareerTrack, on_delete=models.CASCADE, related_name="stages")
    level = models.CharField(max_length=2, choices=CAREER_LEVEL_CHOICES)
    typical_months = models.CharField(max_length=60, null=True, blank=True)
    mastery_criteria = models.TextField()
    order = models.IntegerField()

    class Meta:
        unique_together = ("career_track", "level")
        ordering = ["order"]

    def __str__(self):
        return f"{self.career_track.name} — {self.level}"


class Employee(models.Model):
    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    full_name = models.CharField(max_length=200)
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="employees")
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name="employees")
    position = models.ForeignKey(Position, on_delete=models.CASCADE, related_name="employees")
    manager = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="reports"
    )
    buddy = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="buddy_for"
    )
    status = models.CharField(max_length=30, choices=EMPLOYEE_STATUS_CHOICES, default="PRE_ADMISSAO")
    admission_date = models.DateField()
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.full_name


class OnboardingTemplate(models.Model):
    """Template oficial — apenas ADMIN/RH_CORPORATIVO podem alterar a estrutura."""

    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    name = models.CharField(max_length=150)
    position = models.ForeignKey(
        Position, null=True, blank=True, on_delete=models.SET_NULL, related_name="onboarding_templates"
    )
    active = models.BooleanField(default=True)
    version = models.CharField(max_length=30, default="v01/2026")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class OnboardingStageTemplate(models.Model):
    """As 8 etapas operacionais do RH-ONB-02."""

    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    template = models.ForeignKey(OnboardingTemplate, on_delete=models.CASCADE, related_name="stages")
    period = models.CharField(max_length=20, choices=ONBOARDING_PERIOD_CHOICES)
    name = models.CharField(max_length=150)
    day_range_start = models.IntegerField()
    day_range_end = models.IntegerField()
    owner_role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    order = models.IntegerField()

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.name


class ChecklistItemTemplate(models.Model):
    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    stage_template = models.ForeignKey(
        OnboardingStageTemplate, on_delete=models.CASCADE, related_name="checklist_item_templates"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(null=True, blank=True)
    type = models.CharField(max_length=30, choices=CHECKLIST_ITEM_TYPE_CHOICES)
    due_day_offset = models.IntegerField()
    order = models.IntegerField()

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.title


class OnboardingProcess(models.Model):
    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="onboardings")
    template = models.ForeignKey(OnboardingTemplate, on_delete=models.PROTECT, related_name="processes")
    start_date = models.DateField()
    status = models.CharField(max_length=40, choices=ONBOARDING_STATUS_CHOICES, default="ATIVO")
    extended_until = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Onboarding {self.employee.full_name}"


class OnboardingStage(models.Model):
    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    process = models.ForeignKey(OnboardingProcess, on_delete=models.CASCADE, related_name="stages")
    name = models.CharField(max_length=150)
    period = models.CharField(max_length=20, choices=ONBOARDING_PERIOD_CHOICES)
    due_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STAGE_STATUS_CHOICES, default="PENDENTE")
    responsible = models.ForeignKey(
        Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="responsible_stages"
    )
    reopened_reason = models.TextField(null=True, blank=True)
    order = models.IntegerField()

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.name


class PDI(models.Model):
    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="pdis")
    onboarding_process = models.ForeignKey(
        OnboardingProcess, null=True, blank=True, on_delete=models.SET_NULL, related_name="pdis"
    )
    origin = models.CharField(max_length=30, choices=PDI_ORIGIN_CHOICES)
    gap_description = models.TextField()
    development_goal = models.TextField()
    recommended_action = models.TextField()
    executor = models.ForeignKey(
        Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="pdi_executor_for"
    )
    monitor = models.ForeignKey(
        Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="pdi_monitor_for"
    )
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=PDI_STATUS_CHOICES, default="ABERTO")
    evidence_url = models.CharField(max_length=300, null=True, blank=True)
    checkpoint_notes = models.TextField(null=True, blank=True)
    final_opinion = models.TextField(null=True, blank=True)
    completion_pct = models.FloatField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"PDI {self.employee.full_name}"


class ChecklistItem(models.Model):
    """Checklist compartilhado entre Onboarding, Carreira, PDI e PDL."""

    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    title = models.CharField(max_length=200)
    description = models.TextField(null=True, blank=True)
    type = models.CharField(max_length=30, choices=CHECKLIST_ITEM_TYPE_CHOICES)
    origin = models.CharField(max_length=20, choices=CHECKLIST_ORIGIN_CHOICES)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="checklist_items")
    onboarding_stage = models.ForeignKey(
        OnboardingStage, null=True, blank=True, on_delete=models.CASCADE, related_name="checklist_items"
    )
    pdi = models.ForeignKey(
        PDI, null=True, blank=True, on_delete=models.CASCADE, related_name="checklist_items"
    )
    responsible = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="checklist_responsible_for",
    )
    due_date = models.DateField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=CHECKLIST_STATUS_CHOICES, default="PENDENTE")
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default="MEDIA")
    observation = models.TextField(null=True, blank=True)
    justification = models.TextField(null=True, blank=True)
    evidence_url = models.CharField(max_length=300, null=True, blank=True)
    completed_by = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="checklist_completed_for",
    )
    validated_by = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="checklist_validated_for",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class AuditLog(models.Model):
    """Trilha de auditoria imutável — toda mutação relevante grava um registro antes de responder."""

    id = models.CharField(primary_key=True, default=gen_id, editable=False, max_length=32)
    entity_type = models.CharField(max_length=80)
    entity_id = models.CharField(max_length=80)
    action = models.CharField(max_length=20, choices=AUDIT_ACTION_CHOICES)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="audit_logs")
    actor_role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    impacted_employee = models.ForeignKey(
        Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_impacted"
    )
    previous_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    justification = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} {self.entity_type}#{self.entity_id}"
