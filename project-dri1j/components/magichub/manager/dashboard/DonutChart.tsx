"use client";

export function DonutChart({
  activeCount,
  inactiveCount,
  size = 96,
}: {
  activeCount: number;
  inactiveCount: number;
  size?: number;
}) {
  const total = Math.max(1, activeCount + inactiveCount);
  const activePct = activeCount / total;
  const r = 36;
  const c = 2 * Math.PI * r;
  const activeDash = c * activePct;
  const inactiveDash = c - activeDash;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(63,63,70,.6)" strokeWidth="12" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="rgb(59 130 246)"
          strokeWidth="12"
          strokeDasharray={`${activeDash} ${inactiveDash}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-xs font-semibold text-white">{Math.round(activePct * 100)}%</span>
    </div>
  );
}
