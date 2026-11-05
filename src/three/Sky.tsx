import React, { useMemo } from "react";
import * as THREE from "three";
import { HASH_GLSL, SKY_GLSL } from "./skyGlsl";

export const Sky: React.FC<{ camPos: THREE.Vector3; sunDir: THREE.Vector3; dawn: number; frame: number }> = ({
  camPos,
  sunDir,
  dawn,
  frame,
}) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uSunDir: { value: new THREE.Vector3() },
          uDawn: { value: 0 },
          uFrame: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uFrame;
          varying vec3 vDir;
          ${SKY_GLSL}
          ${HASH_GLSL}
          void main() {
            vec3 dir = normalize(vDir);
            vec3 col = skyColor(dir);
            float sunAng = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
            // sun disk with soft limb
            col = mix(col, vec3(1.0, 0.96, 0.86), smoothstep(0.0105, 0.0085, sunAng));
            // stars fade out as dawn breaks
            vec3 d = dir * 520.0;
            vec3 id = floor(d);
            float h = hash13(id);
            if (h > 0.9965) {
              float r = length(fract(d) - 0.5);
              float tw = 0.65 + 0.35 * sin(uFrame * 0.21 + h * 917.0);
              float s = smoothstep(0.32, 0.0, r) * tw * (0.4 + 3.0 * (h - 0.9965) / 0.0035);
              col += vec3(0.85, 0.9, 1.0) * s * (1.0 - smoothstep(0.15, 0.75, uDawn)) * smoothstep(0.03, 0.3, dir.y);
            }
            col = rolloff(col);
            // dither to kill gradient banding
            col += (hash12(gl_FragCoord.xy + uFrame) - 0.5) / 255.0;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  );
  material.uniforms.uSunDir.value.copy(sunDir);
  material.uniforms.uDawn.value = dawn;
  material.uniforms.uFrame.value = frame;
  return (
    <mesh position={camPos} renderOrder={-10} frustumCulled={false} material={material}>
      <sphereGeometry args={[9000, 64, 32]} />
    </mesh>
  );
};
