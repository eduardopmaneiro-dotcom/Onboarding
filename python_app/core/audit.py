from .models import AuditLog


def record_audit(
    *,
    entity_type,
    entity_id,
    action,
    actor,
    impacted_employee=None,
    previous_value=None,
    new_value=None,
    justification=None,
    notes=None,
):
    """Grava em AuditLog antes de responder ao usuário. Nunca editado/apagado depois."""
    return AuditLog.objects.create(
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
        actor=actor,
        actor_role=actor.role,
        impacted_employee=impacted_employee,
        previous_value=previous_value,
        new_value=new_value,
        justification=justification,
        notes=notes,
    )
