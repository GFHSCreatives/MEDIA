import type { CamKey, Kick } from "./camera";

export type Hero = "search" | "map7" | "map8" | "map9" | "plane";
export type DustCfg = {
  count: number;
  tint: [number, number, number];
  size: [number, number];
  alpha: number;
  /** px/s: mean drift of the motes */
  drift?: [number, number];
};

/**
 * Per-shot direction. Times are seconds from the shot's nominal start.
 * Camera moves are deliberately small: the stills hold 540x960 of real detail, so
 * zoom stays <= 1.4 and most shots end between 1.12 and 1.28.
 */
export type ShotCfg = {
  cam: CamKey[];
  firstEase?: "sine" | "out";
  kicks?: Kick[];
  walk?: boolean;
  dust?: DustCfg;
  glint?: [at: number, dur: number][];
  sparkles?: number;
  lights?: number;
  haze?: boolean;
  hero?: Hero;
  vignette?: number;
};

const PALACE: DustCfg = { count: 74, tint: [255, 214, 140], size: [0.8, 3.4], alpha: 0.55, drift: [4, -9] };
const SPARKS_RISING: DustCfg = { count: 96, tint: [255, 226, 160], size: [0.8, 3.2], alpha: 0.7, drift: [3, -46] };
const DUSK: DustCfg = { count: 40, tint: [255, 232, 200], size: [0.7, 2.6], alpha: 0.42, drift: [6, -6] };
const COOL: DustCfg = { count: 26, tint: [222, 226, 255], size: [0.6, 2.2], alpha: 0.34, drift: [8, -4] };
const SUN: DustCfg = { count: 56, tint: [255, 246, 222], size: [0.8, 3.0], alpha: 0.5, drift: [10, -12] };

export const CFG: Record<number, ShotCfg> = {
  1: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.2, 0.6, 0.4, -0.6]], dust: PALACE, glint: [[0.9, 1.5]], sparkles: 12 },
  2: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.18, 0.56, 0.36, 0]], dust: PALACE, glint: [[1.5, 1.6], [4.0, 1.6]], sparkles: 14 },
  3: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.16, 0.52, 0.3, 0]], dust: PALACE, glint: [[0.5, 1.4]], sparkles: 8, kicks: [{ type: "bump", at: 0.9, amp: 12, dur: 0.8 }] },
  4: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.22, 0.5, 0.34, 0]], dust: PALACE, glint: [[1.2, 1.4]], sparkles: 6, hero: "search" },
  5: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.2, 0.38, 0.54, 0]], dust: PALACE, glint: [[1.2, 1.6]], sparkles: 12 },
  6: {
    cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.18, 0.62, 0.36, 0]],
    dust: PALACE,
    glint: [[0.6, 1.4], [2.6, 1.4]],
    sparkles: 14,
    kicks: [{ type: "punch", at: 1.75, amp: 0.012, tau: 0.16 }, { type: "bump", at: 1.75, amp: 6, dur: 0.22 }],
  },
  7: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.28, 0.42, 0.46, 0]], dust: SPARKS_RISING, glint: [[0.5, 1.6]], sparkles: 12, hero: "map7" },
  8: { cam: [[0, 1.28, 0.47, 0.55, 0], [1, 1.04, 0.5, 0.5, 0]], firstEase: "out", dust: SPARKS_RISING, glint: [[1.2, 1.8]], sparkles: 12, hero: "map8" },
  9: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.2, 0.52, 0.3, 0]], dust: PALACE, glint: [[1.0, 1.5], [3.2, 1.5]], sparkles: 12, hero: "map9" },
  10: { cam: [[0, 1.22, 0.3, 0.45, 0], [1, 1.06, 0.6, 0.45, 0]], dust: DUSK, glint: [[0.8, 1.6]], sparkles: 16, lights: 30, haze: true },
  11: { cam: [[0, 1.4, 0.5, 0.8, 0], [0.5, 1.0, 0.5, 0.5, 0], [1, 1.1, 0.5, 0.4, 0]], firstEase: "out", dust: COOL, glint: [[2.0, 1.8]], sparkles: 10, lights: 60 },
  12: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.2, 0.58, 0.3, 0]], dust: DUSK, glint: [[1.2, 1.4]], sparkles: 14, kicks: [{ type: "punch", at: 0.1, amp: 0.07, tau: 0.22 }] },
  13: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.14, 0.55, 0.48, 0]], dust: COOL, sparkles: 4, lights: 70 },
  14: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.18, 0.42, 0.32, 0]], dust: DUSK, glint: [[2.0, 1.6]], sparkles: 8, lights: 40 },
  15: { cam: [[0, 1.04, 0.46, 0.4, 0], [1, 1.2, 0.58, 0.48, 0]], dust: PALACE, glint: [[1.0, 1.6], [3.6, 1.6]], sparkles: 12, lights: 30 },
  16: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.14, 0.46, 0.58, 0]], dust: SUN, glint: [[0.2, 1.2]], sparkles: 10, lights: 20 },
  17: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.16, 0.5, 0.42, 0]], walk: true, dust: SUN, glint: [[0.4, 1.4]], sparkles: 12 },
  18: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.12, 0.48, 0.4, 0]], dust: SUN, glint: [[0.5, 1.4]], sparkles: 6, hero: "plane" },
  19: { cam: [[0, 1.0, 0.5, 0.5, 0], [1, 1.03, 0.5, 0.5, 0]], vignette: 0 },
};
