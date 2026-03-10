import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "./api";
import "./App.css";

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post("/api/auth/login/", { username, password });

      localStorage.setItem("access_token", res.data.access);
      localStorage.setItem("refresh_token", res.data.refresh);

      const me = await api.get("/api/auth/me/");
      localStorage.setItem("me", JSON.stringify(me.data));

      if (me.data.is_admin) {
        navigate("/admin");
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="container"
      style={{
        maxWidth: "520px",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div className="card" style={{ width: "100%" }}>
        <div className="titleBlock" style={{ marginBottom: "1.5rem" }}>
          <h1>Login</h1>
          <p>Sign in to access the AI Examination Monitoring System</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "1rem" }}>
            <label className="kpiLabel">Username</label>
            <input
              className="input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="kpiLabel">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          {error && <div className="notice error">{error}</div>}

          <div className="controls" style={{ marginTop: "1rem" }}>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Login"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}