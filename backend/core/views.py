# core/views.py
import os
import traceback

from django.conf import settings
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from deepface import DeepFace
from ultralytics import YOLO

from .models import CustomUser, StudentExamAttempt, Exam, ProctoringEvent
from .serializers import ExamSerializer, AttemptListSerializer, ProctoringEventSerializer

# DeepFace / Tensorflow env settings
os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    return Response({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_student": user.is_student,
        "is_admin": user.is_admin,
    })


# List exams for dropdown
@api_view(["GET"])
def list_exams(request):
    exams = Exam.objects.all().order_by("-start_time")
    serializer = ExamSerializer(exams, many=True)
    return Response(serializer.data)


# Admin dashboard: List all attempts with score + review info
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_list_attempts(request):
    if not getattr(request.user, "is_admin", False):
        return Response({"error": "Admin access required"}, status=403)

    attempts = (
        StudentExamAttempt.objects
        .select_related("student", "exam")
        .order_by("-start_time")
    )
    serializer = AttemptListSerializer(attempts, many=True)
    return Response(serializer.data)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_attempt_events(request, attempt_id):
    if not getattr(request.user, "is_admin", False):
        return Response({"error": "Admin access Required"}, status=403)
    
    try:
        attempt = StudentExamAttempt.objects.get(id=attempt_id)
    except StudentExamAttempt.DoesNotExist:
        return Response({"error": "Attempt not found"}, status=404)
    
    events = attempt.events.all().order_by("-timestamp")
    
    serializer = ProctoringEventSerializer(events, many=True)
    return Response(serializer.data)

# Start an exam attempt
@api_view(["POST"])
def start_attempt(request):
    user_id = request.data.get("user_id")
    exam_id = request.data.get("exam_id")

    if not user_id or not exam_id:
        return Response({"error": "user_id and exam_id required"}, status=400)

    try:
        student = CustomUser.objects.get(id=user_id)
    except CustomUser.DoesNotExist:
        return Response({"error": "User not found"}, status=404)

    if not student.is_student:
        return Response({"error": "Only students can start attempts"}, status=403)

    try:
        exam = Exam.objects.get(id=exam_id)
    except Exam.DoesNotExist:
        return Response({"error": "Exam not found"}, status=404)

    attempt, created = StudentExamAttempt.objects.get_or_create(
        student=student,
        exam=exam,
        defaults={"status": "ongoing", "suspicion_score": 0.0},
    )

    if not created and attempt.status != "ongoing":
        return Response(
            {"error": f"Attempt already exists with status '{attempt.status}'"},
            status=400,
        )

    return Response(
        {
            "attempt_id": attempt.id,
            "status": attempt.status,
            "suspicion_score": float(attempt.suspicion_score),
            "message": "Attempt started",
        }
    )


@api_view(["POST"])
def end_attempt(request):
    attempt_id = request.data.get("attempt_id")

    if not attempt_id:
        return Response({"error": "attempt_id required"}, status=400)

    try:
        attempt = StudentExamAttempt.objects.get(id=attempt_id)
    except StudentExamAttempt.DoesNotExist:
        return Response({"error": "Attempt not found"}, status=404)

    if attempt.status != "ongoing":
        return Response(
            {"error": f"Attempt already ended (status: {attempt.status})"},
            status=400,
        )

    attempt.status = "submitted"
    attempt.end_time = timezone.now()
    attempt.save(update_fields=["status", "end_time"])

    return Response(
        {
            "message": "Exam ended successfully",
            "attempt_id": attempt.id,
            "final_suspicion_score": float(attempt.suspicion_score),
            "status": attempt.status,
            "end_time": attempt.end_time,
        }
    )


