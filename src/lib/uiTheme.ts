export type UiTheme = "v2" | "legacy";

const STORAGE_KEY = "rh_ui_theme";

export function readStoredUiTheme(): UiTheme {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === "legacy" || s === "v2") return s;
  } catch {
    /* ignore */
  }
  return "v2";
}

export function writeStoredUiTheme(theme: UiTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function applyUiThemeToDocument(theme: UiTheme): void {
  document.documentElement.setAttribute("data-ui", theme);
}
