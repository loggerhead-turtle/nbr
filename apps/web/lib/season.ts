import { prisma } from "@nbr/db";

/** Current-season config (plain reads; safe to import from server components). */
const KEY = "currentSeasonYear";

export async function getCurrentSeasonYear(): Promise<number | null> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: KEY } });
    return s ? Number(s.value) : null;
  } catch {
    return null;
  }
}

export async function setCurrentSeasonYear(year: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: String(year) },
    update: { value: String(year) },
  });
}
