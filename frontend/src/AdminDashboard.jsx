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

export default function AdminDashboard() {
  const [attempts, setAttempts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadAttempts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/api/admin/attempts/?format=json`);
      setAttempts(res.data || []);
    // eslint-disable-next-line no-unused-vars
    } catch (e) {
      setError("Failed to load attempts. Is backend running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttempts();

    // auto refresh every 5 seconds
    const t = setInterval(loadAttempts, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="container">
      <div className="header">
        <div className="titleBlock">
          <h1>Admin Dashboard</h1>
          <p>Live attempts monitoring (auto refresh every 5 seconds)</p>
        </div>

        <div className="row">
          <button className="btn secondary" onClick={loadAttempts} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Now"}
          </button>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="card" style={{ overflowX: "auto" }}>
        <h2 className="cardTitle">Exam Attempts</h2>

        {attempts.length === 0 ? (
          <p className="muted">No attempts found.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={thStyle}>Attempt ID</th>
                <th style={thStyle}>Student</th>
                <th style={thStyle}>Exam</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Suspicion</th>
                <th style={thStyle}>Start Time</th>
                <th style={thStyle}>End Time</th>
                <th style={thStyle}>Duration (min)</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                  <td style={tdStyle}>{a.id}</td>
                  <td style={tdStyle}>
                    {a.student_username} <span className="small">(id: {a.student})</span>
                  </td>
                  <td style={tdStyle}>
                    {a.exam_title} <span className="small">(id: {a.exam})</span>
                  </td>
                  <td style={tdStyle}>
                    <span className={statusClass(a.status)}>{a.status}</span>
                  </td>
                  <td style={tdStyle}>
                    <b>{Number(a.suspicion_score || 0).toFixed(1)}</b>
                  </td>
                  <td style={tdStyle}>{formatDate(a.start_time)}</td>
                  <td style={tdStyle}>{a.end_time ? formatDate(a.end_time) : "—"}</td>
                  <td style={tdStyle}>
                    {typeof a.duration_minutes === "number" ? a.duration_minutes.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="small" style={{ marginTop: 12 }}>
          Note: Duration is calculated as end_time - start_time. If you end attempts days later,
          duration will be large.
        </p>
      </div>
    </div>
  );
}

const thStyle = {
  padding: "10px 10px",
  fontSize: 12,
  color: "#94a3b8",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "12px 10px",
  fontSize: 14,
  color: "#e2e8f0",
  whiteSpace: "nowrap",
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}