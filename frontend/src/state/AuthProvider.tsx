import React, { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "../lib/authApi";
import { authForgotPassword, authLogin, authLogout, authMe, authRefresh, authRegister, authResetPassword } from "../lib/authApi";
import { BackendError } from "../lib/backend";
import { AuthCtx, type AuthState } from "./authContext";

export function AuthProvider(props: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await authMe();
        if (cancelled) return;
        setUser(me.user);
      } catch (err) {
        const isUnauthorized = err instanceof BackendError && err.status === 401;
        if (isUnauthorized) {
          try {
            const r = await authRefresh();
            if (cancelled) return;
            setUser(r.user);
          } catch {
            if (cancelled) return;
            setUser(null);
          }
        } else {
          console.error("auth bootstrap failed", err);
          if (cancelled) return;
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const res = await authLogin({ email, password });
        setUser(res.user);
      },
      register: async (email, password) => {
        const res = await authRegister({ email, password });
        setUser(res.user);
      },
      logout: async () => {
        await authLogout();
        setUser(null);
      },
      forgotPassword: async (email) => {
        return await authForgotPassword({ email });
      },
      resetPassword: async (token, newPassword) => {
        await authResetPassword({ token, newPassword });
      },
      refresh: async () => {
        const res = await authRefresh();
        setUser(res.user);
      }
    }),
    [user, loading]
  );

  return <AuthCtx.Provider value={value}>{props.children}</AuthCtx.Provider>;
}

