import React, { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ARC_BOUNDS, ARC_CENTERLINE, ARC_PATH, ARC_STOPS, INK, LETTERS, LOGO_BOUNDS, REG, REG_INK, TAGLINE } from "../logoPaths";
import { Aircraft } from "../three/Aircraft";
import { TexturesContext, useSceneTextures } from "../three/useTexture";
import { prng, skyOffset } from "./fireworks";
import { ensureFonts, GREETING_FONT } from "./fonts";
import pointsJson from "./logoPoints.json";
import { D_HEIGHT, D_WIDTH, DT } from "./timeline";

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */
export const LOGO_W = 900;
export const LOGO_S = LOGO_W / (LOGO_BOUNDS.x1 - LOGO_BOUNDS.x0);
export const LOGO_CX = 540;
export const LOGO_CY = 900;
const VB_CX = (LOGO_BOUNDS.x0 + LOGO_BOUNDS.x1) / 2;
const VB_CY = (LOGO_BOUNDS.y0 + LOGO_BOUNDS.y1) / 2;
export const vb2s = (x: number, y: number) => ({ x: LOGO_CX + (x - VB_CX) * LOGO_S, y: LOGO_CY + (y - VB_CY) * LOGO_S });
const U = (LETTERS[2].y1 - LETTERS[2].y0) / 85; // design unit in artwork px

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// arc centre line in screen space with cumulative length
const ARC_S = ARC_CENTERLINE.map(([x, y]) => vb2s(x, y));
const ARC_LEN: number[] = [0];
for (let i = 1; i < ARC_S.length; i++) ARC_LEN.push(ARC_LEN[i - 1] + Math.hypot(ARC_S[i].x - ARC_S[i - 1].x, ARC_S[i].y - ARC_S[i - 1].y));
const ARC_TOTAL = ARC_LEN[ARC_LEN.length - 1];
export const arcPoint = (p: number) => {
  const target = clamp01(p) * ARC_TOTAL;
  let k = 1;
  while (k < ARC_LEN.length - 1 && ARC_LEN[k] < target) k++;
  const u = (target - ARC_LEN[k - 1]) / (ARC_LEN[k] - ARC_LEN[k - 1] || 1);
  const a = ARC_S[k - 1];
  const b = ARC_S[k];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, tx: (b.x - a.x) / (ARC_LEN[k] - ARC_LEN[k - 1] || 1), ty: (b.y - a.y) / (ARC_LEN[k] - ARC_LEN[k - 1] || 1) };
};
/** jet progress along the arc (0..1, may exceed 1 as it exits) */
export const jetP = (f: number) => (f - DT.arcStart) / (DT.arcEnd - DT.arcStart);
const TAIL = 38 / ARC_TOTAL;

/* ------------------------------------------------------------------ */
/*  Hero shell: golden firework that rises and becomes the flight path */
/* ------------------------------------------------------------------ */
const TIP = arcPoint(0);
const SHELL_P = [
  { x: 150, y: 2380 },
  { x: 70, y: 1500 },
  { x: TIP.x - TIP.tx * 150, y: TIP.y - TIP.ty * 150 },
  { x: TIP.x, y: TIP.y },
];
const bez = (t: number) => {
  const [a, b, c, d] = SHELL_P;
  const m = 1 - t;
  return { x: m * m * m * a.x + 3 * m * m * t * b.x + 3 * m * t * t * c.x + t * t * t * d.x, y: m * m * m * a.y + 3 * m * m * t * b.y + 3 * m * t * t * c.y + t * t * t * d.y };
};
const shellU = (f: number) => {
  const u = clamp01((f - DT.shellLaunch) / (DT.arcStart - DT.shellLaunch));
  return 1 - Math.pow(1 - u, 1.6);
};

