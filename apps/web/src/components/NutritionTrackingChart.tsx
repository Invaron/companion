import { useCallback, useEffect, useRef } from "react";
import type { NutritionDayHistoryEntry } from "../types";

/* ── shared constants ──────────────────────────────────────────── */
const PAD = { top: 28, right: 52, bottom: 36, left: 48 };
const FONT = "10px system-ui, sans-serif";
const BOLD = "bold 11px system-ui, sans-serif";
const GRID = "rgba(255,255,255,0.06)";
const LABEL_CLR = "rgba(255,255,255,0.4)";
const GRID_LINES = 4;

function fmtDate(d: string): string {
  const p = new Date(d + "T00:00:00Z");
  return `${p.getUTCMonth() + 1}/${p.getUTCDate()}`;
}

function toAlpha(rgb: string, a: number): string {
  return rgb.replace("rgb(", "rgba(").replace(")", `,${a})`);
}

interface Axis { min: number; max: number; range: number }

function computeAxis(vals: (number | null)[], pad = 0.08): Axis {
  const nums = vals.filter((v): v is number => v !== null);
  if (nums.length === 0) return { min: 0, max: 1, range: 1 };
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  return { min: lo - span * pad, max: hi + span * pad, range: (hi + span * pad) - (lo - span * pad) };
}

function drawXLabels(
  ctx: CanvasRenderingContext2D,
  entries: NutritionDayHistoryEntry[],
  plotW: number,
  xStep: number,
  h: number,
) {
  ctx.fillStyle = LABEL_CLR;
  ctx.font = FONT;
  ctx.textAlign = "center";
  const max = Math.min(entries.length, 10);
  const step = Math.max(1, Math.floor(entries.length / max));
  for (let i = 0; i < entries.length; i += step) {
    const x = PAD.left + (entries.length > 1 ? i * xStep : plotW / 2);
    ctx.fillText(fmtDate(entries[i]!.date), x, h - PAD.bottom + 14);
  }
  if ((entries.length - 1) % step !== 0 && entries.length > 1) {
    const x = PAD.left + (entries.length - 1) * xStep;
    ctx.fillText(fmtDate(entries[entries.length - 1]!.date), x, h - PAD.bottom + 14);
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  color: string,
  width = 2,
  dashed = false,
) {
  if (points.length === 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (dashed) ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);
}

function drawDots(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], color: string, r = 2.5) {
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawGradientFill(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  color: string,
  top: number,
  bottom: number,
) {
  if (points.length < 2) return;
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, toAlpha(color, 0.18));
  grad.addColorStop(1, toAlpha(color, 0.01));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, bottom);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(points[points.length - 1]!.x, bottom);
  ctx.closePath();
  ctx.fill();
}

/* ── CalorieWeightChart: Calories (left axis) + Weight (right axis) ── */

interface DualAxisChartProps {
  entries: NutritionDayHistoryEntry[];
}

