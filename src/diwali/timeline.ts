// Diwali reel master timeline — 24 fps, 15 s, vertical 1080×1920 (render 4K with --scale=2).
export const D_FPS = 24;
export const D_WIDTH = 1080;
export const D_HEIGHT = 1920;
export const D_DURATION = 360;

export const DT = {
  // 01 — aviation world: aerial glide over the academy
  s1Start: 0,
  overheadPass: 34,
  s1Flash: 68, // big burst flash covers the cut
  // 02 — the celebration
  s2Start: 70,
  // 03 — magical flight
  shellLaunch: 122,
  tiltStart: 134,
  tiltEnd: 170,
  arcStart: 176,
  arcEnd: 232,
  // 04 — grand logo reveal
  impact: 240,
  convergeStart: 236,
  convergeEnd: 274,
  logoSharpStart: 262,
  logoSharpEnd: 288,
  // 05 — greeting
  greetingStart: 298,
  greetingEnd: 326,
  end: D_DURATION,
} as const;

/** how far (px) the sky sits "above" the camera during scene 02, before the tilt-up */
export const TILT_DISTANCE = 1100;
