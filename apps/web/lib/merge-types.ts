/** Shared shapes for the admin merge UIs (kept out of the "use server" file so
 * only async server actions are exported from there). */
export interface MergeTargetOption {
  id: string;
  name: string;
  city: string | null;
  ageGroup: string | null;
  gcTeamId: string | null;
}
