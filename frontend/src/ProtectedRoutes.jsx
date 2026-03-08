import { Navigate } from "react-router-dom";

function getStoredUser() {
  const raw = localStorage.getItem("me");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function ProtectedStudentRoute({ children }) {
  const token = localStorage.getItem("access_token");
  const user = getStoredUser();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.is_student && user.is_admin) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

export function ProtectedAdminRoute({ children }) {
  const token = localStorage.getItem("access_token");
  const user = getStoredUser();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.is_admin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export function PublicRoute({ children }) {
  const token = localStorage.getItem("access_token");
  const user = getStoredUser();

  if (token && user) {
    if (user.is_admin) {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children;
}