/**
 * Shared shape for the "DB vs GameChanger" reconcile capture. The worker writes
 * one snapshot to AppSetting after a full read-only scan; the admin page reads it
 * so all the review/delete work happens offline, without re-hitting GameChanger.
 */

/** AppSetting key holding the latest reconcile capture (JSON of ReconcileSnapshot). */
export const RECONCILE_SNAPSHOT_KEY = "reconcileSnapshot";

/** A game in our DB that wasn't found on the team's live GameChanger page. */
export interface ReconcileExtraGame {
  gameId: string;
  opponent: string;
  date: string;
  us: number | null;
  them: number | null;
}

export interface ReconcileTeamFinding {
  teamId: string;
  name: string;
  slug: string;
  gcTeamId: string | null;
  ageGroup: string | null;
  /** Games we have stored for this team. */
  dbCount: number;
  /** Completed games found on the team's own page during capture. */
  liveCount: number;
  /** Live page is far below our DB count — extras may be real but just unposted. */
  sparse: boolean;
  /** DB games not present on the live page (phantoms). Empty for dead-id teams. */
  extras: ReconcileExtraGame[];
}

export interface ReconcileSnapshot {
  /** ISO timestamp of the capture run. */
  capturedAt: string;
  teamsScanned: number;
  /** Verified teams whose page loaded but our DB holds games it doesn't (phantoms). */
  withExtras: ReconcileTeamFinding[];
  /** Verified teams whose GC page showed nothing online (dead/empty GC id). */
  deadIds: ReconcileTeamFinding[];
}
