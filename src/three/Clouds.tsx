import React, { useMemo } from "react";
import * as THREE from "three";
import { SKY_GLSL } from "./skyGlsl";
import { useTextures } from "./useTexture";

/**
 * Volumetric-looking cloud deck built from thousands of camera-facing puffs.
 * Each puff samples a baked, self-shadowed density atlas; lighting, forward
 * scattering (silver lining toward the sun) and aerial perspective are done
 * per pixel. Instances are pre-sorted far→near for correct alpha compositing
 * (the camera always looks down −Z).
 */

type Puff = { x: number; y: number; z: number; s: number; cell: number; flip: number; alpha: number; shade: number };

// deterministic PRNG (mulberry32)
const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const buildDeck = (): Puff[] => {
  const r = rng(7);
  const puffs: Puff[] = [];
  // the main sea of clouds
  for (let i = 0; i < 1500; i++) {
    const z = -2900 + Math.pow(r(), 0.85) * 3500;
    const spread = 700 + Math.max(0, -z) * 0.75;
    const x = (r() * 2 - 1) * spread;
    const far = Math.max(0, -z) / 2900;
    // undulating deck: valleys & rolls
    const swell = Math.sin(x * 0.006 + z * 0.004) * 4 + Math.sin(z * 0.011) * 2.5;
    const y = -2 + swell + r() * 5;
    puffs.push({ x, y, z, s: 55 + r() * 70 + far * 120, cell: Math.floor(r() * 4), flip: r() < 0.5 ? -1 : 1, alpha: 0.75 + r() * 0.25, shade: r() });
  }
  // towering cumulus on the flanks of the sunrise
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -1300 - r() * 1300;
    const x = side * (330 + r() * 900);
    for (let k = 0; k < 5; k++) {
      puffs.push({
        x: x + (r() - 0.5) * 120,
        y: 8 + k * (22 + r() * 16),
        z: z + (r() - 0.5) * 60,
        s: 170 - k * 18 + r() * 60,
        cell: Math.floor(r() * 4),
        flip: r() < 0.5 ? -1 : 1,
        alpha: 0.9,
        shade: r(),
      });
    }
  }
  return puffs.sort((a, b) => a.z - b.z);
};

// puffs the camera climbs through at the very start
const buildNear = (): Puff[] => {
  const r = rng(99);
  const puffs: Puff[] = [];
  for (let i = 0; i < 120; i++) {
    const z = 170 + r() * 290;
    puffs.push({
      x: (r() * 2 - 1) * (40 + (z - 170) * 0.25),
      y: -6 + r() * 20,
      z,
      s: 26 + r() * 36,
      cell: Math.floor(r() * 4),
      flip: r() < 0.5 ? -1 : 1,
      alpha: 0.55 + r() * 0.35,
      shade: r(),
    });
  }
  return puffs.sort((a, b) => a.z - b.z);
};

const makeGeometry = (puffs: Puff[]) => {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.attributes.position);
  g.setAttribute("uv", base.attributes.uv);
  const off = new Float32Array(puffs.length * 3);
  const misc = new Float32Array(puffs.length * 4);
  const shade = new Float32Array(puffs.length);
  puffs.forEach((p, i) => {
    off.set([p.x, p.y, p.z], i * 3);
    misc.set([p.s, p.cell, p.flip, p.alpha], i * 4);
    shade[i] = p.shade;
  });
  g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute("aMisc", new THREE.InstancedBufferAttribute(misc, 4));
  g.setAttribute("aShade", new THREE.InstancedBufferAttribute(shade, 1));
  g.instanceCount = puffs.length;
  return g;
};

