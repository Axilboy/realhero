export type Locale = "ru" | "en";

const STORAGE_KEY = "rh_locale";

export function readStoredLocale(): Locale | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === "en" || s === "ru") return s;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function detectLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  if (typeof navigator !== "undefined") {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith("en")) return "en";
  }
  return "ru";
}
