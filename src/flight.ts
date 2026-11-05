import * as THREE from "three";
import { ARC_CENTERLINE, LOGO_BOUNDS } from "./logoPaths";
import { HEIGHT, T, WIDTH } from "./timeline";

/* ------------------------------------------------------------------ */
/*  Logo placement on screen (shared by the 2D layers and the 3D path) */
/* ------------------------------------------------------------------ */
/** on-screen width of the full lockup (arc tip to ® / letter edge) */
export const LOGO_SCREEN_WIDTH = 1160;
const LOGO_W = LOGO_BOUNDS.x1 - LOGO_BOUNDS.x0;
export const LOGO_SCALE = LOGO_SCREEN_WIDTH / LOGO_W;
// optical centre of the lockup (arc top → tagline baseline)
export const LOGO_CENTER_VB = { x: (LOGO_BOUNDS.x0 + LOGO_BOUNDS.x1) / 2, y: (LOGO_BOUNDS.y0 + LOGO_BOUNDS.y1) / 2 };
export const vbToScreen = (x: number, y: number) => ({
  x: WIDTH / 2 + (x - LOGO_CENTER_VB.x) * LOGO_SCALE,
  y: HEIGHT / 2 + (y - LOGO_CENTER_VB.y) * LOGO_SCALE,
});

/* ------------------------------------------------------------------ */
/*  Easing helpers                                                     */
/* ------------------------------------------------------------------ */
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ramp = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const smooth = (t: number) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------------ */
/*  Camera                                                             */
/* ------------------------------------------------------------------ */
export const FINAL_CAM = {
  pos: new THREE.Vector3(0, 20, 0),
  fov: 35,
};

const camZ = (f: number) => {
  const t = clamp01(f / T.cameraSettle);
  // fast push through the clouds, gliding to rest
  return 430 * Math.pow(1 - t, 2.1);
};
const camY = (f: number) => lerp(4, FINAL_CAM.pos.y, smooth(clamp01(f / 150)));

export type CameraState = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
};

// deterministic low-frequency "handheld" noise
const wobble = (f: number, seed: number) =>
  Math.sin(f * 0.071 + seed) * 0.6 + Math.sin(f * 0.137 + seed * 2.1) * 0.3 + Math.sin(f * 0.29 + seed * 3.7) * 0.1;

export const getCamera = (f: number): CameraState => {
  const position = new THREE.Vector3(0, camY(f), camZ(f));
  const settle = 1 - ramp(f, 150, T.cameraSettle);

  // flyby shake: peaks as the jet passes overhead
  const shakeAmt = Math.exp(-Math.pow((f - FLYBY_PASS_FRAME) / 9, 2)) * 0.55 + 0.06 * settle;
  position.x += wobble(f * 3.1, 1) * shakeAmt;
  position.y += wobble(f * 2.7, 4) * shakeAmt * 0.7;

  // look slightly up during the ascent, track the jet a little after it passes
  const pitchUp = lerp(0.1, 0, smooth(ramp(f, 20, 120)));
  const base = position.clone().add(new THREE.Vector3(0, pitchUp * 100, -100));
  const jet = flightPose(sAtFrame(f)).position;
  const track = Math.sin(Math.PI * ramp(f, 112, 186)) * 0.22;
  const toJet = jet.clone().sub(position).normalize().multiplyScalar(100).add(position);
  const target = base.lerp(toJet, track);
  const finalTarget = FINAL_CAM.pos.clone().add(new THREE.Vector3(0, 0, -100));
  target.lerp(finalTarget, smooth(ramp(f, 160, T.cameraSettle)));

  const fov = lerp(44, FINAL_CAM.fov, smooth(ramp(f, 0, T.cameraSettle)));
  const roll = (wobble(f, 9) * 0.012 + Math.sin(Math.PI * ramp(f, 104, 170)) * -0.05) * settle;
  return { position, target, fov, roll };
};

