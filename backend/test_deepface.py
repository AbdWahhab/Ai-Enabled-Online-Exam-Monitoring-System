# test_deepface.py
from deepface import DeepFace
import os

print("Forcing ArcFace model download...")
DeepFace.verify(
    img1_path="D:/Me/Images/pic.jpg",  # dummy - use any image on your PC
    img2_path="D:/Me/Images/image.jpg",
    model_name="ArcFace",
    detector_backend="opencv",
    enforce_detection=False
)
print("Model should be downloaded now to C:\\Users\\K\\.deepface\\weights\\arcface_weights.h5")
print("Check if file exists:", os.path.exists(r"C:\Users\K\.deepface\weights\arcface_weights.h5"))