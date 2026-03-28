import { prisma } from "./prisma.js";

export async function findOrCreateUserFromOAuth(opts: {
  provider: string;
  providerAccountId: string;
  email: string | null;
  displayName: string | null;
}) {
  const linked = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: opts.provider,
        providerAccountId: opts.providerAccountId,
      },
    },
    include: { user: true },
  });
  if (linked) {
    await maybeUpdateProfile(linked.userId, opts.email, opts.displayName);
    return prisma.user.findUniqueOrThrow({ where: { id: linked.userId } });
  }

  if (opts.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: opts.email } });
    if (byEmail) {
      await prisma.oAuthAccount.create({
        data: {
          userId: byEmail.id,
          provider: opts.provider,
          providerAccountId: opts.providerAccountId,
        },
      });
      await maybeUpdateProfile(byEmail.id, null, opts.displayName);
      return prisma.user.findUniqueOrThrow({ where: { id: byEmail.id } });
    }
  }

  return prisma.user.create({
    data: {
      email: opts.email,
      displayName: opts.displayName ?? opts.email ?? `user_${opts.provider}`,
      accounts: {
        create: {
          provider: opts.provider,
          providerAccountId: opts.providerAccountId,
        },
      },
    },
  });
}

async function maybeUpdateProfile(
  userId: string,
  email: string | null,
  displayName: string | null
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const data: { email?: string; displayName?: string } = {};
  if (email && !user.email) data.email = email;
  if (displayName && !user.displayName) data.displayName = displayName;
  if (Object.keys(data).length) await prisma.user.update({ where: { id: userId }, data });
}
