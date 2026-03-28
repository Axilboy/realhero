import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiUrl } from "../config/api";

export type SessionUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  settings: Record<string, unknown> | null;
  createdAt: string;
};

type SessionState = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

async function loadSessionUser(signal?: AbortSignal): Promise<SessionUser | null> {
  let r = await fetch(apiUrl("/api/v1/me"), { credentials: "include", signal });
  if (r.ok) {
    const data = (await r.json()) as { user: SessionUser };
    return data.user;
  }
  if (r.status !== 401) return null;
  let meta: { guestLogin?: boolean };
  try {
    const metaR = await fetch(apiUrl("/api/v1/meta"), { signal });
    if (!metaR.ok) return null;
    meta = (await metaR.json()) as { guestLogin?: boolean };
  } catch {
    return null;
  }
  if (!meta.guestLogin) return null;
  const gl = await fetch(apiUrl("/api/v1/auth/guest-login"), {
    method: "POST",
    credentials: "include",
    signal,
  });
  if (!gl.ok) return null;
  r = await fetch(apiUrl("/api/v1/me"), { credentials: "include", signal });
  if (!r.ok) return null;
  const data = (await r.json()) as { user: SessionUser };
  return data.user;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const u = await loadSessionUser();
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const u = await loadSessionUser(ac.signal);
        if (ac.signal.aborted) return;
        setUser(u);
      } catch {
        if (ac.signal.aborted) return;
        setUser(null);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  const logout = useCallback(async () => {
    await fetch(apiUrl("/api/v1/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    try {
      const u = await loadSessionUser();
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, logout }),
    [user, loading, refresh, logout]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
