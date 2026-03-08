import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./App.css";

const API_BASE = "http://127.0.0.1:8000";

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      // 1. Get JWT token
      const loginRes = await axios.post(`${API_BASE}/api/auth/login/`, {
        username,
        password,
      });

      const { access, refresh } = loginRes.data;

      localStorage.setItem("access_token", access);
      localStorage.setItem("refresh_token", refresh);

      // 2. Get logged-in user profile
      const meRes = await axios.get(`${API_BASE}/api/auth/me/`, {
        headers: {
          Authorization: `Bearer ${access}`,
        },
      });

      const user = meRes.data;
      localStorage.setItem("me", JSON.stringify(user));

      // 3. Redirect by role
      if (user.is_admin) {
        navigate("/admin");
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.error ||
          "Login failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: "520px", minHeight: "100vh", display: "flex", alignItems: "center" }}>
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