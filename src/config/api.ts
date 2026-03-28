/** База API без завершающего слэша. Пусто = тот же origin (Vite proxy /api → localhost:3000). */
export function getApiBase(): string {
  const v = import.meta.env.VITE_API_URL as string | undefined;
  if (v && v.trim().length) return v.replace(/\/$/, "");
  return "";
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