/** shared spark/ember drawing on a canvas */
const HeroCanvas: React.FC = () => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, D_WIDTH, D_HEIGHT);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    const oy = (f: number) => skyOffset(f);
    // --- rising shell (in sky space, so it rides the camera tilt) ---
    if (frame >= DT.shellLaunch && frame <= DT.arcStart + 2) {
      for (let k = 0; k < 26; k++) {
        const f0 = frame - k * 0.7;
        if (f0 < DT.shellLaunch) break;
        const a = bez(shellU(f0));
        const b = bez(shellU(f0 - 0.7));
        const al = (1 - k / 26) ** 1.5;
        // gold → brand orange as it nears the arc
        const warm = shellU(f0);
        ctx.strokeStyle = `rgba(255,${Math.round(214 - 84 * warm)},${Math.round(128 - 96 * warm)},${al})`;
        ctx.lineWidth = 4.2 - k * 0.12;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y + oy(f0));
        ctx.lineTo(b.x, b.y + oy(f0 - 0.7));
        ctx.stroke();
      }
      const h = bez(shellU(frame));
      const g = ctx.createRadialGradient(h.x, h.y + oy(frame), 0, h.x, h.y + oy(frame), 46);
      g.addColorStop(0, "rgba(255,248,225,1)");
      g.addColorStop(0.25, "rgba(255,200,110,0.6)");
      g.addColorStop(1, "rgba(255,140,50,0)");
      ctx.fillStyle = g;
      ctx.fillRect(h.x - 46, h.y + oy(frame) - 46, 92, 92);
    }
    // --- sparks shed by the shell and by the jet's wake (deterministic emitters) ---
    const emit = (spawn: number, f: number, x: number, y: number, seed: number, warm: number, inSky: boolean) => {
      const r = prng(seed);
      const age = (f - spawn) / 24;
      if (age < 0 || age > 1.6) return;
      const vx = (r() - 0.5) * 60;
      const vy = (r() - 0.2) * 40;
      const k = 1.6;
      const e = 1 - Math.exp(-k * age);
      const px = x + (vx / k) * e;
      const py = y + (vy / k) * e + 55 * age * age + (inSky ? oy(f) : 0);
      const a = (1 - age / 1.6) ** 1.6 * (0.6 + 0.4 * Math.sin(f * 1.7 + seed));
      ctx.fillStyle = `rgba(255,${Math.round(220 - 90 * warm)},${Math.round(140 - 100 * warm)},${a})`;
      ctx.beginPath();
      ctx.arc(px, py, 1.6 + r() * 1.4, 0, Math.PI * 2);
      ctx.fill();
    };
    for (let s = DT.shellLaunch; s <= Math.min(frame, DT.arcStart); s += 0.5) {
      const p = bez(shellU(s));
      for (let j = 0; j < 3; j++) emit(s, frame, p.x, p.y, Math.round(s * 10) * 7 + j, shellU(s), true);
    }
    if (frame >= DT.arcStart) {
      for (let s = DT.arcStart; s <= Math.min(frame, DT.arcEnd + 6); s += 0.5) {
        const p = arcPoint(jetP(s) - TAIL);
        for (let j = 0; j < 4; j++) emit(s, frame, p.x, p.y, 50000 + Math.round(s * 10) * 11 + j, 1, false);
      }
    }
    // --- ignition flash where the firework becomes the flight path ---
    const fl = Math.exp(-Math.pow((frame - DT.arcStart) / 4, 2));
    if (fl > 0.01) {
      const g = ctx.createRadialGradient(TIP.x, TIP.y, 0, TIP.x, TIP.y, 260);
      g.addColorStop(0, `rgba(255,245,220,${fl})`);
      g.addColorStop(0.2, `rgba(255,180,90,${0.6 * fl})`);
      g.addColorStop(1, "rgba(255,130,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(TIP.x - 260, TIP.y - 260, 520, 520);
    }
  }, [frame, dpr]);
  if (frame < DT.shellLaunch || frame > DT.arcEnd + 50) return null;
  return <canvas ref={ref} width={D_WIDTH * dpr} height={D_HEIGHT * dpr} style={{ position: "absolute", inset: 0, width: D_WIDTH, height: D_HEIGHT }} />;
};

