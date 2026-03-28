import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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

const SESSION_COOKIE_HINT =
  "Вход принят, но браузер не сохранил сессию. Откройте сайт по тому же адресу, что и раньше (с www или без), используйте HTTPS или в api/.env задайте COOKIE_SECURE=false для HTTP. Для разных поддоменов — COOKIE_DOMAIN=.ваш-домен.ru и CORS_ORIGINS.";

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
    const res = await fetch(resolveApiUrl("/api/v1/me"), {
      credentials: "include",
    });
    if (!res.ok) {
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
      await res.json().catch(() => null);
      const ok = await refresh();
      if (!ok) throw new Error(SESSION_COOKIE_HINT);
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
      await res.json().catch(() => null);
      const ok = await refresh();
      if (!ok) throw new Error(SESSION_COOKIE_HINT);
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await fetch(resolveApiUrl("/api/v1/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
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
