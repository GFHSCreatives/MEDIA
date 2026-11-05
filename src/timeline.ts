// Master timeline (30 fps). Every scene, overlay and the sound design key off these.
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 420; // 14.0 s

export const T = {
  // 1. Pre-dawn ascent through the cloud deck
  ascentStart: 0,
  // 2. Jet overtakes the camera and banks toward the horizon
  flybyPass: 112, // frame the jet passes overhead (flight.ts solves the path timing around it)
  cameraSettle: 190, // camera reaches its locked final pose
  // 3. Jet traces the GLOBAL arc across the sunrise
  arcStart: 196,
  arcEnd: 256,
  // 4. Sunrise floods the frame to white
  floodStart: 240,
  floodPeak: 268,
  floodEnd: 292,
  // 5. Wordmark is revealed from the flight line
  lineStart: 270,
  lettersStart: 282,
  lettersEnd: 326,
  lineRetract: 318,
  // 6. Tagline + ® settle in, hero hold with a light sweep along the arc
  taglineStart: 322,
  sheenStart: 336,
  sheenEnd: 368,
  regMark: 362,
  end: DURATION,
} as const;
