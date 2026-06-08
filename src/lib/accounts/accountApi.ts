import { prisma } from "@/lib/prisma";
import type { Role } from "@/types";

export const accountResponseInclude = {
  kam: { select: { id: true, name: true, email: true } },
  associateOwner: { select: { id: true, name: true, email: true } },
  contacts: { orderBy: [{ isPrimary: "desc" as const }, { hierarchyRank: "asc" as const }, { name: "asc" as const }] },
  resources: { orderBy: [{ createdAt: "asc" as const }] },
  journeyItems: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  documents: { orderBy: { createdAt: "desc" as const }, take: 12 },
  kycVersions: { orderBy: { version: "desc" as const }, take: 1 },
  kamScores: { orderBy: { computedAt: "desc" as const }, take: 8 },
  signals: { where: { isResolved: false }, orderBy: { detectedAt: "desc" as const }, take: 3 },
  _count: { select: { actions: true, documents: true } },
};

export async function findAccountForResponse(id: string) {
  return prisma.account.findUnique({
    where: { id },
    include: accountResponseInclude,
  });
}

export async function resolveUserId(input: {
  userId?: string | null;
  userName?: string | null;
  role?: Role;
  fallbackRole?: Role;
}) {
  if (input.userId) return input.userId;

  const userName = input.userName?.trim();
  if (userName) {
    const matchedUser = await prisma.user.findFirst({
      where: {
        ...(input.role ? { role: input.role } : {}),
        OR: [
          { name: userName },
          { email: userName },
          { name: { contains: userName } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (matchedUser) return matchedUser.id;
  }

  if (!input.fallbackRole) return null;
  const fallback = await prisma.user.findFirst({
    where: { role: input.fallbackRole },
    orderBy: { createdAt: "asc" },
  });
  return fallback?.id ?? null;
}
