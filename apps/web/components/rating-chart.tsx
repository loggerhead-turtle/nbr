import { formatRating } from "@/lib/format";

/** Dependency-free SVG sparkline of a team's rating over time. */
export function RatingChart({
  points,
}: {
  points: { asOf: Date | string; rating: number }[];
}) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-slate-400">
        Not enough history yet to chart a trend.
      </p>
    );
  }

  const W = 600;
  const H = 160;
  const PAD = 24;

  const ratings = points.map((p) => p.rating);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const range = max - min || 1;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (r: number) => H - PAD - ((r - min) / range) * (H - 2 * PAD);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.rating).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(
    1,
  )} ${H - PAD} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-40 w-full"
      role="img"
      aria-label="Rating over time"
    >
      <defs>
        <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#ratingFill)" />
      <path d={linePath} fill="none" stroke="#1b3478" strokeWidth="2.5" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.rating)} r="3" fill="#c1121f" />
      ))}
      <text x={PAD} y={14} className="fill-slate-400 text-[10px]">
        {formatRating(max)}
      </text>
      <text x={PAD} y={H - 6} className="fill-slate-400 text-[10px]">
        {formatRating(min)}
      </text>
    </svg>
  );
}
