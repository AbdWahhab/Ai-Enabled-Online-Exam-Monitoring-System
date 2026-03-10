import { useRef, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { api } from "./api";
import "./App.css";

const videoConstraints = {
  width: 720,
  height: 480,
  facingMode: "user",
};

const WARNING_THRESHOLD = 30;
const FLAG_THRESHOLD = 50;

function App() {
  const navigate = useNavigate();
  const webcamRef = useRef(null);

  const storedUser = JSON.parse(localStorage.getItem("me") || "null");

  const [imgSrc, setImgSrc] = useState(null);
  const [result, setResult] = useState(null);

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
  const [, setConsecutiveFaceMismatches] = useState(0);

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
        const res = await api.get("/api/exams/");
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
      formData.append("user_id", String(storedUser?.id || ""));
      formData.append("live_image", file);

      const response = await api.post("/api/face-verify/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = response.data;

      // keep exam result untouched after final submit
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

      if (data.auto_terminated) {
        clearInterval(intervalRef.current);
        setExamStarted(false);
        setExamStatus("flagged");
        setError(
          "Exam was automatically terminated due to very high suspicion."
        );
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

  const logViolation = async (violationType) => {
    if (!attemptId || !examStarted) return;

    try {
      const res = await api.post("/api/violations/log/", {
        attempt_id: attemptId,
        violation_type: violationType,
      });

      const data = res.data;

      if (typeof data.suspicion_total === "number") {
        setSuspicionScore(data.suspicion_total);
      }

      if (data.attempt_status === "flagged") {
        setExamStatus("flagged");
      }

      if (data.auto_terminated) {
        clearInterval(intervalRef.current);
        setExamStarted(false);
        setExamStatus("flagged");
        setError(
          "Exam was automatically terminated due to repeated browser violations."
        );
      }
    } catch (e) {
      console.error("Violation logging failed:", e);
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

  useEffect(() => {
    if (!examStarted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logViolation("tab_switch");
      }
    };

    const handleWindowBlur = () => {
      logViolation("window_blur");
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && examStarted) {
        logViolation("fullscreen_exit");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [examStarted, attemptId]);

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
      const selectedExam = exams.find(
        (ex) => String(ex.id) === String(selectedExamId)
      );
      setSelectedExamTitle(selectedExam?.title || "Selected Exam");

      // start attempt
      const res = await api.post("/api/attempts/start/", {
        user_id: String(storedUser.id),
        exam_id: selectedExamId,
      });

      setAttemptId(res.data.attempt_id);
      setExamStarted(true);
      setExamStatus("ongoing");
      setSuspicionScore(res.data.suspicion_score ?? 0);
      setConsecutiveFaceMismatches(0);

      // load questions
      const qRes = await api.get(`/api/exams/${selectedExamId}/questions/`);
      setQuestions(qRes.data || []);
      setAnswers({});

      if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
        } catch (e) {
          console.warn("Fullscreen request failed:", e);
        }
      }
    } catch (e) {
      setError(
        e.response?.data?.error || "Failed to start attempt or load questions"
      );
    } finally {
      setLoading(false);
    }
  };

  const stopExam = async () => {
    if (!attemptId) return;

    try {
      await api.post("/api/attempts/end/", {
        attempt_id: attemptId,
      });
    } catch (e) {
      console.error("Failed to end attempt:", e);
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch (e) {
        console.warn("Exit fullscreen failed:", e);
      }
    }

    clearInterval(intervalRef.current);
    setExamStarted(false);
    setExamStatus("submitted");
    setAttemptId(null);
    setQuestions([]);
    setAnswers({});
  };

  const handleOptionSelect = async (questionId, optionValue) => {
    if (!attemptId) return;

    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionValue,
    }));

    try {
      await api.post("/api/answers/save/", {
        attempt_id: attemptId,
        question_id: questionId,
        selected_option: optionValue,
        answer_text: optionValue,
      });
    } catch (e) {
      console.error("Save answer failed:", e);
      setError(e.response?.data?.error || "Failed to save answer");
    }
  };

  const submitExam = async () => {
    if (!attemptId) {
      setError("No active attempt found.");
      return;
    }

    const unanswered = questions.filter((q) => !answers[q.id]);
    if (unanswered.length > 0) {
      const ok = window.confirm(
        `You still have ${unanswered.length} unanswered question(s). Submit anyway?`
      );
      if (!ok) return;
    }

    try {
      setLoading(true);
      setError(null);

      // end attempt first
      await api.post("/api/attempts/end/", {
        attempt_id: attemptId,
      });

      // pull latest attempt list and find this attempt
      const attemptsRes = await api.get("/api/admin/attempts/?format=json");
      const found = (attemptsRes.data || []).find(
        (a) => String(a.id) === String(attemptId)
      );

      if (found) {
        const finalResult = {
          score: found.correct_answers,
          total_questions: found.total_questions,
          percentage: found.percentage,
          suspicion_score: found.suspicion_score,
          exam_title: found.exam_title,
          student_username: found.student_username,
        };

        setResult(finalResult);
        setSuspicionScore(found.suspicion_score ?? suspicionScore);

        if ((found.suspicion_score ?? 0) >= FLAG_THRESHOLD) {
          setExamStatus("flagged");
        } else {
          setExamStatus("submitted");
        }
      } else {
        setExamStatus("submitted");
      }

      clearInterval(intervalRef.current);
      setExamStarted(false);
    } catch (e) {
      console.error("Submit exam error:", e.response?.data || e.message);
      setError(e.response?.data?.error || "Failed to submit exam");
    } finally {
      setLoading(false);
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch (e) {
        console.warn("Exit fullscreen failed:", e);
      }
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

          {examStarted && (
            <div className="notice" style={{ marginTop: 10 }}>
              Do not switch tabs, minimize the browser, or exit fullscreen
              during the exam.
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
        </div>

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

            <div className="kpiItem">
              <p className="kpiLabel">Face Mismatch Count</p>
              <p className="kpiValue">{setConsecutiveFaceMismatches}</p>
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

          <div style={{ marginTop: 12 }}>
            <p className="kpiLabel">Review Status</p>
            <p className="kpiValue" style={{ fontSize: "1.2rem" }}>
              {getReviewStatus(
                result?.suspicion_score !== undefined
                  ? result.suspicion_score
                  : suspicionScore
              )}
            </p>
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
                              disabled={
                                !examStarted || examStatus === "flagged"
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
            <button
              className="btn"
              onClick={submitExam}
              disabled={loading || examStatus === "flagged"}
            >
              {loading ? "Submitting..." : "Submit Exam"}
            </button>
          </div>
        </div>
      )}

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
                              disabled={
                                !examStarted || examStatus === "flagged"
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
            <button
              className="btn"
              onClick={submitExam}
              disabled={loading || examStatus === "flagged"}
            >
              {loading ? "Submitting..." : "Submit Exam"}
            </button>
          </div>
        </div>
      )}

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
