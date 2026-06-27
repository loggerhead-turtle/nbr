/** Display helpers shared across pages. */

export function formatRating(rating: number): string {
  return Math.round(rating).toString();
}

export function formatRecord(w: number, l: number, t: number): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

/** Map a rating deviation to a plain-English confidence label. */
export function confidenceLabel(rd: number): { label: string; tone: "low" | "medium" | "high" } {
  if (rd <= 75) return { label: "High confidence", tone: "high" };
  if (rd <= 130) return { label: "Medium confidence", tone: "medium" };
  return { label: "Low confidence", tone: "low" };
}

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const AGE_GROUP_LABELS: Record<string, string> = {
  U8: "8U",
  U9: "9U",
  U10: "10U",
  U11: "11U",
  U12: "12U",
  U13: "13U",
  U14: "14U",
  U15: "15U",
  U16: "16U",
  U17: "17U",
  U18: "18U",
  OPEN: "Open",
};

export function ageGroupLabel(ag?: string | null): string {
  if (!ag) return "—";
  return AGE_GROUP_LABELS[ag] ?? ag;
}
