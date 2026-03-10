from django.http import HttpResponse
from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from core.views import me, admin_list_attempts  # plus others you already have

from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from core.views import (
    FaceVerifyView,
    list_exams,
    start_attempt,
    end_attempt,
    admin_list_attempts,
    admin_attempt_events,
    me,
)

urlpatterns = [
    path('api/ping/', lambda request: HttpResponse("pong")),

    # ✅ AUTH (JWT)
    path("api/auth/login/", TokenObtainPairView.as_view(), name="jwt-login"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="jwt-refresh"),
    path("api/auth/me/", me, name="me"),

    path('admin/', admin.site.urls),

    path('api/exams/', list_exams, name='list-exams'),
    path('api/attempts/start/', start_attempt, name='start-attempt'),
    path('api/attempts/end/', end_attempt, name='end-attempt'),

    # ✅ Admin dashboard API
    path('api/admin/attempts/', admin_list_attempts, name='admin-attempts'),

    path('api/face-verify/', FaceVerifyView.as_view(), name='face-verify'),
    
    path('api/admin/attempts/<int:attempt_id>/events/', admin_attempt_events, name="admin-attempt-events"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)