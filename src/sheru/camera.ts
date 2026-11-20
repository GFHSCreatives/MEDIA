import { H, W } from "./data";

/**
 * Virtual camera over a full-bleed still.
 *   s  : zoom (1 = the still exactly fills the frame)
 *   fx, fy : the point of the still (0-1) the camera looks at
 *   r  : roll in degrees
 * Keyframes are [p, s, fx, fy, r] with p = progress through the shot (0-1).
 */
export type CamKey = [p: number, s: number, fx: number, fy: number, r: number];
export type Cam = { s: number; fx: number; fy: number; r: number };

/** Transient camera events, timed in seconds from the shot's nominal start. */
export type Kick =
  | { type: "punch"; at: number; amp: number; tau: number } // zoom pop that decays
  | { type: "bump"; at: number; amp: number; dur: number; axis?: "x" | "y" }; // smooth px nudge there and back

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3);
export const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const sampleCam = (keys: CamKey[], p: number, firstSegmentEase: (t: number) => number = easeSine): Cam => {
  const q = clamp01(p);
  let i = 0;
  while (i < keys.length - 2 && q > keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = (q - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const e = i === 0 ? firstSegmentEase(t) : easeSine(t);
  return { s: lerp(a[1], b[1], e), fx: lerp(a[2], b[2], e), fy: lerp(a[3], b[3], e), r: lerp(a[4], b[4], e) };
};

/** Low-frequency hand-held drift (px, deg) -- deterministic per shot. */
export const handheld = (f: number, n: number, amount = 1) => ({
  x: amount * (2.6 * Math.sin(f * 0.061 + n * 1.7) + 1.4 * Math.sin(f * 0.157 + n * 3.1)),
  y: amount * (2.2 * Math.sin(f * 0.053 + n * 2.3) + 1.2 * Math.sin(f * 0.139 + n * 0.7)),
  r: amount * 0.045 * Math.sin(f * 0.047 + n * 0.9),
});

const HAND_MARGIN = 7; // px reserved for hand-held drift + kicks

/** Smallest zoom at which a roll of r degrees still covers the frame. */
const coverScale = (rDeg: number) => {
  const r = (Math.abs(rDeg) * Math.PI) / 180;
  const sx = Math.cos(r) + (H / W) * Math.sin(r) + (2 * HAND_MARGIN) / W;
  const sy = Math.cos(r) + (W / H) * Math.sin(r) + (2 * HAND_MARGIN) / H;
  return Math.max(sx, sy);
};

export type CamOptions = {
  f: number; // absolute frame
  n: number; // shot number (seeds the drift)
  tNominal: number; // seconds since the shot's nominal start (for kicks)
  cam: Cam;
  kicks?: Kick[];
  walk?: boolean; // add a steadicam walking bob
  handheldAmount?: number;
};

/** CSS transform for the still's wrapper (transform-origin: 0 0). The result is guaranteed to cover the frame. */
export const cameraTransform = ({ f, n, tNominal, cam, kicks = [], walk = false, handheldAmount = 1 }: CamOptions) => {
  const hh = handheld(f, n, handheldAmount);
  let s = cam.s * (1 + 0.0025 * Math.sin(f * 0.04 + n));
  let dx = hh.x;
  let dy = hh.y;
  let r = cam.r + hh.r;
  for (const k of kicks) {
    const dt = tNominal - k.at;
    if (dt < 0) continue;
    if (k.type === "punch") s *= 1 + k.amp * Math.exp(-dt / k.tau);
    else if (dt < k.dur) {
      const v = k.amp * Math.sin((Math.PI * dt) / k.dur);
      if (k.axis === "x") dx += v;
      else dy += v;
    }
  }
  if (walk) {
    const ph = Math.PI * (f / 24) * 1.9;
    dy += -6 * Math.abs(Math.sin(ph));
    r += 0.12 * Math.sin(ph);
  }
  s = Math.max(s, coverScale(r));
  // keep the looked-at point where the visible window stays inside the still
  const rr = (Math.abs(r) * Math.PI) / 180;
  const exPx = (W / 2) * Math.cos(rr) + (H / 2) * Math.sin(rr);
  const eyPx = (W / 2) * Math.sin(rr) + (H / 2) * Math.cos(rr);
  const mx = (exPx + HAND_MARGIN) / s;
  const my = (eyPx + HAND_MARGIN) / s;
  const fxPx = Math.min(W - mx, Math.max(mx, cam.fx * W));
  const fyPx = Math.min(H - my, Math.max(my, cam.fy * H));
  return `translate(${(W / 2 + dx).toFixed(2)}px, ${(H / 2 + dy).toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(${s.toFixed(5)}) translate(${(-fxPx).toFixed(2)}px, ${(-fyPx).toFixed(2)}px)`;
};
