"use client";

export function MiniTrendLine({
  points,
  colorClass = "text-blue-400",
}: {
  points: number[];
  colorClass?: string;
}) {
  const max = Math.max(1, ...points);
  const min = Math.min(...points, 0);
  const range = Math.max(1, max - min);
  const width = 120;
  const height = 36;
  const d = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * width;
      const y = height - ((p - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`h-8 w-28 ${colorClass}`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
