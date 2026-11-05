import React, { useMemo } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { Aircraft } from "../three/Aircraft";
import { TexturesContext, useSceneTextures, useTextures } from "../three/useTexture";
import { HASH_GLSL } from "../three/skyGlsl";
import { fireworkLight, prng } from "./fireworks";
import { DT } from "./timeline";

/* ------------------------------------------------------------------ */
/*  Camera: high aerial glide that descends toward the academy terrace */
/* ------------------------------------------------------------------ */
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);

export const academyCamera = (f: number) => {
  const t = clamp01(f / DT.s2Start);
  const e = 1 - Math.pow(1 - t, 1.6);
  const pos = lerpV(new THREE.Vector3(-70, 250, 760), new THREE.Vector3(-240, 70, 210), e);
  pos.x += Math.sin(f * 0.05) * 2;
  pos.y += Math.sin(f * 0.07 + 1) * 1.2;
  const target = lerpV(new THREE.Vector3(-60, -20, -380), new THREE.Vector3(-262, 28, 38), smooth(clamp01((f - 6) / 64)));
  return { pos, target, fov: 62 - 6 * smooth(t) };
};

/* overhead jet on approach, landing lights on */
const JET_PASS = DT.overheadPass;
export const overheadJet = (f: number) => {
  // passes just over the camera, then sweeps down ahead of it toward the runway
  const p = (ff: number) => {
    const u = (ff - JET_PASS) / 42;
    return new THREE.Vector3(-150 - 60 * u - 30 * u * u, 212 - 110 * u + 12 * u * u, 470 - 900 * u);
  };
  const position = p(f);
  const fwd = p(f + 1).sub(position).normalize();
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd.clone().negate(), new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.05));
  return { position, quaternion: q };
};

const Rig: React.FC<{ f: number }> = ({ f }) => {
  const { camera } = useThree();
  const c = academyCamera(f);
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.copy(c.pos);
  cam.lookAt(c.target);
  cam.fov = c.fov;
  cam.near = 1;
  cam.far = 12000;
  cam.updateProjectionMatrix();
  return null;
};

/* ------------------------------------------------------------------ */
/*  Night sky                                                          */
/* ------------------------------------------------------------------ */
const NightSky: React.FC<{ camPos: THREE.Vector3; flash: number; frame: number }> = ({ camPos, flash, frame }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uFlash: { value: 0 }, uFrame: { value: 0 } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
        fragmentShader: `
          uniform float uFlash; uniform float uFrame; varying vec3 vDir;
          ${HASH_GLSL}
          void main(){
            vec3 d = normalize(vDir); float e = d.y;
            vec3 zen = vec3(0.012,0.022,0.075);
            vec3 mid = vec3(0.025,0.05,0.14);
            vec3 hor = vec3(0.11,0.09,0.16);
            vec3 col = mix(hor, mid, smoothstep(0.0,0.12,e));
            col = mix(col, zen, smoothstep(0.1,0.6,e));
            // sodium city glow on the horizon
            col += vec3(0.32,0.16,0.06) * exp(-abs(e)*22.0) * 0.55;
            // fireworks lighting the haze
            col += vec3(0.30,0.20,0.10) * uFlash * smoothstep(-0.05,0.35,e) * 0.35;
            vec3 sd = d*600.0; vec3 id = floor(sd); float h = hash13(id);
            if (h > 0.9972) { float r = length(fract(sd)-0.5); col += vec3(0.8,0.85,1.0)*smoothstep(0.3,0.0,r)*(0.4+0.6*sin(uFrame*0.3+h*500.0)*0.5+0.3)*smoothstep(0.05,0.3,e); }
            col += (hash12(gl_FragCoord.xy+uFrame)-0.5)/255.0;
            gl_FragColor = vec4(col,1.0);
          }`,
      }),
    [],
  );
  mat.uniforms.uFlash.value = flash;
  mat.uniforms.uFrame.value = frame;
  return (
    <mesh position={camPos} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[10000, 48, 24]} />
    </mesh>
  );
};

