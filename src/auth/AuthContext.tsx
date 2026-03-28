import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getRhAccessToken,
  setRhAccessToken,
} from "../lib/authToken";
import {
  bindFinanceAuthRefresh,
  resolveApiUrl,
} from "../lib/financeApi";

export type AuthUser = { id: string; email: string };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  /** true, если /api/v1/me подтвердил сессию (cookie на месте). */
  refresh: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SESSION_FAIL_HINT =
  "Не удалось подтвердить сессию. Обновите страницу и попробуйте снова; на сервере проверьте прокси (не должен удалять Set-Cookie), CORS_ORIGINS и при необходимости COOKIE_DOMAIN.";

const AuthContext = createContext<AuthContextValue | null>(null);

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } | string };
    if (typeof j.error === "string") return j.error;
    if (j.error && typeof j.error === "object" && j.error.message) {
      return j.error.message;
    }
  } catch {
    /* ignore */
  }
  return res.statusText || "Ошибка запроса";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<boolean> => {
    const headers: Record<string, string> = {};
    const t = getRhAccessToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(resolveApiUrl("/api/v1/me"), {
      credentials: "include",
      headers: Object.keys(headers).length ? headers : undefined,
    });
    if (!res.ok) {
      if (res.status === 401) setRhAccessToken(null);
      setUser(null);
      return false;
    }
    const data = (await res.json()) as { user: AuthUser };
    setUser(data.user);
    return true;
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    bindFinanceAuthRefresh(refresh);
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(resolveApiUrl("/api/v1/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const data = (await res.json()) as { user: AuthUser; token?: string };
      if (data.token) setRhAccessToken(data.token);
      const ok = await refresh();
      if (!ok) throw new Error(SESSION_FAIL_HINT);
    },
    [refresh],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(resolveApiUrl("/api/v1/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const data = (await res.json()) as { user: AuthUser; token?: string };
      if (data.token) setRhAccessToken(data.token);
      const ok = await refresh();
      if (!ok) throw new Error(SESSION_FAIL_HINT);
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    const t = getRhAccessToken();
    await fetch(resolveApiUrl("/api/v1/auth/logout"), {
      method: "POST",
      credentials: "include",
      headers: t ? { Authorization: `Bearer ${t}` } : undefined,
    });
    setRhAccessToken(null);
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    refresh,
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth вне AuthProvider");
  return ctx;
}
