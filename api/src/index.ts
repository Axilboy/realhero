import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { healthRoutes } from "./routes/health.js";
import { metaRoutes } from "./routes/meta.js";
import { authDevRoutes } from "./routes/authDev.js";
import { oauthRoutes } from "./routes/oauth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { questRoutes } from "./routes/quests.js";
import { sessionRoutes } from "./routes/session.js";

const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

const CORS_ALLOW_TRYCLOUDFLARE =
  process.env.CORS_ALLOW_TRYCLOUDFLARE === "1" ||
  process.env.CORS_ALLOW_TRYCLOUDFLARE === "true";

function trycloudflareOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && u.hostname.endsWith(".trycloudflare.com");
  } catch {
    return false;
  }
}

function corsAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (CORS_ORIGINS.includes(origin)) return true;
  if (CORS_ALLOW_TRYCLOUDFLARE && trycloudflareOrigin(origin)) return true;
  return false;
}

async function main() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "insecure-dev-only-change-me",
    cookie: {
      cookieName: "rh_session",
      signed: false,
    },
    sign: {
      expiresIn: "30d",
    },
  });

  await app.register(cors, {
    credentials: true,
    origin: (origin, cb) => {
      if (corsAllowedOrigin(origin)) {
        return cb(null, origin ?? true);
      }
      return cb(null, false);
    },
  });

  await app.register(healthRoutes);
  await app.register(metaRoutes, { prefix: "/api/v1" });
  await app.register(oauthRoutes, { prefix: "/api/v1" });
  await app.register(authDevRoutes, { prefix: "/api/v1" });
  await app.register(sessionRoutes, { prefix: "/api/v1" });
  await app.register(dashboardRoutes, { prefix: "/api/v1" });
  await app.register(questRoutes, { prefix: "/api/v1" });

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
