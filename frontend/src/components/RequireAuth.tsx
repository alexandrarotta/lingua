import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../state/authContext";

export default function RequireAuth() {
  const auth = useAuth();
  const loc = useLocation();

  if (auth.loading) {
    return (
      <div className="container">
        <div className="card">
          <h1 className="cardTitle">Lingua</h1>
          <p className="muted">Cargando sesión…</p>
        </div>
      </div>
    );
  }

  if (!auth.user) {
    const from = `${loc.pathname}${loc.search}${loc.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Outlet />;
}
