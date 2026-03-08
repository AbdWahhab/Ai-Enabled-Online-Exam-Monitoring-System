import { useState } from "react";
import { api } from "./api";

export default function Login({ onLoginSuccess }) {
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

      // Fetch user profile after login
      const me = await api.get("/api/auth/me/");
      localStorage.setItem("me", JSON.stringify(me.data));

      onLoginSuccess(me.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: "60px auto" }}>
      <h2 className="cardTitle">Login</h2>
      <p className="muted">Enter your username and password to continue.</p>

      <form onSubmit={handleLogin} style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 10 }}>
          <label className="kpiLabel">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input"
            placeholder="e.g. Abdul"
            required
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label className="kpiLabel">Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            type="password"
            placeholder="••••••••"
            required
          />
        </div>

        {error && <div className="notice error">Error: {error}</div>}

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}