/* ------------------------------------------------------------------ */
/*  The jet on the arc (Three.js, transparent overlay)                 */
/* ------------------------------------------------------------------ */
const FOV = 40;
const DEPTH = 900;
const unproject = (sx: number, sy: number) => {
  const tanH = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  return new THREE.Vector3(((sx / D_WIDTH) * 2 - 1) * DEPTH * tanH * (D_WIDTH / D_HEIGHT), -((sy / D_HEIGHT) * 2 - 1) * DEPTH * tanH, -DEPTH);
};
const jetPose = (f: number) => {
  const p = jetP(f);
  const a = arcPoint(Math.min(p, 1));
  let sx = a.x;
  let sy = a.y;
  if (p > 1) {
    // exit along the last tangent, banking down and away
    const d = (p - 1) * ARC_TOTAL;
    sx += a.tx * d;
    sy += a.ty * d + d * d * 0.002;
  }
  const pos = unproject(sx, sy);
  const ahead = unproject(sx + a.tx * 6, sy + a.ty * 6 + (p > 1 ? 0.05 : 0));
  const forward = ahead.sub(pos).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize().applyAxisAngle(forward, -0.5);
  const r = new THREE.Vector3().crossVectors(forward, up).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r.negate(), up, forward));
  return { pos, q };
};

const JetRig: React.FC = () => {
  const { camera } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.set(0, 0, 0);
  cam.lookAt(0, 0, -1);
  cam.fov = FOV;
  cam.near = 1;
  cam.far = 5000;
  cam.updateProjectionMatrix();
  return null;
};

const JetOnArc: React.FC = () => {
  const frame = useCurrentFrame();
  const textures = useSceneTextures();
  if (!textures || frame < DT.arcStart || frame > DT.arcEnd + 16) return null;
  const pose = jetPose(frame);
  const appear = easeOut(ramp(frame, DT.arcStart, DT.arcStart + 6));
  const fade = 1 - ramp(frame, DT.arcEnd + 4, DT.arcEnd + 16);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <ThreeCanvas width={D_WIDTH} height={D_HEIGHT} gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}>
        <TexturesContext.Provider value={textures}>
          <JetRig />
          <hemisphereLight args={["#6a7cb0", "#3a2010", 1.0]} />
          <directionalLight position={[0, -300, 400]} color="#ffb060" intensity={2.4} />
          <directionalLight position={[300, 500, -900]} color="#ffd9a0" intensity={1.8} />
          <group scale={appear}>
            <Aircraft position={pose.pos} quaternion={pose.q} frame={frame} camPos={new THREE.Vector3()} sunIntensity={0.5} />
          </group>
        </TexturesContext.Provider>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Golden illumination (halo) the logo emerges from                   */
