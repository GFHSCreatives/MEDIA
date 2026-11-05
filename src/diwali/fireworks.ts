import cue from "./fireworks.json";
import { D_FPS, DT, TILT_DISTANCE } from "./timeline";

/**
 * Deterministic aerial-firework simulation.
 * Every spark's position is a closed-form function of time (launch velocity,
 * quadratic-free exponential air drag, gravity), so any frame can be rendered
 * independently and in parallel with zero flicker between renders.
 */

export type Shell = (typeof cue.shells)[number];
export const SHELLS: Shell[] = cue.shells;

type RGB = [number, number, number];
const PALETTES: Record<string, RGB[]> = {
  gold: [[255, 214, 128], [255, 186, 92], [255, 236, 190]],
  orange: [[245, 130, 32], [255, 162, 77], [255, 205, 140]],
  white: [[255, 246, 224], [255, 226, 170], [255, 255, 245]],
  mixed: [[255, 210, 120], [245, 130, 32], [255, 240, 205]],
};

const TYPE = {
  peony: { n: 150, drag: 2.2, g: 70, life: 1.5, trail: 0.06, width: 2.2, glitter: 0.15 },
  chrysanthemum: { n: 230, drag: 1.8, g: 60, life: 1.9, trail: 0.14, width: 1.8, glitter: 0.25 },
  willow: { n: 170, drag: 1.25, g: 120, life: 3.0, trail: 0.42, width: 1.6, glitter: 0.6 },
  ring: { n: 110, drag: 2.3, g: 60, life: 1.4, trail: 0.07, width: 2.4, glitter: 0.1 },
  crackle: { n: 130, drag: 2.0, g: 80, life: 1.2, trail: 0.05, width: 2.0, glitter: 0.3 },
} as const;

// mulberry32 — seeded PRNG
export const prng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

type Spark = { dx: number; dy: number; speed: number; col: RGB; lifeMul: number; seed: number };
const sparkCache = new Map<number, Spark[]>();
const sparksFor = (idx: number): Spark[] => {
  const hit = sparkCache.get(idx);
  if (hit) return hit;
  const s = SHELLS[idx];
  const ty = TYPE[s.type as keyof typeof TYPE];
  const r = prng(1000 + idx * 97);
  const pal = PALETTES[s.palette];
  const sparks: Spark[] = [];
  const tilt = (r() - 0.5) * 0.9;
  for (let i = 0; i < ty.n; i++) {
    let dx: number, dy: number;
    if (s.type === "ring") {
      const a = (i / ty.n) * Math.PI * 2;
      dx = Math.cos(a);
      dy = Math.sin(a) * 0.45 + Math.cos(a) * tilt * 0.3;
    } else {
      // uniform on a sphere, projected → natural density falloff toward the rim
      const z = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const rr = Math.sqrt(1 - z * z);
      dx = rr * Math.cos(th);
      dy = rr * Math.sin(th);
    }
    sparks.push({
      dx,
      dy,
      speed: 0.82 + r() * 0.3,
      col: pal[Math.floor(r() * pal.length)],
      lifeMul: 0.75 + r() * 0.45,
      seed: i,
    });
  }
  sparkCache.set(idx, sparks);
  return sparks;
};

/** spark position at time t (s) after burst, relative to burst centre */
const sparkPos = (s: Shell, sp: Spark, t: number) => {
  const ty = TYPE[s.type as keyof typeof TYPE];
  const k = ty.drag;
  const e = 1 - Math.exp(-k * t);
  const reach = s.r * sp.speed;
  const x = sp.dx * reach * e;
  const y = sp.dy * reach * e + (ty.g / k) * (t - e / k) * (s.r / 250);
  return { x, y };
};

/** screen-space vertical offset of sky space for a given frame (camera tilt between scenes 02 and 03) */
export const skyOffset = (frame: number) => {
  const u = Math.min(1, Math.max(0, (frame - DT.tiltStart) / (DT.tiltEnd - DT.tiltStart)));
  const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  return -TILT_DISTANCE * (1 - e);
};

const shellVisible = (s: Shell, frame: number) => {
  if (s.scene === 1) return frame < DT.s2Start;
  return frame >= DT.s2Start - 2;
};

const launchPoint = (s: Shell) => {
  const r = prng(77 + s.launch);
  return { x: s.x + (r() - 0.5) * 120, y: s.y + (s.scene === 1 ? 700 : 950) };
};

export type DrawOpts = {
  frame: number;
  width: number;
  height: number;
  /** multiply spark alpha inside this ellipse (keeps the logo clear) */
  clearZone?: { x: number; y: number; rx: number; ry: number; strength: number };
};

