from rest_framework import serializers
from .models import CustomUser, Exam, StudentExamAttempt


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

    class Meta:
        model = StudentExamAttempt
        fields = [
            "id",
            "student",          # student id
            "student_username",
            "exam",             # exam id
            "exam_title",
            "start_time",
            "end_time",
            "status",
            "suspicion_score",
            "duration_minutes",
        ]

    def get_duration_minutes(self, obj):
        # Only calculate if exam ended
        if obj.end_time and obj.start_time:
            delta = obj.end_time - obj.start_time
            return round(delta.total_seconds() / 60, 2)
        return None