export const makeCamera = (f: number) => {
  const c = getCamera(f);
  const cam = new THREE.PerspectiveCamera(c.fov, WIDTH / HEIGHT, 0.5, 20000);
  cam.position.copy(c.position);
  cam.up.set(Math.sin(c.roll), Math.cos(c.roll), 0);
  cam.lookAt(c.target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
};

/** Project a world point to screen pixels with the frame's camera. z > 1 = behind camera. */
export const projectToScreen = (cam: THREE.PerspectiveCamera, p: THREE.Vector3) => {
  const v = p.clone().project(cam);
  return { x: (v.x * 0.5 + 0.5) * WIDTH, y: (-v.y * 0.5 + 0.5) * HEIGHT, z: v.z };
};

/* ------------------------------------------------------------------ */
/*  The logo arc, lifted into world space                              */
/*  Unprojected from its exact screen position through the final       */
/*  camera at a fixed depth, so the jet's flight path *is* the arc.    */
/* ------------------------------------------------------------------ */
export const ARC_DEPTH = 640;
const unprojectFinal = (sx: number, sy: number, depth: number) => {
  const tanH = Math.tan(THREE.MathUtils.degToRad(FINAL_CAM.fov / 2));
  const ndcX = (sx / WIDTH) * 2 - 1;
  const ndcY = -((sy / HEIGHT) * 2 - 1);
  return new THREE.Vector3(
    FINAL_CAM.pos.x + ndcX * depth * tanH * (WIDTH / HEIGHT),
    FINAL_CAM.pos.y + ndcY * depth * tanH,
    FINAL_CAM.pos.z - depth,
  );
};
export const ARC_WORLD = ARC_CENTERLINE.map(([x, y]) => {
  const s = vbToScreen(x, y);
  return unprojectFinal(s.x, s.y, ARC_DEPTH);
});

/* ------------------------------------------------------------------ */
/*  Flight path: overtake the camera, dive to the horizon, bank into   */
/*  the arc, trace it left→right, climb away into the sun.            */
/* ------------------------------------------------------------------ */
const approach = [
  new THREE.Vector3(30, 50, 760),
  new THREE.Vector3(14, 45, 420),
  new THREE.Vector3(6, 40, 90),
  new THREE.Vector3(-34, 29, -170),
  new THREE.Vector3(-118, 15, -420),
  new THREE.Vector3(-196, 13, -598),
];
const arcFirst = ARC_WORLD[0];
const arcLast = ARC_WORLD[ARC_WORLD.length - 1];
const exitPts = [
  new THREE.Vector3(arcLast.x + 70, arcLast.y - 35, arcLast.z - 20),
  new THREE.Vector3(arcLast.x + 180, arcLast.y - 75, arcLast.z - 60),
];
// lead-in point aligned with the arc's initial tangent for a clean entry
const t0 = ARC_WORLD[1].clone().sub(arcFirst).normalize();
const leadIn = arcFirst.clone().addScaledVector(t0, -38);

const CONTROL = [...approach, leadIn, ...ARC_WORLD, ...exitPts];
const ARC_START_INDEX = approach.length + 1;
const ARC_END_INDEX = ARC_START_INDEX + ARC_WORLD.length - 1;
export const FLIGHT_CURVE = new THREE.CatmullRomCurve3(CONTROL, false, "centripetal");

// arc-length table
const SAMPLES = 6000;
const tTable: number[] = [];
const sTable: number[] = [];
{
  let s = 0;
  let prev = FLIGHT_CURVE.getPoint(0);
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const p = FLIGHT_CURVE.getPoint(t);
    if (i > 0) s += p.distanceTo(prev);
    tTable.push(t);
    sTable.push(s);
    prev = p;
  }
}
export const FLIGHT_LENGTH = sTable[sTable.length - 1];
const sAtT = (t: number) => {
  const i = Math.min(SAMPLES - 1, Math.floor(t * SAMPLES));
  const k = t * SAMPLES - i;
  return lerp(sTable[i], sTable[i + 1], k);
};
const tAtS = (s: number) => {
  if (s <= 0) return 0;
  if (s >= FLIGHT_LENGTH) return 1;
  let lo = 0;
  let hi = SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sTable[mid] < s) lo = mid;
    else hi = mid;
  }
  const k = (s - sTable[lo]) / (sTable[hi] - sTable[lo] || 1);
  return lerp(tTable[lo], tTable[hi], k);
};
const n1 = CONTROL.length - 1;
export const S_ARC_START = sAtT(ARC_START_INDEX / n1);
export const S_ARC_END = sAtT(ARC_END_INDEX / n1);

