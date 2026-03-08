from django.http import HttpResponse
from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static

from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from core.views import (
    FaceVerifyView,
    list_exams,
    exam_questions,
    start_attempt,
    end_attempt,
    submit_answers,
    admin_list_attempts,
    me,
)

urlpatterns = [
    path('api/ping/', lambda request: HttpResponse("pong")),

    # AUTH
    path("api/auth/login/", TokenObtainPairView.as_view(), name="jwt-login"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="jwt-refresh"),
    path("api/auth/me/", me, name="me"),

    path('admin/', admin.site.urls),

    # Exams
    path('api/exams/', list_exams, name='list-exams'),
    path('api/exams/<int:exam_id>/questions/', exam_questions, name='exam-questions'),

    # Attempts
    path('api/attempts/start/', start_attempt, name='start-attempt'),
    path('api/attempts/end/', end_attempt, name='end-attempt'),
    path('api/attempts/<int:attempt_id>/submit-answers/', submit_answers, name='submit-answers'),

    # Admin
    path('api/admin/attempts/', admin_list_attempts, name='admin-attempts'),

    # Proctoring
    path('api/face-verify/', FaceVerifyView.as_view(), name='face-verify'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)