import React, { useMemo } from "react";
import * as THREE from "three";
import { useTextures } from "./useTexture";

/**
 * Procedural twin-engine jet (≈36 m long, ≈34 m span) in the GLOBAL livery:
 * gloss-white body, brand-orange tail and nacelle lips.
 * Local axes: +Z = nose, +Y = up, +X = left wing.
 */

const fuselageGeometry = () => {
  // radius profile along the length (y = station, x = radius)
  const prof: [number, number][] = [
    [0.0, 18.2], [0.55, 17.9], [1.05, 17.2], [1.5, 16.2], [1.85, 14.8], [2.05, 12.8],
    [2.1, 9], [2.1, 0], [2.08, -6], [1.95, -9.5], [1.6, -12.5], [1.15, -15], [0.7, -16.9], [0.3, -18.2], [0.0, -18.4],
  ];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 48);
  g.rotateX(Math.PI / 2); // lathe axis Y → Z (nose at +Z)
  // tail cone sweeps upward
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < -9) {
      const k = (-9 - z) / 9.4;
      pos.setY(i, pos.getY(i) + k * k * 1.1);
    }
  }
  g.computeVertexNormals();
  return g;
};

// Planform helper: points given as (spanX, chordZ). Extruded for thickness along Y.
const planform = (pts: [number, number][], thickness: number, bevel = 0.12) => {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2); // shape-y → -z, extrusion → +y
  g.translate(0, -thickness / 2, 0);
  g.computeVertexNormals();
  return g;
};

// Profile in (chordZ, heightY), extruded sideways — used for the fin & winglets
const profileShape = (pts: [number, number][], thickness: number) => {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.rotateY(-Math.PI / 2); // shape-x → z
  g.translate(thickness / 2, 0, 0);
  g.computeVertexNormals();
  return g;
};

