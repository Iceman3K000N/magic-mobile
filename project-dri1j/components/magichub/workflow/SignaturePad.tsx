"use client";

import { useCallback, useEffect, useRef } from "react";
import { hubBtnGhost, hubBtnPrimary } from "@/components/magichub/MagicHubShell";

type Point = { x: number; y: number };

export function SignaturePad({ label, onSave }: { label: string; onSave: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<Point | null>(null);

  const pos = useCallback((e: MouseEvent | TouchEvent): Point => {
    const canvas = ref.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    if ("touches" in e && e.touches[0]) {
      return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    }
    const me = e as MouseEvent;
    return { x: me.clientX - r.left, y: me.clientY - r.top };
  }, []);

  const line = useCallback((a: Point, b: Point) => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#e4e4e7";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const down = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e.nativeEvent);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const p = pos(e.nativeEvent);
    line(last.current, p);
    last.current = p;
  };

  const up = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const save = () => {
    const canvas = ref.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-300">{label}</p>
      <canvas
        ref={ref}
        width={400}
        height={160}
        className="max-w-full touch-none rounded-xl border border-purple-500/30 bg-zinc-950"
        onMouseDown={down}
        onMouseMove={move}
        onMouseUp={up}
        onMouseLeave={up}
        onTouchStart={down}
        onTouchMove={move}
        onTouchEnd={up}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={hubBtnGhost} onClick={clear}>
          Clear
        </button>
        <button type="button" className={hubBtnPrimary} onClick={save}>
          Save signature
        </button>
      </div>
    </div>
  );
}
