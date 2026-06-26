from django.urls import path

from . import views

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("colaboradores/", views.colaboradores_list, name="colaboradores_list"),
    path("colaboradores/<str:employee_id>/", views.colaborador_detail, name="colaborador_detail"),
    path("onboarding/", views.onboarding_list, name="onboarding_list"),
    path("checklists/", views.checklists, name="checklists"),
    path("checklists/<str:item_id>/concluir/", views.complete_checklist_item, name="complete_checklist_item"),
    path("checklists/<str:item_id>/validar/", views.validate_checklist_item, name="validate_checklist_item"),
    path("pdi/", views.pdi_list, name="pdi_list"),
    path("carreira/", views.carreira, name="carreira"),
    path("auditoria/", views.auditoria, name="auditoria"),
    path("admin-templates/", views.admin_templates, name="admin_templates"),
]