export const Aircraft: React.FC<{
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  frame: number;
  camPos: THREE.Vector3;
  sunIntensity: number;
}> = ({ position, quaternion, frame, camPos, sunIntensity }) => {
  const glow = useTextures().glow;

  const geo = useMemo(() => {
    const wingR = planform(
      [[1.6, 4.6], [17.2, -5.6], [17.4, -7.4], [15.5, -7.6], [1.6, -3.8]],
      0.5,
      0.16,
    );
    const wingL = wingR.clone();
    wingL.scale(-1, 1, 1);
    wingL.computeVertexNormals();
    const stabR = planform([[0.6, -11.8], [7.2, -16.1], [7.3, -17.4], [6.1, -17.5], [0.6, -16.4]], 0.22, 0.07);
    const stabL = stabR.clone();
    stabL.scale(-1, 1, 1);
    stabL.computeVertexNormals();
    const fin = profileShape([[-9.8, 1.2], [-15.6, 9.6], [-17.5, 9.8], [-18.4, 9.5], [-17.9, 1.2]], 0.34);
    const winglet = profileShape([[-5.4, 0], [-7.0, 2.6], [-7.7, 2.7], [-7.5, 0]], 0.12);
    const nacelle = new THREE.CylinderGeometry(1.08, 0.92, 5.6, 32, 1, true);
    nacelle.rotateX(Math.PI / 2);
    const lip = new THREE.TorusGeometry(1.06, 0.14, 12, 40);
    const intake = new THREE.CircleGeometry(1.0, 32);
    const exhaust = new THREE.ConeGeometry(0.62, 1.6, 24, 1, true);
    exhaust.rotateX(-Math.PI / 2);
    const pylon = new THREE.BoxGeometry(0.3, 1.2, 3.4);
    const windscreen = new THREE.SphereGeometry(1.0, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const belly = new THREE.CylinderGeometry(2.12, 2.12, 14, 48, 1, true, Math.PI * 0.62, Math.PI * 0.76);
    belly.rotateX(Math.PI / 2);
    return { fus: fuselageGeometry(), wingR, wingL, stabR, stabL, fin, winglet, nacelle, lip, intake, exhaust, pylon, windscreen, belly };
  }, []);

  const mats = useMemo(() => {
    return {
      paint: new THREE.MeshStandardMaterial({ color: "#f4f2ef", roughness: 0.32, metalness: 0.08 }),
      belly: new THREE.MeshStandardMaterial({ color: "#cfd3d8", roughness: 0.4, metalness: 0.15, side: THREE.DoubleSide }),
      wing: new THREE.MeshStandardMaterial({ color: "#e3e5e8", roughness: 0.38, metalness: 0.12 }),
      orange: new THREE.MeshStandardMaterial({ color: "#e8661f", roughness: 0.35, metalness: 0.05, emissive: "#3a1200" }),
      orangeDeep: new THREE.MeshStandardMaterial({ color: "#d24524", roughness: 0.35, metalness: 0.05 }),
      metal: new THREE.MeshStandardMaterial({ color: "#9aa0a8", roughness: 0.25, metalness: 0.85, side: THREE.DoubleSide }),
      dark: new THREE.MeshStandardMaterial({ color: "#0d0f14", roughness: 0.6, metalness: 0.2 }),
      glass: new THREE.MeshStandardMaterial({ color: "#10151f", roughness: 0.08, metalness: 0.9 }),
    };
  }, []);

  // navigation / anti-collision lights (driven by frame — no free-running animation)
  const strobe = (frame % 30 < 2 || (frame % 30 >= 5 && frame % 30 < 7)) ? 1 : 0;
  const beacon = frame % 36 < 4 ? 1 : 0.12;
  const dist = position.distanceTo(camPos);
  // keep lights a readable size on screen at long range
  const lightSize = (base: number) => Math.max(base, dist * 0.006 * base);

  const Light: React.FC<{ p: [number, number, number]; color: string; size: number; intensity: number }> = ({
    p, color, size, intensity,
  }) =>
    intensity > 0.01 && glow ? (
      <sprite position={p} scale={[lightSize(size), lightSize(size), 1]}>
        <spriteMaterial
          map={glow}
          color={color}
          transparent
          opacity={Math.min(1, intensity)}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    ) : null;

  const engines = [6.3, -6.3];
  return (
    <group position={position} quaternion={quaternion}>
      <mesh geometry={geo.fus} material={mats.paint} />
      <mesh geometry={geo.belly} material={mats.belly} position={[0, 0, 1]} />
      {/* cockpit glazing */}
      <mesh geometry={geo.windscreen} material={mats.glass} position={[0, 0.85, 15.3]} scale={[1.45, 0.62, 1.7]} rotation={[0.12, 0, 0]} />
      {/* cheat line in brand orange */}
      <mesh position={[0, 0.25, -1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.115, 2.115, 26, 48, 1, true, Math.PI * 0.18, Math.PI * 0.08]} />
        <meshStandardMaterial color="#e8661f" roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.25, -1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.115, 2.115, 26, 48, 1, true, Math.PI * 1.74, Math.PI * 0.08]} />
        <meshStandardMaterial color="#e8661f" roughness={0.35} side={THREE.DoubleSide} />
      </mesh>

      <group position={[0, -1.05, 0]} rotation={[0, 0, 0]}>
        <mesh geometry={geo.wingR} material={mats.wing} rotation={[0, 0, 0.085]} />
        <mesh geometry={geo.wingL} material={mats.wing} rotation={[0, 0, -0.085]} />
        <mesh geometry={geo.winglet} material={mats.orange} position={[17.2, 1.45, 0]} rotation={[0, 0, -0.12]} />
        <mesh geometry={geo.winglet} material={mats.orange} position={[-17.2, 1.45, 0]} rotation={[0, 0, 0.12]} />
      </group>

      <group position={[0, 1.05, 0]}>
        <mesh geometry={geo.stabR} material={mats.wing} rotation={[0, 0, 0.1]} />
        <mesh geometry={geo.stabL} material={mats.wing} rotation={[0, 0, -0.1]} />
      </group>
      <mesh geometry={geo.fin} material={mats.orange} position={[0, 0.9, 0]} />

      {engines.map((x) => (
        <group key={x} position={[x, -2.55, 2.4]}>
          <mesh geometry={geo.nacelle} material={mats.paint} />
          <mesh geometry={geo.lip} material={mats.orangeDeep} position={[0, 0, 2.8]} />
          <mesh geometry={geo.intake} material={mats.dark} position={[0, 0, 2.6]} />
          <mesh geometry={geo.exhaust} material={mats.metal} position={[0, 0, -3.3]} />
          <mesh geometry={geo.pylon} material={mats.wing} position={[0, 1.25, -0.6]} />
        </group>
      ))}

      {/* lights: red = port (left, +X), green = starboard */}
      <Light p={[17.6, -0.2, -6.2]} color="#ff2a2a" size={1.4} intensity={0.95} />
      <Light p={[-17.6, -0.2, -6.2]} color="#2aff7a" size={1.4} intensity={0.95} />
      <Light p={[17.6, -0.2, -6.9]} color="#ffffff" size={4.2} intensity={strobe * 1.2} />
      <Light p={[-17.6, -0.2, -6.9]} color="#ffffff" size={4.2} intensity={strobe * 1.2} />
      <Light p={[0, 2.3, -3]} color="#ff3b2a" size={1.6} intensity={beacon} />
      <Light p={[0, -2.3, 2]} color="#ff3b2a" size={1.6} intensity={beacon} />
      <Light p={[0, 9.9, -18.6]} color="#fff5e8" size={1.0} intensity={0.7 * (1 - sunIntensity * 0.3)} />
    </group>
  );
};
