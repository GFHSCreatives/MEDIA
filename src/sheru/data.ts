import timeline from "./timeline.json";

export const FPS = timeline.fps;
export const W = timeline.width;
export const H = timeline.height;
export const DURATION = timeline.duration;

export type TransitionType = "cut" | "dissolve" | "flashDissolve" | "pushThrough" | "fadeBlack" | "dip";
export type Shot = { n: number; start: number; end: number; in: { type: TransitionType; len: number; color?: string } };
export type Caption = { id: number; speaker: string; start: number; end: number; text: string };

export const SHOTS = timeline.shots as Shot[];
export const CAPTIONS = timeline.captions as Caption[];

/** Frames during which shot `i` must be on screen: its own span plus half of each neighbouring transition. */
export const visibleRange = (i: number) => {
  const s = SHOTS[i];
  const next = SHOTS[i + 1];
  const from = Math.max(0, s.start - Math.floor(s.in.len / 2));
  const to = next ? next.start + Math.ceil(next.in.len / 2) : DURATION;
  return { from, to };
};

export const pad2 = (n: number) => String(n).padStart(2, "0");
