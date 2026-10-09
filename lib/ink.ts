import type { Stroke } from "./notebook.ts";
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, w: number, h: number) {
  ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const point = stroke.points[0];
  if (!point) return;
  if (stroke.points.length === 1) {
    ctx.beginPath(); ctx.arc(point.x * w, point.y * h, stroke.width * w / 700 * (0.45 + point.p) / 2, 0, Math.PI * 2); ctx.fill(); return;
  }
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1], b = stroke.points[i];
    ctx.lineWidth = stroke.width * w / 700 * (0.45 + (a.p + b.p) / 2);
    ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke();
  }
}

