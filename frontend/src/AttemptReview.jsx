import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

function reviewClass(reviewStatus) {
  if (reviewStatus === "Flagged for review") return "badge bad";
  if (reviewStatus === "Warning") return "badge warn";
  if (reviewStatus === "Safe") return "badge good";
  return "badge";
}

function statusClass(status) {
  if (status === "flagged") return "badge bad";
  if (status === "ongoing") return "badge warn";
  if (status === "submitted") return "badge good";
  return "badge";
}

export default function AttemptReview() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAttempt = async () => {
    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("access_token");

      if (!token) {
        setError("Admin token not found. Please log in first.");
        setLoading(false);
        return;
      }

      const res = await axios.get(`${API_BASE}/api/admin/attempts/?format=json`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const found = (res.data || []).find((a) => String(a.id) === String(id));

      if (!found) {
        setError("Attempt not found.");
      } else {
        setAttempt(found);
      }
    } catch (e) {
      setError(
        e.response?.data?.error ||
          e.response?.data?.detail ||
          "Failed to load attempt review."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttempt();
  }, [id]);

  return (
    <div className="container">
      <div className="header">
        <div className="titleBlock">
          <h1>Attempt Review</h1>
          <p>Detailed review of exam result and suspicion status</p>
        </div>

        <div className="row">
          <button className="btn secondary" onClick={() => navigate("/admin")}>
            Back to Dashboard
          </button>
        </div>
      </div>

      {loading && <div className="notice">Loading attempt details...</div>}
      {error && <div className="notice error">{error}</div>}

      {attempt && (
        <>
          <div className="grid">
            <div className="card">
              <h2 className="cardTitle">Student & Exam Details</h2>

              <div className="kpi">
                <div className="kpiItem">
                  <p className="kpiLabel">Attempt ID</p>
                  <p className="kpiValue">{attempt.id}</p>
                </div>

                <div className="kpiItem">
                  <p className="kpiLabel">Student</p>
                  <p className="kpiValue">{attempt.student_username}</p>
                </div>

                <div className="kpiItem">
                  <p className="kpiLabel">Exam</p>
                  <p className="kpiValue">{attempt.exam_title}</p>
                </div>
              </div>

              <div className="kpi">
                <div className="kpiItem">
                  <p className="kpiLabel">Start Time</p>
                  <p className="tableMain">{formatDate(attempt.start_time)}</p>
                </div>

                <div className="kpiItem">
                  <p className="kpiLabel">End Time</p>
                  <p className="tableMain">
                    {attempt.end_time ? formatDate(attempt.end_time) : "—"}
                  </p>
                </div>

                <div className="kpiItem">
                  <p className="kpiLabel">Duration (min)</p>
                  <p className="kpiValue">
                    {typeof attempt.duration_minutes === "number"
                      ? attempt.duration_minutes.toFixed(2)
                      : "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <h2 className="cardTitle">Result Summary</h2>

              <div className="kpi">
                <div className="kpiItem">
                  <p className="kpiLabel">Score</p>
                  <p className="kpiValue">
                    {attempt.correct_answers} / {attempt.total_questions}
                  </p>
                </div>

                <div className="kpiItem">
                  <p className="kpiLabel">Percentage</p>
                  <p className="kpiValue">
                    {Number(attempt.percentage || 0).toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="kpi">
                <div className="kpiItem">
                  <p className="kpiLabel">Attempt Status</p>
                  <div style={{ marginTop: "8px" }}>
                    <span className={statusClass(attempt.status)}>
                      {attempt.status}
                    </span>
                  </div>
                </div>

                <div className="kpiItem">
                  <p className="kpiLabel">Review Status</p>
                  <div style={{ marginTop: "8px" }}>
                    <span className={reviewClass(attempt.review_status)}>
                      {attempt.review_status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: "2rem" }}>
            <h2 className="cardTitle">AI Proctoring Review</h2>

            <div className="kpi">
              <div className="kpiItem">
                <p className="kpiLabel">Suspicion Score</p>
                <p className="kpiValue">
                  {Number(attempt.suspicion_score || 0).toFixed(1)}
                </p>
              </div>

              <div className="kpiItem">
                <p className="kpiLabel">Assessment</p>
                <p className="tableMain">
                  {attempt.review_status === "Flagged for review"
                    ? "High suspicion detected. Manual review recommended."
                    : attempt.review_status === "Warning"
                    ? "Moderate suspicion detected. Check if needed."
                    : "No significant suspicious behavior detected."}
                </p>
              </div>
            </div>

            <div
              className={`notice ${
                attempt.review_status === "Flagged for review"
                  ? "error"
                  : attempt.review_status === "Warning"
                  ? "warn"
                  : "success"
              }`}
            >
              {attempt.review_status === "Flagged for review"
                ? "This attempt has been flagged for admin review due to high suspicion score."
                : attempt.review_status === "Warning"
                ? "This attempt has warning-level suspicion and may need attention."
                : "This attempt appears safe based on current AI scoring."}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}