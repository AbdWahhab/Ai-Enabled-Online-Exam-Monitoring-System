import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import "./App.css";

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

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadAttempts = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get("/api/admin/attempts/?format=json");
      setAttempts(res.data || []);
    } catch (e) {
      setError(
        e.response?.data?.error ||
          e.response?.data?.detail ||
          "Failed to load admin results."
      );
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("me");
    navigate("/login");
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
          <button className="btn secondary" onClick={loadAttempts} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Now"}
          </button>
          <button className="btn secondary" onClick={logout}>
            Logout
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
                    <button
                      className="btn secondary"
                      style={{ padding: "6px 12px", fontSize: "13px" }}
                      onClick={() => navigate(`/admin/attempt/${a.id}`)}
                    >
                      View #{a.id}
                    </button>
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
          Review status is based on suspicion score: 0–29 Safe, 30–49 Warning, 50+ Flagged for review.
        </p>
      </div>
    </div>
  );
}