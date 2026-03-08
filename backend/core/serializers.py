from rest_framework import serializers
from .models import CustomUser, Exam, StudentExamAttempt, StudentAnswer


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'email', 'face_photo', 'is_student', 'is_admin']
        extra_kwargs = {'face_photo': {'read_only': True}}


class ExamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exam
        fields = ['id', 'title', 'description', 'start_time', 'end_time', 'duration_minutes']


class AttemptListSerializer(serializers.ModelSerializer):
    student_username = serializers.CharField(source="student.username", read_only=True)
    exam_title = serializers.CharField(source="exam.title", read_only=True)

    duration_minutes = serializers.SerializerMethodField()
    total_questions = serializers.SerializerMethodField()
    correct_answers = serializers.SerializerMethodField()
    percentage = serializers.SerializerMethodField()
    review_status = serializers.SerializerMethodField()

    class Meta:
        model = StudentExamAttempt
        fields = [
            "id",
            "student",
            "student_username",
            "exam",
            "exam_title",
            "start_time",
            "end_time",
            "status",
            "suspicion_score",
            "duration_minutes",
            "total_questions",
            "correct_answers",
            "percentage",
            "review_status",
        ]

    def get_duration_minutes(self, obj):
        if obj.end_time and obj.start_time:
            delta = obj.end_time - obj.start_time
            return round(delta.total_seconds() / 60, 2)
        return None

    def get_total_questions(self, obj):
        return obj.exam.questions.count()

    def get_correct_answers(self, obj):
        return StudentAnswer.objects.filter(attempt=obj, auto_score__gte=1.0).count()

    def get_percentage(self, obj):
        total = obj.exam.questions.count()
        if total == 0:
            return 0.0

        correct = StudentAnswer.objects.filter(attempt=obj, auto_score__gte=1.0).count()
        return round((correct / total) * 100, 2)

    def get_review_status(self, obj):
        score = float(obj.suspicion_score or 0)

        if score >= 50:
            return "Flagged for review"
        if score >= 30:
            return "Warning"
        return "Safe"