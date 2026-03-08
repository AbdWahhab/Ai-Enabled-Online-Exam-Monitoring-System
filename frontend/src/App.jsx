import { useRef, useState, useCallback, useEffect } from "react";
import Webcam from "react-webcam";
import axios from "axios";
import "./App.css";

const videoConstraints = {
  width: 720,
  height: 480,
  facingMode: "user",
};

const API_BASE = "http://127.0.0.1:8000";
const TEST_USER_ID = "2";
const FLAG_THRESHOLD = 50;
const WARNING_THRESHOLD = 30;

function App() {
  const webcamRef = useRef(null);

  const [imgSrc, setImgSrc] = useState(null);
  const [result, setResult] = useState(null);
  const [consecutiveFaceMismatches, setConsecutiveFaceMismatches] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [examStarted, setExamStarted] = useState(false);
  const [examStatus, setExamStatus] = useState("not_started"); // not_started | ongoing | submitted | flagged
  const [suspicionScore, setSuspicionScore] = useState(0);

  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedExamTitle, setSelectedExamTitle] = useState("");
  const [attemptId, setAttemptId] = useState(null);

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});

  const intervalRef = useRef(null);
  const isVerifying = useRef(false);

  useEffect(() => {
    const loadExams = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/exams/`);
        setExams(res.data || []);
        if (res.data?.length) {
          setSelectedExamId(String(res.data[0].id));
          setSelectedExamTitle(res.data[0].title);
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
      return imageSrc;
    }
    return null;
  }, []);

  const getReviewStatus = (score) => {
    if (score >= FLAG_THRESHOLD) return "Flagged for review";
    if (score >= WARNING_THRESHOLD) return "Warning";
    return "Safe";
  };

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
      formData.append("user_id", TEST_USER_ID); // fallback for now
      formData.append("live_image", file);

      const response = await axios.post(
        `${API_BASE}/api/face-verify/`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const data = response.data;

      // Only update result as proctoring result if this is not final exam result payload
      if (data.score === undefined) {
        setResult(data);
      }

      if (typeof data.suspicion_total === "number") {
        setSuspicionScore(data.suspicion_total);

        if (data.suspicion_total >= FLAG_THRESHOLD) {
          setExamStatus("flagged");
        } else if (examStarted) {
          setExamStatus("ongoing");
        }
      }

      if (data.verified === false) {
        setConsecutiveFaceMismatches((prev) => {
          const next = prev + 1;
          if (next >= 3) {
            setExamStatus("flagged");
          }
          return next;
        });
      } else if (data.verified === true) {
        setConsecutiveFaceMismatches(0);
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

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const selectedExam = exams.find(
        (ex) => String(ex.id) === String(selectedExamId)
      );
      setSelectedExamTitle(selectedExam?.title || "Selected Exam");

      const res = await axios.post(`${API_BASE}/api/attempts/start/`, {
        user_id: TEST_USER_ID,
        exam_id: selectedExamId,
      });

      setAttemptId(res.data.attempt_id);
      setExamStarted(true);
      setExamStatus("ongoing");
      setSuspicionScore(res.data.suspicion_score ?? 0);
      setConsecutiveFaceMismatches(0);

      const qRes = await axios.get(
        `${API_BASE}/api/exams/${selectedExamId}/questions/`
      );
      setQuestions(qRes.data.questions || []);
      setAnswers({});
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

    clearInterval(intervalRef.current);
    setExamStarted(false);
    setExamStatus("submitted");
    setAttemptId(null);
    setQuestions([]);
    setAnswers({});
    setConsecutiveFaceMismatches(0);
  };

  const handleOptionSelect = (questionId, optionValue) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionValue,
    }));
  };

  const submitExam = async () => {
    if (!attemptId) {
      setError("No active attempt found.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await axios.post(
        `${API_BASE}/api/attempts/${attemptId}/submit-answers/`,
        {
          answers: answers,
        }
      );

      setResult(res.data);
      setSuspicionScore(res.data.suspicion_score ?? suspicionScore);

      if ((res.data.suspicion_score ?? 0) >= FLAG_THRESHOLD) {
        setExamStatus("flagged");
      } else {
        setExamStatus("submitted");
      }

      try {
        await axios.post(`${API_BASE}/api/attempts/end/`, {
          attempt_id: attemptId,
        });
      } catch (endErr) {
        console.error("End attempt after submit failed:", endErr);
      }

      clearInterval(intervalRef.current);
      setExamStarted(false);
    } catch (e) {
      console.error("Submit exam error:", e.response?.data || e.message);
      setError(e.response?.data?.error || "Failed to submit answers");
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = () => {
    if (examStatus === "not_started") {
      return <span className="badge">Exam: Not started</span>;
    }
    if (examStatus === "ongoing") {
      return <span className="badge good">Exam: Ongoing</span>;
    }
    if (examStatus === "submitted") {
      return <span className="badge good">Exam: Submitted</span>;
    }
    if (examStatus === "flagged") {
      return <span className="badge bad">Exam: Flagged for review</span>;
    }
    return <span className="badge">Exam: Not started</span>;
  };

  const verificationBadge = () => {
    if (!result || result.score !== undefined) return null;

    if (result.verified === true) {
      return <span className="badge good">Face Verified</span>;
    }

    if (result.verified === false) {
      return <span className="badge bad">Face Mismatch</span>;
    }

    return null;
  };

  return (
    <div className="container">
      <div className="header">
        <div className="titleBlock">
          <h1>AI Examination Monitoring System</h1>
          <p>
            Live proctoring demo (Face + Object detection + Suspicion scoring)
          </p>
        </div>

        <div className="row">
          {statusBadge()}
          {verificationBadge()}
        </div>
      </div>

      <div className="grid">
        {/* LEFT CARD */}
        <div className="card">
          <h2 className="cardTitle">Live Camera</h2>
          <p className="muted">
            Select an exam, start attempt, then monitoring will run
            automatically.
          </p>

          {!examStarted && examStatus === "not_started" && (
            <div style={{ marginTop: 10 }}>
              <p className="kpiLabel">Select Exam</p>
              <select
                value={selectedExamId}
                onChange={(e) => {
                  setSelectedExamId(e.target.value);
                  const selected = exams.find(
                    (ex) => String(ex.id) === e.target.value
                  );
                  setSelectedExamTitle(selected?.title || "");
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
            {!examStarted && examStatus === "not_started" ? (
              <button className="btn" onClick={startExam} disabled={loading}>
                {loading ? "Starting..." : "Start Exam"}
              </button>
            ) : examStarted ? (
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
            ) : null}
          </div>

          {attemptId && examStarted && (
            <div className="notice" style={{ marginTop: 10 }}>
              Attempt ID: <b>{attemptId}</b>
            </div>
          )}

          {error && <div className="notice error">Error: {error}</div>}

          {examStarted &&
            suspicionScore >= WARNING_THRESHOLD &&
            suspicionScore < FLAG_THRESHOLD && (
              <div className="notice warn">
                Warning: Suspicion is rising. Please keep only one person in the
                frame and avoid phones/books.
              </div>
            )}

          {examStarted && suspicionScore >= FLAG_THRESHOLD && (
            <div className="notice error">
              High suspicion detected. This exam will be flagged for admin
              review.
            </div>
          )}

          {examStarted && consecutiveFaceMismatches === 1 && (
            <div className="notice warn">
              Face mismatch detected once. Please sit properly and look at the
              camera.
            </div>
          )}

          {examStarted && consecutiveFaceMismatches === 2 && (
            <div className="notice warn">
              Repeated face mismatch detected. Continued mismatch may flag this
              exam.
            </div>
          )}

          {examStarted && consecutiveFaceMismatches >= 3 && (
            <div className="notice error">
              Multiple consecutive face mismatches detected. This exam is
              flagged for review.
            </div>
          )}
        </div>

        {/* RIGHT CARD */}
        <div className="card">
          <h2 className="cardTitle">Proctoring Status</h2>

          <div className="kpi">
            <div className="kpiItem">
              <p className="kpiLabel">Attempt Status</p>
              <p className="kpiValue">
                {result?.attempt_status ||
                  (examStatus === "flagged"
                    ? "flagged"
                    : examStarted
                    ? "ongoing"
                    : examStatus === "submitted"
                    ? "submitted"
                    : "—")}
              </p>
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
              <p className="kpiValue">
                {result?.suspicion_score !== undefined
                  ? result.suspicion_score
                  : suspicionScore}
              </p>
              <p className="small">Saved to database per attempt</p>
            </div>
          </div>

          <div className="kpi">
            <div className="kpiItem">
              <p className="kpiLabel">Face Mismatch Streak</p>
              <p className="kpiValue">{consecutiveFaceMismatches}</p>
            </div>

            <div className="kpiItem">
              <p className="kpiLabel">Review Status</p>
              <p className="kpiValue" style={{ fontSize: "1.2rem" }}>
                {getReviewStatus(
                  result?.suspicion_score !== undefined
                    ? result.suspicion_score
                    : suspicionScore
                )}
              </p>
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

      {/* QUESTIONS */}
      {examStarted && (
        <div className="card questionSection">
          <div className="questionHeader">
            <div>
              <h2 className="cardTitle">Exam Questions</h2>
              <p className="muted">{selectedExamTitle || "Selected Exam"}</p>
            </div>
            <span className="badge">{questions.length} Questions</span>
          </div>

          {questions.length === 0 ? (
            <p className="muted">No questions found for this exam.</p>
          ) : (
            <div className="questionList">
              {questions.map((question, index) => (
                <div key={question.id} className="questionCard">
                  <p className="questionNumber">Question {index + 1}</p>
                  <h3 className="questionText">{question.question_text}</h3>

                  {question.question_type === "MCQ" &&
                    Array.isArray(question.options) && (
                      <div className="optionList">
                        {question.options.map((option, optionIndex) => (
                          <label key={optionIndex} className="optionItem">
                            <input
                              type="radio"
                              name={`question-${question.id}`}
                              value={option}
                              checked={answers[question.id] === option}
                              onChange={() =>
                                handleOptionSelect(question.id, option)
                              }
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    )}

                  {answers[question.id] && (
                    <p className="selectedAnswer">
                      Selected Answer: <strong>{answers[question.id]}</strong>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <button className="btn" onClick={submitExam} disabled={loading}>
              {loading ? "Submitting..." : "Submit Exam"}
            </button>
          </div>
        </div>
      )}

      {/* FINAL RESULT */}
      {result && result.score !== undefined && (
        <div className="card" style={{ marginTop: "2rem" }}>
          <h2 className="cardTitle">Exam Result</h2>

          <div className="kpi">
            <div className="kpiItem">
              <p className="kpiLabel">Student</p>
              <p className="kpiValue">{result.student_username}</p>
            </div>

            <div className="kpiItem">
              <p className="kpiLabel">Exam</p>
              <p className="kpiValue">{result.exam_title}</p>
            </div>
          </div>

          <div className="kpi">
            <div className="kpiItem">
              <p className="kpiLabel">Score</p>
              <p className="kpiValue">
                {result.score} / {result.total_questions}
              </p>
            </div>

            <div className="kpiItem">
              <p className="kpiLabel">Percentage</p>
              <p className="kpiValue">{result.percentage}%</p>
            </div>

            <div className="kpiItem">
              <p className="kpiLabel">Suspicion Score</p>
              <p className="kpiValue">{result.suspicion_score}</p>
            </div>
          </div>

          <div className="kpi">
            <div className="kpiItem">
              <p className="kpiLabel">Final Exam Status</p>
              <p className="kpiValue">Submitted</p>
            </div>

            <div className="kpiItem">
              <p className="kpiLabel">Review Status</p>
              <p className="kpiValue">
                {getReviewStatus(result.suspicion_score)}
              </p>
            </div>
          </div>

          <div
            className={`notice ${
              result.suspicion_score >= FLAG_THRESHOLD
                ? "error"
                : result.suspicion_score >= WARNING_THRESHOLD
                ? "warn"
                : "success"
            }`}
          >
            {result.suspicion_score >= FLAG_THRESHOLD
              ? "Exam submitted successfully, but flagged for admin review due to high suspicion."
              : result.suspicion_score >= WARNING_THRESHOLD
              ? "Exam submitted successfully with warning-level suspicion."
              : "Exam submitted successfully."}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
