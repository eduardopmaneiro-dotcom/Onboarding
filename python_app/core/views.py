from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.shortcuts import get_object_or_404, redirect, render

from .audit import record_audit
from .models import AuditLog, CareerTrack, ChecklistItem, Employee, OnboardingProcess, OnboardingTemplate, PDI
from .rbac import can
from .scope import employee_scope_queryset


def login_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    if request.method == "POST":
        email = request.POST.get("email", "")
        password = request.POST.get("password", "")
        user = authenticate(request, username=email, password=password)
        if user is not None:
            auth_login(request, user)
            record_audit(
                entity_type="User", entity_id=user.id, action="LOGIN", actor=user, notes="Login efetuado."
            )
            return redirect("dashboard")
        messages.error(request, "E-mail ou senha inválidos.")
    return render(request, "core/login.html")


@login_required
def logout_view(request):
    auth_logout(request)
    return redirect("login")


@login_required
def dashboard(request):
    user = request.user
    employees = employee_scope_queryset(user)
    from django.db.models import Count

    by_unit = employees.values("unit__name").annotate(total=Count("id")).order_by("unit__name")
    by_status = employees.values("status").annotate(total=Count("id")).order_by("status")
    context = {
        "total_employees": employees.count(),
        "by_unit": by_unit,
        "by_status": by_status,
    }
    return render(request, "core/dashboard.html", context)


@login_required
def colaboradores_list(request):
    employees = employee_scope_queryset(request.user).select_related("unit", "department", "position")
    return render(request, "core/colaboradores_list.html", {"employees": employees})


@login_required
def colaborador_detail(request, employee_id):
    employees = employee_scope_queryset(request.user)
    employee = get_object_or_404(employees, id=employee_id)
    onboardings = employee.onboardings.all().prefetch_related("stages")
    pending_checklist = employee.checklist_items.exclude(status="CONCLUIDO")
    pdis = employee.pdis.all()
    return render(
        request,
        "core/colaborador_detail.html",
        {
            "employee": employee,
            "onboardings": onboardings,
            "pending_checklist": pending_checklist,
            "pdis": pdis,
        },
    )


@login_required
def onboarding_list(request):
    employees = employee_scope_queryset(request.user)
    processes = OnboardingProcess.objects.filter(employee__in=employees).select_related("employee", "template")
    return render(request, "core/onboarding_list.html", {"processes": processes})


@login_required
def checklists(request):
    employees = employee_scope_queryset(request.user)
    items = ChecklistItem.objects.filter(employee__in=employees).select_related("employee").order_by("due_date")
    return render(
        request,
        "core/checklists.html",
        {"items": items, "can_validate": can(request.user.role, "validateChecklist")},
    )


@login_required
def complete_checklist_item(request, item_id):
    if request.method != "POST":
        return redirect("checklists")
    employees = employee_scope_queryset(request.user)
    item = get_object_or_404(ChecklistItem, id=item_id, employee__in=employees)
    previous = {"status": item.status}
    item.status = "CONCLUIDO"
    from django.utils import timezone

    item.completed_date = timezone.now().date()
    item.completed_by = request.user.employee
    item.save()
    record_audit(
        entity_type="ChecklistItem",
        entity_id=item.id,
        action="STATUS_CHANGE",
        actor=request.user,
        impacted_employee=item.employee,
        previous_value=previous,
        new_value={"status": item.status},
    )
    return redirect("checklists")


@login_required
def validate_checklist_item(request, item_id):
    if request.method != "POST" or not can(request.user.role, "validateChecklist"):
        return redirect("checklists")
    employees = employee_scope_queryset(request.user)
    item = get_object_or_404(ChecklistItem, id=item_id, employee__in=employees)
    previous = {"validated_by": item.validated_by_id}
    item.validated_by = request.user.employee
    item.save()
    record_audit(
        entity_type="ChecklistItem",
        entity_id=item.id,
        action="APPROVE",
        actor=request.user,
        impacted_employee=item.employee,
        previous_value=previous,
        new_value={"validated_by": item.validated_by_id},
    )
    return redirect("checklists")


@login_required
def pdi_list(request):
    employees = employee_scope_queryset(request.user)
    pdis = PDI.objects.filter(employee__in=employees).select_related("employee")
    return render(request, "core/pdi_list.html", {"pdis": pdis})


@login_required
def carreira(request):
    tracks = CareerTrack.objects.all().prefetch_related("stages")
    return render(request, "core/carreira.html", {"tracks": tracks})


@login_required
def auditoria(request):
    if not can(request.user.role, "viewAudit"):
        return redirect("dashboard")
    logs = AuditLog.objects.all().select_related("actor", "impacted_employee")[:200]
    return render(request, "core/auditoria.html", {"logs": logs})


@login_required
def admin_templates(request):
    if not can(request.user.role, "manageTemplates"):
        return redirect("dashboard")
    templates = OnboardingTemplate.objects.all().prefetch_related("stages").select_related("position")
    return render(request, "core/admin.html", {"templates": templates})
