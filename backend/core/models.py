from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

class CustomUser(AbstractUser):
    is_student = models.BooleanField(default=True)
    is_admin = models.BooleanField(default=False)
    face_photo = models.ImageField(upload_to='face_photos/', null=True, blank=True)  # For enrollment photo

    def __str__(self):
        return self.username

class Exam(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(CustomUser, on_delete=models.CASCADE, limit_choices_to={'is_admin': True})
    start_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=60)

    def __str__(self):
        return self.title

class Question(models.Model):
    QUESTION_TYPES = (
        ('MCQ', 'Multiple Choice'),
        ('SHORT', 'Short Answer'),
        ('DESC', 'Descriptive'),
    )
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name='questions')
    question_text = models.TextField()
    question_type = models.CharField(max_length=10, choices=QUESTION_TYPES, default='MCQ')
    options = models.JSONField(blank=True, null=True)  # e.g. ["A", "B", "C", "D"] for MCQ
    correct_answer = models.CharField(max_length=500, blank=True)  # For MCQ/short exact match
    model_answer = models.TextField(blank=True)  # For semantic similarity grading (Sentence-BERT later)

    def __str__(self):
        return f"{self.exam.title} - Q: {self.question_text[:50]}..."

class StudentExamAttempt(models.Model):
    student = models.ForeignKey(CustomUser, on_delete=models.CASCADE, limit_choices_to={'is_student': True})
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE)
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    suspicion_score = models.FloatField(default=0.0)  # Cumulative from AI flags
    status = models.CharField(max_length=20, default='ongoing')  # ongoing, submitted, flagged

    class Meta:
        unique_together = ('student', 'exam')

    def __str__(self):
        return f"{self.student.username} - {self.exam.title}"

class StudentAnswer(models.Model):
    attempt = models.ForeignKey(StudentExamAttempt, on_delete=models.CASCADE, related_name='answers')
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    answer_text = models.TextField(blank=True)
    selected_option = models.CharField(max_length=10, blank=True)  # For MCQ e.g. 'A'
    auto_score = models.FloatField(null=True, blank=True)  # 0-1 for semantic, 1/0 for MCQ
    graded_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Answer for Q{self.question.id} by {self.attempt.student}"