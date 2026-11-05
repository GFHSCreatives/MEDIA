import React, { useMemo } from "react";
import * as THREE from "three";
import { flightPose, S_ARC_START } from "../flight";

/**
 * Twin engine contrails as camera-facing ribbons, rebuilt every frame from the
 * deterministic flight path (so they are perfectly stable during rendering).
 * They condense a few metres behind the engines, widen and soften with age.
 */
const STEP = 3;
const MAX_LEN = 900;
const SEGMENTS = Math.ceil(MAX_LEN / STEP) + 2;
const ENGINES = [new THREE.Vector3(6.3, -2.55, -4.5), new THREE.Vector3(-6.3, -2.55, -4.5)];

export const Contrails: React.FC<{
  sNow: number;
  camPos: THREE.Vector3;
  opacity: number;
  tint: THREE.Color;
}> = ({ sNow, camPos, opacity, tint }) => {
  const { geometries, material } = useMemo(() => {
    const geometries = ENGINES.map(() => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SEGMENTS * 2 * 3), 3));
      g.setAttribute("aT", new THREE.BufferAttribute(new Float32Array(SEGMENTS * 2 * 2), 2));
      const idx: number[] = [];
      for (let i = 0; i < SEGMENTS - 1; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      g.setIndex(idx);
      return g;
    });
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec2 aT; // x: across (-1..1), y: alpha
        varying vec2 vT;
        void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity; varying vec2 vT;
        void main() {
          float across = 1.0 - vT.x * vT.x;
          float a = pow(across, 1.6) * vT.y * uOpacity;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor * (0.85 + 0.25 * across), a);
        }`,
    });
    return { geometries, material };
  }, []);

  material.uniforms.uColor.value.copy(tint);
  material.uniforms.uOpacity.value = opacity;

  // rebuild ribbons
  const sEndTrail = Math.min(sNow, S_ARC_START + 24);
  ENGINES.forEach((eng, e) => {
    const g = geometries[e];
    const pos = g.attributes.position as THREE.BufferAttribute;
    const at = g.attributes.aT as THREE.BufferAttribute;
    for (let i = 0; i < SEGMENTS; i++) {
      const age = i * STEP; // distance behind the aircraft
      const s = sNow - age;
      const pose = flightPose(Math.max(0, s));
      const p = eng.clone().applyQuaternion(pose.quaternion).add(pose.position);
      // condensation gap, fade with age, never draw onto the logo arc section
      const formed = THREE.MathUtils.smoothstep(age, 6, 40);
      const fade = 1 - THREE.MathUtils.smoothstep(age, MAX_LEN * 0.45, MAX_LEN);
      const valid = s > 0 && s <= sEndTrail ? 1 : 0;
      const width = 0.3 + Math.min(age, 700) * 0.0042;
      const toCam = camPos.clone().sub(p).normalize();
      const side = new THREE.Vector3().crossVectors(pose.forward, toCam).normalize().multiplyScalar(width);
      pos.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z);
      pos.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z);
      const alpha = formed * fade * valid * 0.85;
      at.setXY(i * 2, -1, alpha);
      at.setXY(i * 2 + 1, 1, alpha);
    }
    pos.needsUpdate = true;
    at.needsUpdate = true;
    g.computeBoundingSphere();
  });

  if (opacity <= 0.001) return null;
  return (
    <>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} frustumCulled={false} renderOrder={2} />
      ))}
    </>
  );
};
