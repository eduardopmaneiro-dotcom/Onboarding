from django.db.models import Q

from .models import Employee


def employee_scope_queryset(user):
    """Espelha src/lib/scope.ts — nunca lista colaboradores além do escopo do papel."""
    qs = Employee.objects.all()
    if user.role in ("ADMIN", "RH_CORPORATIVO", "DIRETORIA_READONLY"):
        return qs
    if user.role == "RH_UNIDADE":
        return qs.filter(unit_id=user.unit_id)
    if user.role == "GESTOR":
        return qs.filter(manager_id=user.employee_id)
    if user.role == "COLABORADOR":
        return qs.filter(id=user.employee_id)
    return qs.none()