/* ------------------------------------------------------------------ */
const Halo: React.FC = () => {
  const frame = useCurrentFrame();
  const g = easeInOut(ramp(frame, DT.arcEnd - 4, DT.impact + 22));
  const pulse = Math.exp(-Math.pow((frame - DT.impact) / 7, 2));
  if (g <= 0.001) return null;
  const rx = 300 + 560 * g;
  const ry = 260 + 560 * g;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: LOGO_CX - rx,
          top: 1000 - ry,
          width: rx * 2,
          height: ry * 2,
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, rgba(255,253,248,1) 0%, rgba(255,251,243,0.99) 30%, rgba(255,240,218,0.94) 44%, rgba(255,214,160,0.72) 58%, rgba(250,170,90,0.38) 72%, rgba(245,130,32,0.12) 86%, rgba(245,130,32,0) 100%)",
          opacity: Math.min(1, g * 1.25),
        }}
      />
      {pulse > 0.01 && (
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(255,248,230,${0.85 * pulse}) 0%, rgba(255,210,140,${0.35 * pulse}) 40%, rgba(0,0,0,0) 75%)` }} />
      )}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Thousands of golden particles converging into the official logo    */
/* ------------------------------------------------------------------ */
type P = { tx: number; ty: number; ox: number; oy: number; delay: number; swirl: number; size: number; layer: number; seed: number };
const PARTICLES: P[] = (() => {
  const r = prng(2026);
  return (pointsJson.pts as [number, number, number][]).map(([x, y, layer], i) => {
    const t = vb2s(x, y);
    let ox: number, oy: number;
    if (r() < 0.35) {
      // from the glowing wake of the arc
      const a = arcPoint(r());
      ox = a.x + (r() - 0.5) * 260;
      oy = a.y + (r() - 0.5) * 220;
    } else {
      const ang = r() * Math.PI * 2;
      const rad = 380 + r() * 700;
      ox = LOGO_CX + Math.cos(ang) * rad;
      oy = 980 + Math.sin(ang) * rad * 1.25;
    }
    return { tx: t.x, ty: t.y, ox, oy, delay: r() * 12, swirl: (r() - 0.5) * 220, size: 1.2 + r() * 1.6, layer, seed: i };
  });
})();
const CONV_DUR = 24;

const particlePos = (p: P, f: number) => {
  const u = clamp01((f - DT.convergeStart - p.delay) / CONV_DUR);
  const e = easeInOut(u);
  const dx = p.tx - p.ox;
  const dy = p.ty - p.oy;
  const len = Math.hypot(dx, dy) || 1;
  const sw = Math.sin(Math.PI * e) * p.swirl;
  return { x: p.ox + dx * e + (-dy / len) * sw, y: p.oy + dy * e + (dx / len) * sw, u };
};

const ParticleLogo: React.FC = () => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;
  const active = frame >= DT.convergeStart - 6 && frame <= DT.logoSharpEnd + 14;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, D_WIDTH, D_HEIGHT);
    if (!active) return;
    ctx.lineCap = "round";
    const appear = ramp(frame, DT.convergeStart - 6, DT.convergeStart + 4);
    const dissolve = 1 - ramp(frame, DT.logoSharpStart + 6, DT.logoSharpEnd + 12);
    for (const p of PARTICLES) {
      const a = particlePos(p, frame);
      const b = particlePos(p, frame - 0.28);
      const tw = 0.65 + 0.35 * Math.sin(frame * 0.9 + p.seed);
      const arrived = a.u >= 1 ? 1 : 0;
      const alpha = appear * dissolve * (arrived ? 0.9 : 0.75 * tw);
      if (alpha < 0.02) continue;
      // deep gold reads on both the midnight sky and the bright halo
      const col = p.layer === 0 ? [240, 128, 32] : [214, 150, 52];
      ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
      ctx.lineWidth = p.size * (arrived ? 1.15 : 1.3);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(a.x + 0.01, a.y);
      ctx.stroke();
      if (!arrived && tw > 0.85) {
        ctx.fillStyle = `rgba(255,236,190,${alpha})`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, p.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [frame, dpr, active]);
  if (!active) return null;
  return <canvas ref={ref} width={D_WIDTH * dpr} height={D_HEIGHT * dpr} style={{ position: "absolute", inset: 0, width: D_WIDTH, height: D_HEIGHT }} />;
};

/* ------------------------------------------------------------------ */
/*  Drifting orange motes                                              */
/* ------------------------------------------------------------------ */
const MOTES = (() => {
  const r = prng(31);
  return Array.from({ length: 70 }, () => ({ x: r() * D_WIDTH, y: r() * D_HEIGHT, s: 1.5 + r() * 3, sp: 8 + r() * 20, ph: r() * 6.28 }));
})();
const Motes: React.FC = () => {
  const frame = useCurrentFrame();
  const o = ramp(frame, DT.impact, DT.impact + 30);
  if (o <= 0) return null;
  return (
    <svg width={D_WIDTH} height={D_HEIGHT} style={{ position: "absolute", inset: 0 }}>
      {MOTES.map((m, i) => {
        const t = frame / 24;
        const y = (((m.y - t * m.sp) % D_HEIGHT) + D_HEIGHT) % D_HEIGHT;
        const x = m.x + Math.sin(t * 0.8 + m.ph) * 18;
        const d = Math.hypot((x - LOGO_CX) / 470, (y - 1000) / 420);
        const away = clamp01((d - 0.85) / 0.4) * 0.85 + 0.15;
        return <circle key={i} cx={x} cy={y} r={m.s} fill="#F58220" opacity={o * away * (0.35 + 0.35 * Math.sin(t * 2 + m.ph))} />;
      })}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Logo layers (official artwork, vector) + greeting                  */
/* ------------------------------------------------------------------ */
const CENTER_D = "M" + ARC_CENTERLINE.map(([x, y]) => `${x} ${y}`).join("L");
const ARC_MAX_T = Math.max(...ARC_CENTERLINE.map((c) => c[2]));

const LogoArt: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < DT.arcStart - 1) return null;
  const p = frame >= DT.arcEnd + 4 ? 1 : clamp01(jetP(frame) - TAIL);
  const onDark = 1 - ramp(frame, DT.arcEnd, DT.impact + 16);
  const sharp = easeOut(ramp(frame, DT.logoSharpStart, DT.logoSharpEnd));
  const blur = 5 * U * (1 - sharp);
  const settle = 1 + 0.035 * (1 - easeOut(ramp(frame, DT.impact, DT.end)));
  const push = 1 + 0.02 * easeInOut(ramp(frame, DT.impact, DT.end));
  const s = LOGO_S * settle * push;
  const transform = `translate(${LOGO_CX - VB_CX * s} ${LOGO_CY - VB_CY * s}) scale(${s})`;
  const glint = ramp(frame, DT.logoSharpEnd, DT.logoSharpEnd + 30);
  const gx = ARC_BOUNDS.x0 + (ARC_BOUNDS.x1 - ARC_BOUNDS.x0) * easeInOut(glint);
  const gcy = (ARC_BOUNDS.y0 + ARC_BOUNDS.y1) / 2;
  return (
    <svg width={D_WIDTH} height={D_HEIGHT} viewBox={`0 0 ${D_WIDTH} ${D_HEIGHT}`} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id="dArc" x1={ARC_BOUNDS.x0} x2={ARC_BOUNDS.x1} y1={0} y2={0} gradientUnits="userSpaceOnUse">
          {ARC_STOPS.map((st) => (
            <stop key={st.offset} offset={st.offset} stopColor={st.color} />
          ))}
        </linearGradient>
        <mask id="dArcMask" maskUnits="userSpaceOnUse" x={0} y={0} width={2000} height={1200}>
          <path d={CENTER_D} pathLength={1} fill="none" stroke="#fff" strokeWidth={ARC_MAX_T * 1.6} strokeDasharray={`${p} 2`} />
        </mask>
        <mask id="dHotMask" maskUnits="userSpaceOnUse" x={0} y={0} width={2000} height={1200}>
          {Array.from({ length: 14 }, (_, i) => {
            const len = Math.min(p, 0.28 * ((i + 1) / 14));
            return <path key={i} d={CENTER_D} pathLength={1} fill="none" stroke="#fff" strokeOpacity={1 / 14} strokeWidth={ARC_MAX_T * 1.6} strokeDasharray={`0 ${Math.max(0, p - len)} ${len} 2`} />;
          })}
        </mask>
        <filter id="dGlow" x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation={7 * U} />
        </filter>
        <filter id="dGlowWide" x="-30%" y="-150%" width="160%" height="400%">
          <feGaussianBlur stdDeviation={22 * U} />
        </filter>
        <linearGradient id="dSheen" x1={0} x2={1} y1={0} y2={0}>
          <stop offset={0} stopColor="#fff" stopOpacity={0} />
          <stop offset={0.5} stopColor="#fff" stopOpacity={0.8} />
          <stop offset={1} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
      </defs>
      <g transform={transform}>
        {onDark > 0.001 && (
          <g style={{ mixBlendMode: "screen" }} opacity={onDark}>
            <path d={ARC_PATH} fill="#ff7a1a" mask="url(#dArcMask)" filter="url(#dGlowWide)" />
            <path d={ARC_PATH} fill="#ff7a1a" mask="url(#dArcMask)" filter="url(#dGlowWide)" />
            <path d={ARC_PATH} fill="#ffb066" mask="url(#dArcMask)" filter="url(#dGlow)" />
          </g>
        )}
        <path d={ARC_PATH} fill="url(#dArc)" mask="url(#dArcMask)" />
        {frame < DT.arcEnd + 12 && <path d={ARC_PATH} fill="#ffe6bf" mask="url(#dHotMask)" opacity={0.85 * (1 - ramp(frame, DT.arcEnd, DT.arcEnd + 12))} />}
        {sharp > 0.001 && (
          <g opacity={sharp} style={blur > 0.05 ? { filter: `blur(${blur}px)` } : undefined}>
            {LETTERS.map((l, i) => (
              <path key={`l${i}`} d={l.d} fill={INK} />
            ))}
            {TAGLINE.map((g, i) => (
              <path key={`t${i}`} d={g.d} fill={INK} />
            ))}
            <path d={REG.d} fill={REG_INK} />
          </g>
        )}
        {glint > 0 && glint < 1 && (
          <g mask="url(#dArcMask)">
            <rect x={gx - 40 * U} y={ARC_BOUNDS.y0 - 20} width={80 * U} height={ARC_BOUNDS.y1 - ARC_BOUNDS.y0 + 40} fill="url(#dSheen)" opacity={0.55} transform={`translate(${gx} ${gcy}) skewX(-22) translate(${-gx} ${-gcy})`} />
          </g>
        )}
      </g>
    </svg>
  );
};

const Greeting: React.FC = () => {
  ensureFonts();
  const frame = useCurrentFrame();
  if (frame < DT.greetingStart) return null;
  const a = easeOut(ramp(frame, DT.greetingStart, DT.greetingStart + 18));
  const b = easeOut(ramp(frame, DT.greetingStart + 6, DT.greetingEnd));
  const rule = easeInOut(ramp(frame, DT.greetingStart + 4, DT.greetingEnd + 4));
  const line = (t: number): React.CSSProperties => ({
    opacity: t,
    transform: `translateY(${(1 - t) * 18}px)`,
    filter: t < 0.98 ? `blur(${(1 - t) * 4}px)` : undefined,
  });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 1172, textAlign: "center", fontFamily: `'${GREETING_FONT}'`, color: "#111111" }}>
      <div style={{ ...line(a), fontWeight: 300, fontSize: 34, letterSpacing: `${0.42 + (1 - a) * 0.2}em`, paddingLeft: "0.42em" }}>WISHING YOU A</div>
      <div style={{ height: 14 }} />
      <div style={{ ...line(b), fontWeight: 600, fontSize: 50, letterSpacing: `${0.1 + (1 - b) * 0.12}em`, paddingLeft: "0.1em" }}>
        PROSPEROUS <span style={{ color: "#F58220" }}>&amp;</span> SAFE DIWALI
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 22 }}>
        <div style={{ width: 170 * rule, height: 1.5, background: "linear-gradient(90deg, rgba(212,160,60,0), #d4a03c)" }} />
        <div style={{ width: 7, height: 7, transform: "rotate(45deg)", background: "#F58220", opacity: rule }} />
        <div style={{ width: 170 * rule, height: 1.5, background: "linear-gradient(90deg, #d4a03c, rgba(212,160,60,0))" }} />
      </div>
    </div>
  );
};

export const Finale: React.FC = () => (
  <>
    <HeroCanvas />
    <Halo />
    <Motes />
    <LogoArt />
    <JetOnArc />
    <ParticleLogo />
    <Greeting />
  </>
);

