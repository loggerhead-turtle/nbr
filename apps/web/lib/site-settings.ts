import { prisma } from "@nbr/db";

/** Admin-toggleable site settings stored in AppSetting. */
export const LIVE_SEARCH_KEY = "liveSearch";

/** Default minimum confidence (%) for the duplicate backlog merge worker. */
export const DUP_BACKLOG_CONF_KEY = "duplicateBacklogMinConfidence";

/** The saved default backlog-merge confidence (defaults to 100). */
export async function getBacklogMinConfidence(): Promise<number> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: DUP_BACKLOG_CONF_KEY } });
    const n = s ? Math.round(Number(s.value)) : NaN;
    return Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : 100;
  } catch {
    return 100;
  }
}

/** Whether the ratings filter updates live (no Apply button). Defaults on. */
export async function getLiveSearchEnabled(): Promise<boolean> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: LIVE_SEARCH_KEY } });
    return s ? s.value !== "0" : true;
  } catch {
    return true;
  }
}
