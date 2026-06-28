import { prisma } from "@nbr/db";

/** Admin-toggleable site settings stored in AppSetting. */
export const LIVE_SEARCH_KEY = "liveSearch";

/** Whether the ratings filter updates live (no Apply button). Defaults on. */
export async function getLiveSearchEnabled(): Promise<boolean> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: LIVE_SEARCH_KEY } });
    return s ? s.value !== "0" : true;
  } catch {
    return true;
  }
}
