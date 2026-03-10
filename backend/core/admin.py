from django.contrib import admin
from .models import (
    CustomUser,
    Exam,
    Question,
    StudentExamAttempt,
    ProctoringEvent,
    StudentAnswer,
)

admin.site.register(CustomUser)
admin.site.register(Exam)
admin.site.register(Question)
admin.site.register(StudentExamAttempt)
admin.site.register(ProctoringEvent)
admin.site.register(StudentAnswer)