// constant cruise speed along the arc, matched to the reveal window
export const SPEED = (S_ARC_END - S_ARC_START) / (T.arcEnd - T.arcStart);

// overhead pass: the curve point nearest the camera rail at T.flybyPass
const PASS_CAM = new THREE.Vector3(0, camY(T.flybyPass), camZ(T.flybyPass));
const S_PASS = (() => {
  let best = 0;
  let bestD = Infinity;
  for (let s = 0; s < S_ARC_START; s += 0.5) {
    const d = FLIGHT_CURVE.getPoint(tAtS(s)).distanceTo(PASS_CAM);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
})();
const PASS_SPEED = 1.2 * ((S_ARC_START - S_PASS) / (T.arcStart - T.flybyPass));

/** distance flown at frame f (arc-length along FLIGHT_CURVE).
 *  Fast overtake → cubic-Hermite deceleration into the arc → constant cruise along the logo. */
export const sAtFrame = (f: number) => {
  if (f >= T.arcStart) return S_ARC_START + (f - T.arcStart) * SPEED;
  if (f <= T.flybyPass) return S_PASS - (T.flybyPass - f) * PASS_SPEED;
  const h = T.arcStart - T.flybyPass;
  const u = (f - T.flybyPass) / h;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  return h00 * S_PASS + h10 * h * PASS_SPEED + h01 * S_ARC_START + h11 * h * SPEED;
};
/** progress 0..1 of the jet along the logo arc */
export const arcProgressAtFrame = (f: number) => clamp01((sAtFrame(f) - S_ARC_START) / (S_ARC_END - S_ARC_START));

export const pointAtS = (s: number) => FLIGHT_CURVE.getPoint(tAtS(s));
export const tangentAtS = (s: number) => FLIGHT_CURVE.getTangent(tAtS(s)).normalize();

export type Pose = { position: THREE.Vector3; quaternion: THREE.Quaternion; forward: THREE.Vector3; up: THREE.Vector3; right: THREE.Vector3; bank: number };

export const flightPose = (s: number): Pose => {
  const position = pointAtS(s);
  const forward = tangentAtS(s);
  const ahead = tangentAtS(s + 40);
  // bank into turns (horizontal curvature)
  const turn = new THREE.Vector3().crossVectors(forward, ahead).y;
  let bank = THREE.MathUtils.clamp(turn * 9, -0.9, 0.9);
  // while tracing the arc, roll toward camera so the planform reads against the sun
  const onArc = clamp01((s - S_ARC_START + 60) / 120) * (1 - clamp01((s - S_ARC_END) / 120));
  bank += onArc * -0.42;
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const up0 = new THREE.Vector3().crossVectors(right, forward).normalize();
  const up = up0.clone().applyAxisAngle(forward, bank);
  const r = new THREE.Vector3().crossVectors(forward, up).normalize();
  // object basis: +Z = nose (forward), +Y = up, +X = left wing
  const m = new THREE.Matrix4().makeBasis(r.clone().negate(), up, forward);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(m);
  return { position, quaternion, forward, up, right: r, bank };
};

// frame at which the jet is closest to the camera (drives shake + whoosh)
export const FLYBY_PASS_FRAME = (() => {
  let best = 0;
  let bestD = Infinity;
  for (let f = 60; f < 180; f += 0.5) {
    const camPos = new THREE.Vector3(0, camY(f), camZ(f));
    const d = pointAtS(sAtFrame(f)).distanceTo(camPos);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
})();

/* ------------------------------------------------------------------ */
/*  Sun                                                                */
/* ------------------------------------------------------------------ */
export const sunElevation = (f: number) => THREE.MathUtils.degToRad(lerp(-2.2, 1.6, smooth(ramp(f, 0, T.floodPeak))));
export const sunDirection = (f: number) => {
  const e = sunElevation(f);
  return new THREE.Vector3(0, Math.sin(e), -Math.cos(e)).normalize();
};
/** 0 = deep blue hour, 1 = full sunrise */
export const dawnAmount = (f: number) => smooth(ramp(f, 0, T.arcEnd));