/* ------------------------------------------------------------------ */
/*  Light points (runway, taxiway, city, Diwali strings …)            */
/* ------------------------------------------------------------------ */
type LightPt = { p: [number, number, number]; c: THREE.Color; s: number; kind: number; seed: number };
// kind: 0 steady, 1 Diwali twinkle, 2 approach "rabbit", 3 red obstruction blink, 4 city shimmer
const LightField: React.FC<{ pts: LightPt[]; frame: number }> = ({ pts, frame }) => {
  const glow = useTextures().glow;
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts.flatMap((l) => l.p)), 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(pts.map((l) => l.s)), 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: glow }, uScale: { value: 1 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; varying vec3 vC; varying float vFog;
        uniform float uScale;
        void main(){
          vC = aColor;
          vec4 mv = modelViewMatrix*vec4(position,1.0);
          float d = -mv.z;
          vFog = 1.0 - smoothstep(900.0, 5200.0, d) * 0.65;
          // physically-attenuated size with a 1.6px floor so distant lights still read
          gl_PointSize = max(3.0 * uScale, aSize * uScale * 5200.0 / d);
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying vec3 vC; varying float vFog;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * t.a * vFog * 1.5, 1.0); }`,
    });
    return { geo: g, mat: m };
  }, [pts, glow]);
  const col = geo.attributes.aColor as THREE.BufferAttribute;
  pts.forEach((l, i) => {
    let k = 1;
    if (l.kind === 1) k = 0.55 + 0.45 * Math.sin(frame * 0.35 + l.seed * 6.28) ** 2;
    if (l.kind === 2) {
      const phase = (frame % 12) / 12;
      k = Math.abs(l.seed - phase) < 0.08 ? 3.5 : 0.0;
    }
    if (l.kind === 3) k = frame % 24 < 12 ? 1 : 0.1;
    if (l.kind === 4) k = 0.75 + 0.25 * Math.sin(frame * 0.2 + l.seed * 40);
    col.setXYZ(i, l.c.r * k, l.c.g * k, l.c.b * k);
  });
  col.needsUpdate = true;
  const { size } = useThree();
  mat.uniforms.uScale.value = size.height / 1920;
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
};

/* ------------------------------------------------------------------ */
/*  Procedural assets                                                  */
/* ------------------------------------------------------------------ */
const windowTexture = (seed: number, cols: number, rows: number) => {
  const r = prng(seed);
  const cv = document.createElement("canvas");
  cv.width = cols * 16;
  cv.height = rows * 24;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const on = r();
      if (on < 0.28) continue;
      const warm = r() < 0.75;
      const v = 0.35 + r() * 0.65;
      ctx.fillStyle = warm ? `rgba(255,${170 + r() * 40},${90 + r() * 30},${v})` : `rgba(200,220,255,${v * 0.7})`;
      ctx.fillRect(x * 16 + 3, y * 24 + 5, 10, 14);
    }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  return t;
};

const Building: React.FC<{ p: [number, number, number]; s: [number, number, number]; seed: number }> = ({ p, s, seed }) => {
  const mats = useMemo(() => {
    const cols = Math.max(2, Math.round(s[0] / 6));
    const colsZ = Math.max(2, Math.round(s[2] / 6));
    const rows = Math.max(1, Math.round(s[1] / 4.2));
    const side = (c: number, k: number) =>
      new THREE.MeshStandardMaterial({ color: "#16181f", roughness: 0.85, emissive: "#ffffff", emissiveMap: windowTexture(seed + k, c, rows), emissiveIntensity: 1.1 });
    const roof = new THREE.MeshStandardMaterial({ color: "#101218", roughness: 0.9 });
    return [side(colsZ, 1), side(colsZ, 2), roof, roof, side(cols, 3), side(cols, 4)];
  }, [s, seed]);
  return (
    <mesh position={[p[0], p[1] + s[1] / 2, p[2]]} material={mats}>
      <boxGeometry args={s} />
    </mesh>
  );
};

const palmGeometry = () => {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.35, 0.6, 16, 8, 8);
  const tp = trunk.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i) + 8;
    tp.setX(i, tp.getX(i) + Math.pow(y / 16, 2) * 2.2);
  }
  trunk.translate(0, 8, 0);
  parts.push(trunk);
  for (let k = 0; k < 11; k++) {
    const fr = new THREE.PlaneGeometry(1.3, 7.5, 1, 8);
    const fp = fr.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const y = fp.getY(i) + 3.75; // 0..7.5 along frond
      const w = Math.sin((y / 7.5) * Math.PI) * 0.9 + 0.1;
      fp.setX(i, fp.getX(i) * w);
      fp.setZ(i, -Math.pow(y / 7.5, 2) * 3.4); // droop
      fp.setY(i, y);
    }
    fr.rotateX(-Math.PI / 2.6);
    fr.rotateY((k / 11) * Math.PI * 2 + (k % 2) * 0.2);
    fr.translate(2.2, 16, 0);
    parts.push(fr);
  }
  // merge
  let count = 0;
  parts.forEach((g) => (count += (g.index ? g.index.count : g.attributes.position.count)));
  const pos: number[] = [];
  parts.forEach((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const a = ng.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i));
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
};

const Palms: React.FC<{ spots: [number, number, number, number][] }> = ({ spots }) => {
  const geo = useMemo(palmGeometry, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0b100b", roughness: 0.9, side: THREE.DoubleSide }), []);
  return (
    <>
      {spots.map(([x, z, s, ry], i) => (
        <mesh key={i} geometry={geo} material={mat} position={[x, 0, z]} scale={s} rotation={[0, ry, 0]} />
      ))}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Airport + academy layout                                           */
/* ------------------------------------------------------------------ */
const RUNWAY_X = 150;
const buildLights = (): LightPt[] => {
  const r = prng(42);
  const L: LightPt[] = [];
  const C = (h: string) => new THREE.Color(h);
  // runway edge + centreline
  for (let z = 220; z > -3400; z -= 60) {
    L.push({ p: [RUNWAY_X - 24, 0.6, z], c: C("#fff1c8"), s: 2.2, kind: 0, seed: 0 });
    L.push({ p: [RUNWAY_X + 24, 0.6, z], c: C("#fff1c8"), s: 2.2, kind: 0, seed: 0 });
    if (z % 120 === 100) L.push({ p: [RUNWAY_X, 0.3, z], c: C("#ffffff").multiplyScalar(0.5), s: 1.3, kind: 0, seed: 0 });
  }
  for (let x = -22; x <= 22; x += 4) {
    L.push({ p: [RUNWAY_X + x, 0.6, 226], c: C("#3dff7a"), s: 2.0, kind: 0, seed: 0 });
    L.push({ p: [RUNWAY_X + x, 0.6, -3400], c: C("#ff3030"), s: 2.0, kind: 0, seed: 0 });
  }
  // approach lighting with sequenced "rabbit" strobes
  for (let i = 1; i <= 14; i++) {
    const z = 226 + i * 36;
    for (let x = -6; x <= 6; x += 3) L.push({ p: [RUNWAY_X + x, 1, z], c: C("#fff8e6"), s: 2.0, kind: 0, seed: 0 });
    L.push({ p: [RUNWAY_X, 1.5, z], c: C("#ffffff"), s: 3.5, kind: 2, seed: 1 - i / 14 });
  }
  // taxiway (blue) from runway to apron
  for (let t = 0; t <= 1; t += 0.035) {
    const x = RUNWAY_X - 30 - t * 190;
    const z = -260 - Math.sin(t * Math.PI) * 30;
    L.push({ p: [x, 0.5, z - 12], c: C("#3a74ff"), s: 1.8, kind: 0, seed: 0 });
    L.push({ p: [x, 0.5, z + 12], c: C("#3a74ff"), s: 1.8, kind: 0, seed: 0 });
  }
  // apron floodlight heads
  for (const [x, z] of [[-40, -380], [-110, -380], [-180, -380], [-40, -560], [-180, -560]] as const) {
    L.push({ p: [x, 26, z], c: C("#ffcf8a"), s: 7, kind: 0, seed: 0 });
  }
  // distant city across the horizon
  for (let i = 0; i < 2400; i++) {
    const z = -2600 - r() * 3200;
    const x = (r() * 2 - 1) * (2200 + (-z - 2600) * 0.9);
    const sodium = r() < 0.7;
    L.push({ p: [x, r() * 8, z], c: sodium ? C("#ffae52").multiplyScalar(0.7) : C("#fff0d0").multiplyScalar(0.6), s: 2.4 + r() * 2, kind: 4, seed: r() });
  }
  // Diwali light strings along academy roof edges and facades
  const string = (a: [number, number, number], b: [number, number, number], n: number, sag = 0) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const warm = r();
      L.push({
        p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t],
        c: warm < 0.75 ? C("#ffc45a") : warm < 0.9 ? C("#ff8a2a") : C("#fff2d0"),
        s: 0.9,
        kind: 1,
        seed: r(),
      });
    }
  };
  for (const b of ACADEMY) {
    const [x, , z] = b.p;
    const [w, h, d] = b.s;
    const y = h + 0.3;
    string([x - w / 2, y, z + d / 2], [x + w / 2, y, z + d / 2], Math.round(w / 1.6));
    string([x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], Math.round(w / 1.6));
    string([x - w / 2, y, z - d / 2], [x - w / 2, y, z + d / 2], Math.round(d / 1.6));
    string([x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], Math.round(d / 1.6));
    // vertical cascades on the front facade
    for (let k = 1; k < 6; k++) {
      const xx = x - w / 2 + (w * k) / 6;
      string([xx, y, z + d / 2 + 0.3], [xx, 2, z + d / 2 + 0.3], Math.round(h / 1.4));
    }
  }
  // terrace festoons + diyas where the celebration is
  string([-292, 31, 52], [-232, 31, 52], 36, 1.6);
  string([-292, 31, 22], [-232, 31, 22], 36, 1.6);
  for (let i = 0; i < 26; i++) L.push({ p: [-290 + i * 2.2, 30.4, 58], c: C("#ff9a3c"), s: 1.3, kind: 1, seed: r() });
  // streetlight heads
  for (const st of STREETS) for (const [x, z] of st) L.push({ p: [x, 11, z], c: C("#ffb860"), s: 3, kind: 0, seed: 0 });
  // tower obstruction light
  L.push({ p: [-40, 58, -150], c: C("#ff2a2a"), s: 4, kind: 3, seed: 0 });
  return L;
};

const ACADEMY: { p: [number, number, number]; s: [number, number, number]; seed: number }[] = [
  { p: [-262, 0, 38], s: [70, 30, 46], seed: 11 }, // main academy block (terrace on top)
  { p: [-330, 0, -40], s: [46, 22, 80], seed: 21 },
  { p: [-205, 0, -60], s: [40, 18, 40], seed: 31 },
  { p: [-300, 0, 140], s: [90, 14, 36], seed: 41 },
];

const Hangar: React.FC = () => (
  <group position={[-110, 0, -470]}>
    <mesh position={[0, 12, 0]}>
      <boxGeometry args={[110, 24, 70]} />
      <meshStandardMaterial color="#14161c" roughness={0.8} />
    </mesh>
    <mesh position={[0, 24, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[35, 35, 110, 24, 1, false, 0, Math.PI]} />
      <meshStandardMaterial color="#1a1c22" roughness={0.7} metalness={0.3} />
    </mesh>
    {/* open door glow */}
    <mesh position={[0, 11, 35.2]}>
      <planeGeometry args={[80, 20]} />
      <meshBasicMaterial color="#ffd8a0" toneMapped={false} />
    </mesh>
  </group>
);

const Tower: React.FC = () => (
  <group position={[-40, 0, -150]}>
    <mesh position={[0, 22, 0]}>
      <cylinderGeometry args={[3.2, 4.2, 44, 16]} />
      <meshStandardMaterial color="#1a1c22" roughness={0.8} />
    </mesh>
    <mesh position={[0, 48, 0]}>
      <cylinderGeometry args={[8, 6, 7, 12]} />
      <meshStandardMaterial color="#0d1118" emissive="#9fd0ff" emissiveIntensity={0.55} roughness={0.2} metalness={0.6} />
    </mesh>
    <mesh position={[0, 53, 0]}>
      <cylinderGeometry args={[8.6, 8.6, 1.2, 12]} />
      <meshStandardMaterial color="#14161c" />
    </mesh>
  </group>
);

/** additive light pools on the ground under streetlights / floods / festive strings */
const LightPools: React.FC<{ pools: [number, number, number, string, number][] }> = ({ pools }) => {
  const glow = useTextures().glow;
  return (
    <>
      {pools.map(([x, z, r, c, k], i) => (
        <mesh key={i} position={[x, 0.15, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <planeGeometry args={[r * 2, r * 2]} />
          <meshBasicMaterial map={glow} color={new THREE.Color(c).multiplyScalar(k)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
};

const STREETS: [number, number][][] = [
  // campus avenue to the gate, and the perimeter road along the runway
  Array.from({ length: 16 }, (_, i) => [-200 + (i % 2 ? 14 : -14), 320 - i * 40] as [number, number]),
  Array.from({ length: 22 }, (_, i) => [70, 420 - i * 60] as [number, number]),
  Array.from({ length: 10 }, (_, i) => [-420 + i * 40, 230] as [number, number]),
];

const Runway: React.FC = () => (
  <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[RUNWAY_X, 0.05, -1600]}>
      <planeGeometry args={[46, 3700]} />
      <meshStandardMaterial color="#121419" roughness={0.6} metalness={0.1} />
    </mesh>
    {Array.from({ length: 60 }, (_, i) => (
      <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[RUNWAY_X, 0.1, 180 - i * 60]}>
        <planeGeometry args={[0.9, 30]} />
        <meshBasicMaterial color="#5c5f66" />
      </mesh>
    ))}
    {/* apron */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-110, 0.04, -470]}>
      <planeGeometry args={[240, 260]} />
      <meshStandardMaterial color="#17181d" roughness={0.7} />
    </mesh>
  </group>
);

const LandingLights: React.FC<{ jet: ReturnType<typeof overheadJet>; camPos: THREE.Vector3 }> = ({ jet, camPos }) => {
  const glow = useTextures().glow;
  const d = jet.position.distanceTo(camPos);
  const s = Math.max(8, d * 0.05);
  return (
    <group position={jet.position} quaternion={jet.quaternion}>
      {[-3.2, 3.2].map((x) => (
        <sprite key={x} position={[x, -1.4, 6]} scale={[s, s, 1]}>
          <spriteMaterial map={glow} color="#fff6e8" blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
};

const World: React.FC<{ f: number }> = ({ f }) => {
  const lights = useMemo(buildLights, []);
  const cam = academyCamera(f);
  const fl = fireworkLight(f);
  const jet = overheadJet(f);
  const palms = useMemo(() => {
    const r = prng(5);
    const out: [number, number, number, number][] = [];
    for (let i = 0; i < 46; i++) {
      out.push([-420 + r() * 330, -120 + r() * 330, 0.9 + r() * 0.6, r() * 6.28]);
    }
    return out.filter(([x, z]) => !ACADEMY.some((b) => Math.abs(x - b.p[0]) < b.s[0] / 2 + 4 && Math.abs(z - b.p[2]) < b.s[2] / 2 + 4));
  }, []);
  const flashCol = new THREE.Color("#ffd9a0").multiplyScalar(fl.intensity);
  return (
    <>
      <Rig f={f} />
      <fog attach="fog" args={["#0d1330", 500, 5200]} />
      <NightSky camPos={cam.pos} flash={fl.intensity} frame={f} />
      <hemisphereLight args={[new THREE.Color("#2a3e78"), new THREE.Color("#120c08"), 0.55 + fl.intensity * 0.9]} />
      <directionalLight position={[-600, 900, 400]} color="#9fb4ff" intensity={0.45} />
      <pointLight position={[fl.x - 540 - 260, 260, -200]} color={flashCol} intensity={fl.intensity * 2600} distance={2400} decay={1.2} />
      {[[-40, -380], [-110, -380], [-180, -380], [-40, -560], [-180, -560]].map(([x, z], i) => (
        <pointLight key={i} position={[x, 26, z]} color="#ffc27a" intensity={700} distance={300} decay={1.6} />
      ))}
      <pointLight position={[-262, 44, 38]} color="#ffb04a" intensity={380} distance={200} decay={1.6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2000]}>
        <planeGeometry args={[14000, 14000]} />
        <meshStandardMaterial color="#090b10" roughness={0.95} />
      </mesh>
      <Runway />
      <LightPools
        pools={[
          ...STREETS.flat().map(([x, z]) => [x, z, 22, "#ff9d45", 0.55] as [number, number, number, string, number]),
          ...([[-40, -380], [-110, -380], [-180, -380], [-40, -560], [-180, -560]] as const).map(([x, z]) => [x, z, 70, "#ffcf8a", 0.35] as [number, number, number, string, number]),
          ...ACADEMY.map((b) => [b.p[0], b.p[2] + b.s[2] / 2 + 8, b.s[0] * 0.7, "#ffb04a", 0.45] as [number, number, number, string, number]),
          [-110, -430, 60, "#ffd8a0", 0.6],
        ]}
      />
      {/* road surfaces */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-200, 0.06, 20]}>
        <planeGeometry args={[18, 640]} />
        <meshStandardMaterial color="#1a1b20" roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[70, 0.06, -200]}>
        <planeGeometry args={[14, 1300]} />
        <meshStandardMaterial color="#1a1b20" roughness={0.8} />
      </mesh>
      {ACADEMY.map((b) => (
        <Building key={b.seed} {...b} />
      ))}
      <Hangar />
      <Tower />
      <Palms spots={palms} />
      {/* the flagship trainer jet on the floodlit apron */}
      <group position={[-90, 5.2, -470]} rotation={[0, 0.65, 0]} scale={1.55}>
        <Aircraft position={new THREE.Vector3()} quaternion={new THREE.Quaternion()} frame={f} camPos={cam.pos} sunIntensity={0} />
      </group>
      <LightField pts={lights} frame={f} />
      {f < DT.s2Start && (
        <>
          <Aircraft position={jet.position} quaternion={jet.quaternion} frame={f} camPos={cam.pos} sunIntensity={0} />
          <LandingLights jet={jet} camPos={cam.pos} />
        </>
      )}
    </>
  );
};

export const AcademyScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const textures = useSceneTextures();
  if (!textures) return null;
  return (
    <ThreeCanvas width={width} height={height} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}>
      <TexturesContext.Provider value={textures}>
        <World f={frame} />
      </TexturesContext.Provider>
    </ThreeCanvas>
  );
};