const makeMaterial = (atlas: THREE.Texture) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uAtlas: { value: atlas },
      uSunDir: { value: new THREE.Vector3() },
      uDawn: { value: 0 },
      uLit: { value: new THREE.Color() },
      uShadow: { value: new THREE.Color() },
      uRim: { value: new THREE.Color() },
      uFogNear: { value: 250 },
      uFogFar: { value: 3000 },
      uNearFade: { value: new THREE.Vector2(3, 40) },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOffset;
      attribute vec4 aMisc; // scale, cell, flip, alpha
      attribute float aShade;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vDepth;
      varying float vShade;
      varying vec3 vWorld;
      void main() {
        float cx = mod(aMisc.y, 2.0);
        float cy = floor(aMisc.y / 2.0);
        vec2 uv0 = vec2(aMisc.z > 0.0 ? uv.x : 1.0 - uv.x, uv.y);
        vUv = vec2((uv0.x + cx) * 0.5, (uv0.y + (1.0 - cy)) * 0.5);
        vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
        mv.xy += position.xy * vec2(aMisc.x, aMisc.x * 0.72);
        vDepth = -mv.z;
        vAlpha = aMisc.w;
        vShade = aShade;
        vWorld = aOffset + vec3(position.x * aMisc.x, position.y * aMisc.x * 0.72, 0.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform vec3 uLit;
      uniform vec3 uShadow;
      uniform vec3 uRim;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec2 uNearFade;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vDepth;
      varying float vShade;
      varying vec3 vWorld;
      ${SKY_GLSL}
      void main() {
        vec4 t = texture2D(uAtlas, vUv);
        float a = t.a * vAlpha * uOpacity * smoothstep(uNearFade.x, uNearFade.y, vDepth);
        if (a < 0.004) discard;
        vec3 view = normalize(vWorld - cameraPosition);
        float fwd = pow(max(dot(view, uSunDir), 0.0), 7.0);
        float light = clamp(t.r * 1.25, 0.0, 1.0);
        vec3 col = mix(uShadow, uLit, light) * (0.88 + 0.24 * vShade);
        // silver lining: thin edges facing the sun glow
        col += uRim * t.g * (0.04 + 2.0 * fwd) * (0.35 + 0.65 * uDawn);
        // sun bleeding through thin cloud
        col += uRim * fwd * (1.0 - t.a) * 0.6 * uDawn;
        float fog = smoothstep(uFogNear, uFogFar, vDepth);
        col = mix(col, skyColor(normalize(vec3(view.x, min(view.y, -0.002), view.z))), fog * 0.92);
        gl_FragColor = vec4(rolloff(col), a);
      }`,
  });

export const Clouds: React.FC<{ sunDir: THREE.Vector3; dawn: number; nearOpacity: number }> = ({ sunDir, dawn, nearOpacity }) => {
  const atlas = useTextures().cloudAtlas;
  const deck = useMemo(() => makeGeometry(buildDeck()), []);
  const near = useMemo(() => makeGeometry(buildNear()), []);
  const mats = useMemo(() => [makeMaterial(atlas), makeMaterial(atlas)], [atlas]);

  const lit = new THREE.Color("#9c8fb8").lerp(new THREE.Color("#ffc790"), dawn);
  const shadow = new THREE.Color("#28325c").lerp(new THREE.Color("#55618f"), dawn);
  const rim = new THREE.Color("#ffb070").lerp(new THREE.Color("#ffe0b8"), dawn);
  for (const m of mats) {
    m.uniforms.uSunDir.value.copy(sunDir);
    m.uniforms.uDawn.value = dawn;
    m.uniforms.uLit.value.copy(lit);
    m.uniforms.uShadow.value.copy(shadow);
    m.uniforms.uRim.value.copy(rim);
  }
  mats[1].uniforms.uNearFade.value.set(1.5, 22);
  mats[1].uniforms.uOpacity.value = nearOpacity;
  mats[1].uniforms.uFogNear.value = 400;

  return (
    <>
      <mesh geometry={deck} material={mats[0]} frustumCulled={false} renderOrder={1} />
      {nearOpacity > 0.001 && <mesh geometry={near} material={mats[1]} frustumCulled={false} renderOrder={3} />}
    </>
  );
};
