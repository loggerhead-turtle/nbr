/**
 * Trust tiers shown as a small medallion next to a team:
 *  - "green": a real (non-ghost) team with an APPROVED coach claim — verified
 *    and actively managed by a coach.
 *  - "gray":  a real (non-ghost) team with no approved coach claim yet.
 *  - null:    a scraped opponent (ghost) that no one has verified — no medallion,
 *    shown muted, and never offered for scheduling or tournament invitations.
 */
export type MedallionTier = "green" | "gray" | null;

export function teamMedallion(opts: {
  isGhost: boolean;
  hasApprovedClaim: boolean;
}): MedallionTier {
  if (opts.isGhost) return null;
  return opts.hasApprovedClaim ? "green" : "gray";
}
