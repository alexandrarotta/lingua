import { createContext, useContext } from "react";
import type { AuthUser } from "../lib/authApi";

export type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string; resetUrl: string | null; resetToken: string | null }>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;
};

export const AuthCtx = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}

