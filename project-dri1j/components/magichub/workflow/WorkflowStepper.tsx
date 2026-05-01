"use client";

const LABELS = [
  "Customer",
  "Device",
  "Plan",
  "Quote",
  "Agreement",
  "Activation",
  "Approval",
  "Commission",
];

function cn(...xs: (string | false | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export function WorkflowStepper({ current }: { current: number }) {
  return (
    <div className="mb-6 overflow-x-auto pb-2">
      <ol className="flex min-w-max gap-1 md:gap-2">
        {LABELS.map((label, i) => {
          const step = i + 1;
          const active = step === current;
          const done = step < current;
          return (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium md:px-4 md:text-sm",
                done && "bg-zinc-800/90 text-zinc-200",
                active && "bg-purple-600 text-white ring-2 ring-purple-400/40",
                !done && !active && "bg-zinc-900 text-zinc-500",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                  active && "bg-white/20",
                  !active && "bg-zinc-800",
                )}
              >
                {step}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
