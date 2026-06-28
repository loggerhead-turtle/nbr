import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads / serverless invocations to
// avoid exhausting the connection pool.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export { Prisma } from "@prisma/client";
export {
  findPromotableTeam,
  findAutoMergeTarget,
  mergeTeams,
  dedupeTeamGames,
  findCrossAgeMergeArtifacts,
  repairCrossAgeMerge,
} from "./teams";
export type { BadMergeFinding, BadMergeOutlier, AutoMergeTarget } from "./teams";
