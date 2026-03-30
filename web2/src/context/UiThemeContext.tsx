import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyUiThemeToDocument,
  readStoredUiTheme,
  writeStoredUiTheme,
  type UiTheme,
} from "../lib/uiTheme";

type UiThemeValue = {
  uiTheme: UiTheme;
  setUiTheme: (t: UiTheme) => void;
};

const UiThemeContext = createContext<UiThemeValue | null>(null);

export function UiThemeProvider({ children }: { children: ReactNode }) {
  const [uiTheme, setUiThemeState] = useState<UiTheme>(() => readStoredUiTheme());

  const setUiTheme = useCallback((t: UiTheme) => {
    setUiThemeState(t);
    writeStoredUiTheme(t);
    applyUiThemeToDocument(t);
  }, []);

  useEffect(() => {
    applyUiThemeToDocument(uiTheme);
  }, [uiTheme]);

  const value = useMemo(
    () => ({ uiTheme, setUiTheme }),
    [uiTheme, setUiTheme],
  );

  return (
    <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>
  );
}

export function useUiTheme(): UiThemeValue {
  const ctx = useContext(UiThemeContext);
  if (!ctx) throw new Error("useUiTheme must be used within UiThemeProvider");
  return ctx;
}
