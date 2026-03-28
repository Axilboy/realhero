import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Проверка данных виджета «Войти через Telegram».
 * @see https://core.telegram.org/widgets/login
 */
export function verifyTelegramLoginPayload(
  params: Record<string, string>,
  botToken: string,
  maxAgeSec = 86400
): boolean {
  const hash = params.hash;
  if (!hash || !params.id || !params.auth_date) return false;
  const authDate = Number(params.auth_date);
  if (!Number.isFinite(authDate)) return false;
  if (Date.now() / 1000 - authDate > maxAgeSec) return false;

  const entries = Object.entries(params)
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const hmacHex = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  try {
    const a = Buffer.from(hmacHex, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
