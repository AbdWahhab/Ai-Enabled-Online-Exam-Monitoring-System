import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

function statusClass(status) {
  if (status === "flagged") return "badge bad";
  if (status === "ongoing") return "badge warn";
  if (status === "submitted") return "badge good";
  return "badge";
}

function reviewClass(reviewStatus) {
  if (reviewStatus === "Flagged for review") return "badge bad";
  if (reviewStatus === "Warning") return "badge warn";
  if (reviewStatus === "Safe") return "badge good";
  return "badge";
}

export default function AdminDashboard() {
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadAttempts = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("access_token");

      if (!token) {
        setError("Admin token not found. Please log in first.");
        setLoading(false);
        return;
      }

      const res = await axios.get(
        `${API_BASE}/api/admin/attempts/?format=json`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setAttempts(res.data || []);
    } catch (e) {
      setError(
        e.response?.data?.error ||
          e.response?.data?.detail ||
          "Failed to load admin results. Check login and backend."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttempts();

    const t = setInterval(loadAttempts, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="container">
      <div className="header">
        <div className="titleBlock">
          <h1>Admin Result Dashboard</h1>
          <p>Live monitoring of exam attempts, scores, and suspicion reviews</p>
        </div>

        <div className="row">
          <button
            className="btn secondary"
            onClick={loadAttempts}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Now"}
          </button>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="card" style={{ overflowX: "auto" }}>
        <h2 className="cardTitle">Student Exam Attempts</h2>

        {attempts.length === 0 ? (
          <p className="muted">No attempts found.</p>
        ) : (
          <table className="adminTable">
            <thead>
              <tr>
                <th>Attempt ID</th>
                <th>Student</th>
                <th>Exam</th>
                <th>Status</th>
                <th>Score</th>
                <th>Percentage</th>
                <th>Suspicion</th>
                <th>Review Status</th>
                <th>Duration (min)</th>
                <th>Start Time</th>
                <th>End Time</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a
                      href={`/admin/attempt/${a.id}`}
                      style={{ fontWeight: "700" }}
                    >
                      {a.id}
                    </a>
                  </td>

                  <td>
                    <div className="tableMain">{a.student_username}</div>
                    <div className="tableSub">ID: {a.student}</div>
                  </td>

                  <td>
                    <div className="tableMain">{a.exam_title}</div>
                    <div className="tableSub">ID: {a.exam}</div>
                  </td>

                  <td>
                    <span className={statusClass(a.status)}>{a.status}</span>
                  </td>

                  <td>
                    <strong>
                      {a.correct_answers} / {a.total_questions}
                    </strong>
                  </td>

                  <td>{Number(a.percentage || 0).toFixed(2)}%</td>

                  <td>
                    <strong>{Number(a.suspicion_score || 0).toFixed(1)}</strong>
                  </td>

                  <td>
                    <span className={reviewClass(a.review_status)}>
                      {a.review_status}
                    </span>
                  </td>

                  <td>
                    {typeof a.duration_minutes === "number"
                      ? a.duration_minutes.toFixed(2)
                      : "—"}
                  </td>

                  <td>{formatDate(a.start_time)}</td>
                  <td>{a.end_time ? formatDate(a.end_time) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="small" style={{ marginTop: 12 }}>
          Review status is based on suspicion score: 0–29 Safe, 30–49 Warning,
          50+ Flagged for review.
        </p>
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}
