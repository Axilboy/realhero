export function utcTodayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function utcYesterdayYmd(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
