from django import template

from core.rbac import can as can_fn

register = template.Library()


@register.filter
def can(user, permission):
    if not getattr(user, "is_authenticated", False):
        return False
    return can_fn(user.role, permission)
