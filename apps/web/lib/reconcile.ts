import { prisma } from "@nbr/db";
import { RECONCILE_SNAPSHOT_KEY, type ReconcileSnapshot } from "@nbr/core";

/** Read the latest reconcile capture (written by the nbr-reconcile worker). */
export async function getReconcileSnapshot(): Promise<ReconcileSnapshot | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: RECONCILE_SNAPSHOT_KEY } });
    if (!row?.value) return null;
    return JSON.parse(row.value) as ReconcileSnapshot;
  } catch {
    return null;
  }
}