class FaceVerifyView(APIView):
    parser_classes = (MultiPartParser, FormParser)

    try:
        YOLO_WEIGHTS_PATH = os.path.join(settings.BASE_DIR, "yolov8n.pt")
        yolo_model = YOLO(YOLO_WEIGHTS_PATH)
        print("YOLOv8 loaded successfully")
    except Exception as e:
        print(f"YOLO load failed: {e}")
        yolo_model = None

    FACE_DISTANCE_THRESHOLD = 0.68
    FLAG_THRESHOLD = 50.0

    def detect_cheating_objects(self, image_path):
        if self.yolo_model is None:
            return [], 0

        try:
            results = self.yolo_model(image_path, verbose=False)
            suspicious_objects = []
            person_count = 0

            for r in results:
                for box in r.boxes:
                    cls = int(box.cls[0])
                    label = r.names[cls]
                    conf = float(box.conf[0])

                    if label == "person" and conf > 0.45:
                        person_count += 1

                    if label in ["cell phone", "book", "laptop"] and conf > 0.45:
                        suspicious_objects.append(f"{label} ({conf:.2f})")

            return suspicious_objects, person_count

        except Exception as e:
            print(f"YOLO error: {e}")
            return [], 0

    def post(self, request):
        attempt_id = request.data.get("attempt_id")
        user_id = request.data.get("user_id")
        live_image = request.FILES.get("live_image")

        if not live_image:
            return Response({"error": "live_image required"}, status=400)

        live_path = None

        try:
            attempt = None
            user = None

            if attempt_id:
                try:
                    attempt = StudentExamAttempt.objects.select_related("student", "exam").get(id=attempt_id)
                    user = attempt.student
                except StudentExamAttempt.DoesNotExist:
                    return Response({"error": "Attempt not found"}, status=404)

                if attempt.status != "ongoing":
                    return Response(
                        {"error": f"Attempt is not ongoing (status: {attempt.status})"},
                        status=400,
                    )
            else:
                if not user_id:
                    return Response({"error": "attempt_id (preferred) or user_id required"}, status=400)

                try:
                    user = CustomUser.objects.get(id=user_id)
                except CustomUser.DoesNotExist:
                    return Response({"error": "User not found"}, status=404)

                attempt = (
                    StudentExamAttempt.objects.filter(student=user, status="ongoing")
                    .order_by("-start_time")
                    .first()
                )

                if attempt is None:
                    latest_exam = Exam.objects.order_by("-start_time").first()
                    if latest_exam is not None:
                        attempt, _ = StudentExamAttempt.objects.get_or_create(
                            student=user,
                            exam=latest_exam,
                            defaults={
                                "start_time": timezone.now(),
                                "status": "ongoing",
                                "suspicion_score": 0.0,
                            },
                        )

            if not user.face_photo:
                return Response({"error": "No enrolled face photo"}, status=400)

            enrolled_path = user.face_photo.path

            live_path = os.path.join(settings.MEDIA_ROOT, "temp_live.jpg")
            with open(live_path, "wb+") as f:
                for chunk in live_image.chunks():
                    f.write(chunk)

            result = DeepFace.verify(
                img1_path=enrolled_path,
                img2_path=live_path,
                model_name="ArcFace",
                detector_backend="opencv",
                enforce_detection=False,
                distance_metric="cosine",
                align=True,
            )

            distance = float(result.get("distance", 1.0))
            verified = bool(result.get("verified", False)) or (distance <= self.FACE_DISTANCE_THRESHOLD)

            suspicious_objects, person_count = self.detect_cheating_objects(live_path)

            object_suspicion = 0
            for item in suspicious_objects:
                if item.startswith("cell phone"):
                    object_suspicion += 20
                elif item.startswith("book") or item.startswith("laptop"):
                    object_suspicion += 15

            person_suspicion = 0
            if person_count > 1:
                person_suspicion += 10
            elif person_count == 0:
                person_suspicion += 10

            face_suspicion = 0 if verified else 15
            suspicion_delta = face_suspicion + object_suspicion + person_suspicion

            suspicion_total = None
            attempt_status = None

            if attempt is not None:
                attempt.suspicion_score = float(attempt.suspicion_score) + float(suspicion_delta)

                if attempt.suspicion_score >= self.FLAG_THRESHOLD:
                    attempt.status = "flagged"

                attempt.save(update_fields=["suspicion_score", "status"])
                suspicion_total = float(attempt.suspicion_score)
                attempt_status = attempt.status

                # Save proctoring event
                ProctoringEvent.objects.create(
                    attempt=attempt,
                    verified=verified,
                    face_distance=distance,
                    person_count=person_count,
                    suspicious_objects=suspicious_objects,
                    suspicion_delta=float(suspicion_delta),
                    suspicion_total=float(suspicion_total),
                    face_suspicion=float(face_suspicion),
                    object_suspicion=float(object_suspicion),
                    person_suspicion=float(person_suspicion),
                )

            if live_path and os.path.exists(live_path):
                os.remove(live_path)

            return Response(
                {
                    "verified": verified,
                    "distance": distance,
                    "suspicion_delta": suspicion_delta,
                    "suspicion_total": suspicion_total,
                    "attempt_status": attempt_status,
                    "suspicious_objects": suspicious_objects,
                    "person_count": person_count,
                    "face_suspicion": face_suspicion,
                    "object_suspicion": object_suspicion,
                    "person_suspicion": person_suspicion,
                    "face_verified": verified,
                    "face_distance": distance,
                    "message": "Proctoring check complete",
                }
            )

        except Exception as e:
            print("ERROR in FaceVerifyView:")
            traceback.print_exc()

            if live_path and os.path.exists(live_path):
                os.remove(live_path)

            return Response({"error": str(e)}, status=500)