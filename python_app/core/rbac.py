PERMISSIONS = {
    "manageTemplates": ["ADMIN", "RH_CORPORATIVO"],
    "manageUsers": ["ADMIN"],
    "manageOrgStructure": ["ADMIN", "RH_CORPORATIVO"],
    "viewAllUnits": ["ADMIN", "RH_CORPORATIVO", "DIRETORIA_READONLY"],
    "viewUnit": ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE", "GESTOR", "DIRETORIA_READONLY"],
    "createOnboarding": ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE"],
    "editOnboardingStage": ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE", "GESTOR"],
    "reopenStage": ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE"],
    "createPDI": ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE", "GESTOR"],
    "validateChecklist": ["ADMIN", "RH_CORPORATIVO", "RH_UNIDADE", "GESTOR"],
    "viewAudit": ["ADMIN", "RH_CORPORATIVO", "DIRETORIA_READONLY"],
    "exportReports": ["ADMIN", "RH_CORPORATIVO", "DIRETORIA_READONLY"],
}


def can(role, permission):
    return role in PERMISSIONS.get(permission, [])


def is_self_service_only(role):
    return role == "COLABORADOR"