/** Draw all fireworks for a frame onto a 2D context (additive). */
export const drawFireworks = (ctx: CanvasRenderingContext2D, o: DrawOpts) => {
  const { frame } = o;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const zoneAlpha = (x: number, y: number) => {
    const z = o.clearZone;
    if (!z) return 1;
    const d = Math.hypot((x - z.x) / z.rx, (y - z.y) / z.ry);
    return 1 - z.strength * (1 - Math.min(1, Math.max(0, (d - 0.75) / 0.35)));
  };

  SHELLS.forEach((s, idx) => {
    if (!shellVisible(s, frame)) return;
    const oy = s.scene === 1 ? 0 : skyOffset(frame);
    const ty = TYPE[s.type as keyof typeof TYPE];
    // ---- rising shell (comet with sparkling tail) ----
    if (frame >= s.launch && frame < s.burst) {
      const lp = launchPoint(s);
      const pos = (f: number) => {
        const u = Math.min(1, Math.max(0, (f - s.launch) / (s.burst - s.launch)));
        const e = 1 - (1 - u) * (1 - u);
        return { x: lp.x + (s.x - lp.x) * e + Math.sin(u * 9 + idx) * 3, y: lp.y + (s.y - lp.y) * e + oy };
      };
      for (let k = 0; k < 10; k++) {
        const f0 = frame - k * 0.6;
        const f1 = frame - (k + 1) * 0.6;
        if (f1 < s.launch) break;
        const a = pos(f0);
        const b = pos(f1);
        const al = (1 - k / 10) * 0.85 * zoneAlpha(a.x, a.y);
        ctx.strokeStyle = `rgba(255,${200 - k * 6},${120 - k * 6},${al})`;
        ctx.lineWidth = 2.6 - k * 0.18;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const h = pos(frame);
      ctx.fillStyle = "rgba(255,245,220,0.95)";
      ctx.beginPath();
      ctx.arc(h.x, h.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // ---- burst ----
    const t = (frame - s.burst) / D_FPS;
    if (t < 0 || t > ty.life * 1.3) return;
    const cx = s.x;
    const cy = s.y + oy;
    // initial flash
    if (t < 0.25) {
      const fl = (1 - t / 0.25) ** 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s.r * 0.9);
      g.addColorStop(0, `rgba(255,240,210,${0.55 * fl * zoneAlpha(cx, cy)})`);
      g.addColorStop(0.3, `rgba(255,190,110,${0.22 * fl})`);
      g.addColorStop(1, "rgba(255,160,80,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - s.r, cy - s.r, s.r * 2, s.r * 2);
    }
    const sparks = sparksFor(idx);
    for (const sp of sparks) {
      const life = ty.life * sp.lifeMul;
      if (t > life) continue;
      const fade = Math.pow(1 - t / life, 1.3);
      const tw = 1 - ty.glitter + ty.glitter * hash(sp.seed + idx * 1000, frame);
      const crack = s.type === "crackle" && t > life * 0.55 ? (hash(sp.seed, frame * 3) > 0.7 ? 1.8 : 0.15) : 1;
      const a = fade * tw * crack;
      if (a < 0.02) continue;
      const p1 = sparkPos(s, sp, t);
      const p0 = sparkPos(s, sp, Math.max(0, t - ty.trail));
      const x1 = cx + p1.x;
      const y1 = cy + p1.y;
      const za = zoneAlpha(x1, y1);
      if (za < 0.02) continue;
      const [r, g, b] = sp.col;
      const w = ty.width * (s.r / 260 + 0.45);
      ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(1, a * za)})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(cx + p0.x, cy + p0.y);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // hot core dot
      if (a > 0.35) {
        ctx.fillStyle = `rgba(255,250,235,${(a - 0.35) * za})`;
        ctx.beginPath();
        ctx.arc(x1, y1, w * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  ctx.restore();
};

/** Lingering, firework-lit smoke (normal blending, drawn under the sparks). */
export const drawSmoke = (ctx: CanvasRenderingContext2D, frame: number) => {
  ctx.save();
  SHELLS.forEach((s, idx) => {
    if (!shellVisible(s, frame)) return;
    const t = (frame - s.burst) / D_FPS;
    if (t < 0 || t > 5) return;
    const oy = s.scene === 1 ? 0 : skyOffset(frame);
    const lit = Math.exp(-t * 2.2);
    const a = Math.min(1, t * 3) * Math.exp(-t * 0.45) * 0.16;
    const rad = s.r * (0.55 + t * 0.12);
    const cx = s.x + t * 6 * (idx % 2 ? 1 : -1);
    const cy = s.y + oy + t * 14;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const warm = `${Math.round(70 + 150 * lit)},${Math.round(70 + 90 * lit)},${Math.round(95 + 30 * lit)}`;
    g.addColorStop(0, `rgba(${warm},${a})`);
    g.addColorStop(0.6, `rgba(${warm},${a * 0.45})`);
    g.addColorStop(1, `rgba(${warm},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  });
  ctx.restore();
};

/** Aggregate light the fireworks throw on the scene this frame (for rim lights, ambient pulses). */
export const fireworkLight = (frame: number) => {
  let intensity = 0;
  let x = 0;
  let wsum = 0;
  let warm = 0;
  SHELLS.forEach((s) => {
    if (!shellVisible(s, frame)) return;
    const t = (frame - s.burst) / D_FPS;
    if (t < 0 || t > 2.5) return;
    const w = (s.r / 300) * (Math.exp(-t * 2.6) * 0.9 + 0.1 * Math.exp(-t * 0.8));
    intensity += w;
    x += s.x * w;
    wsum += w;
    warm += (s.palette === "white" ? 0.3 : s.palette === "orange" ? 1 : 0.7) * w;
  });
  return { intensity: Math.min(1.6, intensity), x: wsum ? x / wsum : 540, warmth: wsum ? warm / wsum : 0.7 };
};
