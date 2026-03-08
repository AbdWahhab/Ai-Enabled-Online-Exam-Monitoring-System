import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import axios from "axios";
import "./App.css";

const videoConstraints = {
  width: 720,
  height: 480,
  facingMode: "user",
};

const API_BASE = "http://127.0.0.1:8000";

function App() {
  const navigate = useNavigate();
  const webcamRef = useRef(null);

  const storedUser = JSON.parse(localStorage.getItem("me") || "null");

  const [imgSrc, setImgSrc] = useState(null);
  const [result, setResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [examStarted, setExamStarted] = useState(false);
  const [suspicionScore, setSuspicionScore] = useState(0);

  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [attemptId, setAttemptId] = useState(null);

  const intervalRef = useRef(null);
  const isVerifying = useRef(false);

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("me");
    navigate("/login");
  };

  useEffect(() => {
    const loadExams = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/exams/`);
        setExams(res.data || []);
        if (res.data?.length) {
          setSelectedExamId(String(res.data[0].id));
        }
      } catch {
        setError("Failed to load exams. Check backend is running.");
      }
    };

    loadExams();
  }, []);

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setImgSrc(imageSrc);
      setResult(null);
      setError(null);
      return imageSrc;
    }
    return null;
  }, []);

  const verifyFace = async (imageSrc) => {
    if (!imageSrc) {
      setError("No image captured");
      return;
    }

    if (!attemptId) {
      setError("No attempt started. Please select an exam and start.");
      return;
    }

    if (isVerifying.current) return;

    isVerifying.current = true;
    setLoading(true);
    setError(null);

    try {
      const blob = await fetch(imageSrc).then((res) => res.blob());
      const file = new File([blob], "live_photo.jpg", { type: "image/jpeg" });

      const formData = new FormData();
      formData.append("attempt_id", String(attemptId));
      formData.append("user_id", String(storedUser?.id));
      formData.append("live_image", file);

      const response = await axios.post(
        `${API_BASE}/api/face-verify/`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const data = response.data;
      setResult(data);

      if (typeof data.suspicion_total === "number") {
        setSuspicionScore(data.suspicion_total);
      }
    } catch (err) {
      setError(
        err.response?.data?.error || "Verification failed - check console"
      );
    } finally {
      setLoading(false);
      isVerifying.current = false;
    }
  };

  useEffect(() => {
    if (!examStarted) return;

    const verifyPeriodic = () => {
      const captured = capture();
      if (captured) verifyFace(captured);
    };

    verifyPeriodic();
    intervalRef.current = setInterval(verifyPeriodic, 90000);

    return () => clearInterval(intervalRef.current);
  }, [examStarted, capture]);

  const startExam = async () => {
    if (!selectedExamId) {
      setError("Please select an exam first.");
      return;
    }

    if (!storedUser?.id) {
      setError("Logged-in user not found. Please log in again.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await axios.post(`${API_BASE}/api/attempts/start/`, {
        user_id: String(storedUser.id),
        exam_id: selectedExamId,
      });

      setAttemptId(res.data.attempt_id);
      setExamStarted(true);
      setSuspicionScore(res.data.suspicion_score ?? 0);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to start attempt");
    } finally {
      setLoading(false);
    }
  };

  const stopExam = async () => {
    if (!attemptId) return;

    try {
      await axios.post(`${API_BASE}/api/attempts/end/`, {
        attempt_id: attemptId,
      });
    } catch (e) {
      console.error("Failed to end attempt:", e);
    }

    setExamStarted(false);
    clearInterval(intervalRef.current);
    setAttemptId(null);
  };

  const statusBadge = () => {
    if (!examStarted) return <span className="badge">Exam: Not started</span>;
    const high = suspicionScore >= 30;
    return (
      <span className={`badge ${high ? "bad" : "good"}`}>
        Suspicion: {suspicionScore} {high ? "⚠️" : "✅"}
      </span>
    );
  };

  const verificationBadge = () => {
    if (!result) return null;
    return (
      <span className={`badge ${result.verified ? "good" : "bad"}`}>
        {result.verified ? "Face Verified" : "Face Mismatch"}
      </span>
    );
  };

  return (
    <div className="container">
      <div className="header">
        <div className="titleBlock">
          <h1>AI Examination Monitoring System</h1>
          <p>
            Live proctoring demo (Face + Object detection + Suspicion scoring)
          </p>
          <p className="small" style={{ marginTop: "6px" }}>
            Logged in as:{" "}
            <strong>{storedUser?.username || "Unknown User"}</strong>
          </p>
        </div>

        <div className="row">
          {statusBadge()}
          {verificationBadge()}
          <button className="btn secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </div>

      <div className="grid">
        {/* LEFT */}
        <div className="card">
          <h2 className="cardTitle">Live Camera</h2>
          <p className="muted">
            Select an exam, start attempt, then monitoring will run
            automatically.
          </p>

          {!examStarted && (
            <div style={{ marginTop: 10 }}>
              <p className="kpiLabel">Select Exam</p>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #334155",
                  background: "#0b1220",
                  color: "#e2e8f0",
                  outline: "none",
                }}
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}
                  </option>
                ))}
              </select>
              <p className="small" style={{ marginTop: 6 }}>
                Attempt will be created when you click Start Exam.
              </p>
            </div>
          )}

          <div className="webcamWrap" style={{ marginTop: 12 }}>
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              className="webcam"
            />
          </div>

          <div className="controls">
            {!examStarted ? (
              <button className="btn" onClick={startExam} disabled={loading}>
                {loading ? "Starting..." : "Start Exam"}
              </button>
            ) : (
              <>
                <button className="btn danger" onClick={stopExam}>
                  End Exam
                </button>
                <button
                  className="btn secondary"
                  onClick={() => verifyFace(capture())}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Manual Verify"}
                </button>
              </>
            )}
          </div>

          {attemptId && examStarted && (
            <div className="notice" style={{ marginTop: 10 }}>
              Attempt ID: <b>{attemptId}</b>
            </div>
          )}

          {error && <div className="notice error">Error: {error}</div>}

          {examStarted && suspicionScore >= 30 && (
            <div className="notice warn">
              ⚠️ Suspicion is high. Please keep only one person in the frame and
              avoid phones/books.
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="card">
          <h2 className="cardTitle">Proctoring Status</h2>

          <div className="kpi">
            <div className="kpiItem">
              <p className="kpiLabel">Attempt Status</p>
              <p className="kpiValue">{result?.attempt_status || "—"}</p>
            </div>
            <div className="kpiItem">
              <p className="kpiLabel">People Detected</p>
              <p className="kpiValue">
                {typeof result?.person_count === "number"
                  ? result.person_count
                  : "—"}
              </p>
            </div>
          </div>

          <div className="kpi">
            <div className="kpiItem">
              <p className="kpiLabel">Face Distance</p>
              <p className="kpiValue">
                {typeof result?.distance === "number"
                  ? result.distance.toFixed(4)
                  : "—"}
              </p>
              <p className="small">Lower is better (match)</p>
            </div>
            <div className="kpiItem">
              <p className="kpiLabel">Suspicion (Total)</p>
              <p className="kpiValue">{suspicionScore}</p>
              <p className="small">Saved to database per attempt</p>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <p className="kpiLabel">Suspicious Objects</p>
            {result?.suspicious_objects?.length ? (
              <ul className="list">
                {result.suspicious_objects.map((x, idx) => (
                  <li key={idx}>{x}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">None detected</p>
            )}
          </div>

          {imgSrc && (
            <div style={{ marginTop: 14 }}>
              <p className="kpiLabel">Last Captured Frame</p>
              <img src={imgSrc} alt="Captured" className="captureImg" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
