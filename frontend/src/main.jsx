import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import "./index.css";
import App from "./App.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import Login from "./Login.jsx";
import AttemptReview from "./AttemptReview.jsx";

import {
  ProtectedStudentRoute,
  ProtectedAdminRoute,
  PublicRoute,
} from "./ProtectedRoutes.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedStudentRoute>
              <App />
            </ProtectedStudentRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedAdminRoute>
              <AdminDashboard />
            </ProtectedAdminRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login" />} />

        <Route
          path="/admin/attempt/:id"
          element={
            <ProtectedAdminRoute>
              <AttemptReview />
            </ProtectedAdminRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
