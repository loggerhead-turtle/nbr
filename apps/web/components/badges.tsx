import { confidenceLabel } from "@/lib/format";

export function ProvisionalBadge() {
  return (
    <span
      className="badge bg-amber-100 text-amber-800"
      title="Provisional: based on few games or high uncertainty. Treat with caution."
    >
      Provisional
    </span>
  );
}

export function ConfidenceBadge({ rd }: { rd: number }) {
  const { label, tone } = confidenceLabel(rd);
  const cls =
    tone === "high"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "medium"
        ? "bg-sky-100 text-sky-800"
        : "bg-slate-200 text-slate-700";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function VerifyingBadge() {
  return (
    <span
      className="badge bg-sky-100 text-sky-800"
      title="Verifying: a likely duplicate of this team is awaiting review. Its games already count; the record may grow once the match is confirmed."
    >
      <span aria-hidden className="mr-0.5">
        ⟳
      </span>
      Verifying
    </span>
  );
}

export function GhostBadge() {
  return (
    <span
      className="badge bg-slate-100 text-slate-500"
      title="Unverified team auto-created from an opponent's schedule."
    >
      Unverified
    </span>
  );
}
