from django.contrib import admin

from . import models

admin.site.register(models.User)
admin.site.register(models.Unit)
admin.site.register(models.Department)
admin.site.register(models.CareerTrack)
admin.site.register(models.Position)
admin.site.register(models.CareerStage)
admin.site.register(models.Employee)
admin.site.register(models.OnboardingTemplate)
admin.site.register(models.OnboardingStageTemplate)
admin.site.register(models.ChecklistItemTemplate)
admin.site.register(models.OnboardingProcess)
admin.site.register(models.OnboardingStage)
admin.site.register(models.ChecklistItem)
admin.site.register(models.PDI)
admin.site.register(models.AuditLog)
