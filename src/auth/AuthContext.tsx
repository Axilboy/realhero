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
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

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

  const refresh = useCallback(async () => {
    const res = await fetch(resolveApiUrl("/api/v1/me"), {
      credentials: "include",
    });
    if (!res.ok) {
      setUser(null);
      return;
    }
    const data = (await res.json()) as { user: AuthUser };
    setUser(data.user);
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    bindFinanceAuthRefresh(refresh);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(resolveApiUrl("/api/v1/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    const data = (await res.json()) as { user: AuthUser };
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await fetch(resolveApiUrl("/api/v1/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await errorMessage(res));
    const data = (await res.json()) as { user: AuthUser };
    setUser(data.user);
  }, []);

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
