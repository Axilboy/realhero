import "dotenv/config";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bcrypt from "bcryptjs";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { authPreHandler } from "./authHook.js";
import { prisma } from "./db.js";
import { seedUserDefaultAccount } from "./lib/seedUserAccounts.js";
import { seedUserCategories } from "./lib/seedUserCategories.js";
import { financePlugin } from "./routes/finance.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCorsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function cookieDomain(): string | undefined {
  const d = process.env.COOKIE_DOMAIN?.trim();
  return d || undefined;
}

function cookieSecureFlag(): boolean {
  const v = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  return process.env.NODE_ENV === "production";
}

function sessionCookieOptions() {
  const domain = cookieDomain();
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
    secure: cookieSecureFlag(),
    ...(domain ? { domain } : {}),
  };
}

function clearSessionCookie(reply: FastifyReply) {
  const domain = cookieDomain();
  reply.clearCookie("rh_session", {
    path: "/",
    ...(domain ? { domain } : {}),
  });
}

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cookie);
  await app.register(cors, {
    origin: parseCorsOrigins(),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-only-change-me-in-env",
    cookie: {
      cookieName: "rh_session",
      signed: false,
    },
  });

  app.get("/health", async () => ({ ok: true }));

  app.post("/api/v1/auth/register", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!email || !EMAIL_RE.test(email)) {
      return reply.status(400).send({
        error: { message: "Укажите корректный email" },
      });
    }
    if (password.length < 8) {
      return reply.status(400).send({
        error: { message: "Пароль не короче 8 символов" },
      });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return reply.status(409).send({
        error: { message: "Пользователь с таким email уже зарегистрирован" },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

    await seedUserCategories(prisma, user.id);
    await seedUserDefaultAccount(prisma, user.id);

    const token = await reply.jwtSign(
      { sub: user.id },
      { sign: { expiresIn: "30d" } },
    );
    reply.setCookie("rh_session", token, sessionCookieOptions());

    return reply.status(201).send({
      user: { id: user.id, email: user.email },
      token,
    });
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!email || !password) {
      return reply.status(400).send({
        error: { message: "Введите email и пароль" },
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.status(401).send({
        error: { message: "Неверный email или пароль" },
      });
    }

    const token = await reply.jwtSign(
      { sub: user.id },
      { sign: { expiresIn: "30d" } },
    );
    reply.setCookie("rh_session", token, sessionCookieOptions());

    return { user: { id: user.id, email: user.email }, token };
  });

  app.post("/api/v1/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get(
    "/api/v1/me",
    { preHandler: authPreHandler },
    async (request, reply) => {
      const payload = request.user as { sub: string };
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) {
        return reply
          .status(401)
          .send({ error: { message: "Пользователь не найден" } });
      }
      return { user: { id: user.id, email: user.email } };
    },
  );

  await app.register(financePlugin, { prefix: "/api/v1/finance" });

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