export function CalorieWeightChart({ entries }: DualAxisChartProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = ref.current;
    if (!canvas || entries.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom;
    const xStep = entries.length > 1 ? plotW / (entries.length - 1) : plotW;

    const cals = entries.map((e) => e.mealsLogged > 0 ? e.totals.calories : null);
    const calTargets = entries.map((e) => e.targets?.calories ?? null);
    const weights = entries.map((e) => e.weightKg);

    const calAxis = computeAxis([...cals, ...calTargets]);
    const wAxis = computeAxis(weights);

    const CAL_CLR = "rgb(255, 179, 71)";
    const CAL_TGT_CLR = "rgba(255, 179, 71, 0.35)";
    const W_CLR = "rgb(186, 147, 232)";

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_LINES; i++) {
      const y = PAD.top + (plotH / GRID_LINES) * i;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(w - PAD.right, y);
      ctx.stroke();

      // Left axis (calories)
      const cv = calAxis.max - (calAxis.range / GRID_LINES) * i;
      ctx.fillStyle = toAlpha(CAL_CLR, 0.5);
      ctx.font = FONT;
      ctx.textAlign = "right";
      ctx.fillText(Math.round(cv).toString(), PAD.left - 6, y + 3);

      // Right axis (weight)
      if (weights.some((v) => v !== null)) {
        const wv = wAxis.max - (wAxis.range / GRID_LINES) * i;
        ctx.fillStyle = toAlpha(W_CLR, 0.5);
        ctx.textAlign = "left";
        ctx.fillText(wv.toFixed(1), w - PAD.right + 6, y + 3);
      }
    }

    // Target calories (dashed)
    const tgtPts: { x: number; y: number }[] = [];
    for (let i = 0; i < entries.length; i++) {
      const t = calTargets[i];
      if (t === null) continue;
      const x = PAD.left + (entries.length > 1 ? i * xStep : plotW / 2);
      const y = PAD.top + plotH - ((t - calAxis.min) / calAxis.range) * plotH;
      tgtPts.push({ x, y });
    }
    drawLine(ctx, tgtPts, CAL_TGT_CLR, 1.5, true);

    // Calories line
    const calPts: { x: number; y: number }[] = [];
    for (let i = 0; i < entries.length; i++) {
      const v = cals[i];
      if (v === null) continue;
      const x = PAD.left + (entries.length > 1 ? i * xStep : plotW / 2);
      const y = PAD.top + plotH - ((v - calAxis.min) / calAxis.range) * plotH;
      calPts.push({ x, y });
    }
    drawGradientFill(ctx, calPts, CAL_CLR, PAD.top, PAD.top + plotH);
    drawLine(ctx, calPts, CAL_CLR);
    drawDots(ctx, calPts, CAL_CLR);

    // Weight line
    const wPts: { x: number; y: number }[] = [];
    for (let i = 0; i < entries.length; i++) {
      const v = weights[i];
      if (v === null) continue;
      const x = PAD.left + (entries.length > 1 ? i * xStep : plotW / 2);
      const y = PAD.top + plotH - ((v - wAxis.min) / wAxis.range) * plotH;
      wPts.push({ x, y });
    }
    drawLine(ctx, wPts, W_CLR, 2);
    drawDots(ctx, wPts, W_CLR, 3);

    drawXLabels(ctx, entries, plotW, xStep, h);

    // Legend
    ctx.font = BOLD;
    ctx.textAlign = "left";
    ctx.fillStyle = CAL_CLR;
    ctx.fillText("Calories", PAD.left, 16);
    if (weights.some((v) => v !== null)) {
      ctx.fillStyle = LABEL_CLR;
      const cw = ctx.measureText("Calories").width;
      ctx.fillText(" · ", PAD.left + cw, 16);
      ctx.fillStyle = W_CLR;
      ctx.fillText("Weight", PAD.left + cw + ctx.measureText(" · ").width, 16);
    }

    // Latest calorie value
    if (calPts.length > 0) {
      const lastCal = cals.filter((v): v is number => v !== null);
      ctx.font = BOLD;
      ctx.textAlign = "right";
      ctx.fillStyle = CAL_CLR;
      ctx.fillText(`${Math.round(lastCal[lastCal.length - 1]!)} kcal`, w - PAD.right - 2, 16);
    }
  }, [entries]);

  useEffect(() => {
    draw();
    const h = () => draw();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [draw]);

  return <canvas ref={ref} className="nutrition-tracking-canvas" style={{ width: "100%", height: 200 }} />;
}

/* ── MacroAdherenceChart: P/C/F as % of daily target ─────────────── */

interface MacroAdherenceProps {
  entries: NutritionDayHistoryEntry[];
}

