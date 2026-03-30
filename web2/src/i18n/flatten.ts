/** Flatten nested string leaves to dot keys: { a: { b: "x" } } -> { "a.b": "x" } */
export function flattenMessages(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out[key] = v;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenMessages(v as Record<string, unknown>, key));
    }
  }
  return out;
}
