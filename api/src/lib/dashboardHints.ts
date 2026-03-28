export function readDashboardHints(settings: unknown): boolean {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return true;
  const o = settings as Record<string, unknown>;
  if (typeof o.dashboardHints === "boolean") return o.dashboardHints;
  return true;
}