export function MacroAdherenceChart({ entries }: MacroAdherenceProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = ref.current;
    if (!canvas || entries.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom;
    const xStep = entries.length > 1 ? plotW / (entries.length - 1) : plotW;

    const P_CLR = "rgb(129, 199, 132)";
    const C_CLR = "rgb(100, 181, 246)";
    const F_CLR = "rgb(239, 154, 154)";

    type MacroKey = "proteinGrams" | "carbsGrams" | "fatGrams";
    const macros: { key: MacroKey; color: string; label: string }[] = [
      { key: "proteinGrams", color: P_CLR, label: "Protein" },
      { key: "carbsGrams", color: C_CLR, label: "Carbs" },
      { key: "fatGrams", color: F_CLR, label: "Fat" },
    ];

    // Compute % of that day's target for each macro
    const pctData: Record<MacroKey, (number | null)[]> = {
      proteinGrams: [],
      carbsGrams: [],
      fatGrams: [],
    };
    for (const e of entries) {
      for (const m of macros) {
        if (e.mealsLogged === 0 || !e.targets || e.targets[m.key] === 0) {
          pctData[m.key].push(null);
        } else {
          pctData[m.key].push((e.totals[m.key] / e.targets[m.key]) * 100);
        }
      }
    }

    const allPcts = Object.values(pctData).flat().filter((v): v is number => v !== null);
    if (allPcts.length === 0) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = LABEL_CLR;
      ctx.font = BOLD;
      ctx.textAlign = "center";
      ctx.fillText("No target data for this period", w / 2, h / 2);
      return;
    }

    const yMin = Math.max(0, Math.min(...allPcts) - 15);
    const yMax = Math.max(...allPcts) + 15;
    const yRange = yMax - yMin || 1;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_LINES; i++) {
      const y = PAD.top + (plotH / GRID_LINES) * i;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(w - PAD.right, y);
      ctx.stroke();

      const val = yMax - (yRange / GRID_LINES) * i;
      ctx.fillStyle = LABEL_CLR;
      ctx.font = FONT;
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(val)}%`, PAD.left - 6, y + 3);
    }

    // 100% reference line
    const y100 = PAD.top + plotH - ((100 - yMin) / yRange) * plotH;
    if (y100 >= PAD.top && y100 <= PAD.top + plotH) {
      ctx.setLineDash([6, 3]);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y100);
      ctx.lineTo(w - PAD.right, y100);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = FONT;
      ctx.textAlign = "left";
      ctx.fillText("target", w - PAD.right + 6, y100 + 3);
    }

    // Draw each macro line
    for (const m of macros) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < entries.length; i++) {
        const v = pctData[m.key][i];
        if (v === null) continue;
        const x = PAD.left + (entries.length > 1 ? i * xStep : plotW / 2);
        const y = PAD.top + plotH - ((v - yMin) / yRange) * plotH;
        pts.push({ x, y });
      }
      drawLine(ctx, pts, m.color, 2);
      drawDots(ctx, pts, m.color, 2.5);
    }

    drawXLabels(ctx, entries, plotW, xStep, h);

    // Legend
    ctx.font = BOLD;
    ctx.textAlign = "left";
    let lx = PAD.left;
    for (let mi = 0; mi < macros.length; mi++) {
      const m = macros[mi]!;
      ctx.fillStyle = m.color;
      ctx.fillText(m.label, lx, 16);
      lx += ctx.measureText(m.label).width + 4;
      if (mi < macros.length - 1) {
        ctx.fillStyle = LABEL_CLR;
        ctx.fillText("·", lx, 16);
        lx += ctx.measureText("·").width + 4;
      }
    }
    ctx.fillStyle = LABEL_CLR;
    ctx.font = FONT;
    ctx.fillText("  (% of target)", lx, 16);

    // Latest % values on right
    ctx.font = BOLD;
    ctx.textAlign = "right";
    let rx = w - PAD.right;
    for (const m of [...macros].reverse()) {
      const vals = pctData[m.key].filter((v): v is number => v !== null);
      if (vals.length === 0) continue;
      const pct = Math.round(vals[vals.length - 1]!);
      const txt = `${pct}%`;
      ctx.fillStyle = m.color;
      ctx.fillText(txt, rx, 16);
      rx -= ctx.measureText(txt).width + 8;
    }
  }, [entries]);

  useEffect(() => {
    draw();
    const h = () => draw();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [draw]);

  return <canvas ref={ref} className="nutrition-tracking-canvas" style={{ width: "100%", height: 200 }} />;
}
