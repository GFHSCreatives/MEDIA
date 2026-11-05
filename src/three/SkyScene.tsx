import React from "react";
import * as THREE from "three";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { dawnAmount, flightPose, getCamera, ramp, sAtFrame, sunDirection } from "../flight";
import { T } from "../timeline";
import { Aircraft } from "./Aircraft";
import { Clouds } from "./Clouds";
import { Contrails } from "./Contrails";
import { Sky } from "./Sky";
import { TexturesContext, useSceneTextures } from "./useTexture";

const CameraRig: React.FC<{ frame: number }> = ({ frame }) => {
  const { camera } = useThree();
  const c = getCamera(frame);
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.copy(c.position);
  cam.up.set(Math.sin(c.roll), Math.cos(c.roll), 0);
  cam.lookAt(c.target);
  cam.fov = c.fov;
  cam.near = 0.5;
  cam.far = 20000;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return null;
};

const World: React.FC<{ frame: number }> = ({ frame }) => {
  const cam = getCamera(frame);
  const sunDir = sunDirection(frame);
  const dawn = dawnAmount(frame);
  const s = sAtFrame(frame);
  const pose = flightPose(s);
  const sunI = THREE.MathUtils.lerp(0.35, 3.2, dawn);
  const tint = new THREE.Color("#c9cbe0").lerp(new THREE.Color("#fff0e0"), dawn);
  return (
    <>
      <CameraRig frame={frame} />
      <Sky camPos={cam.position} sunDir={sunDir} dawn={dawn} frame={frame} />
      <hemisphereLight args={[new THREE.Color("#6b80b8").lerp(new THREE.Color("#a9b8dc"), dawn), new THREE.Color("#5a4660").lerp(new THREE.Color("#d79a78"), dawn), 0.55 + 0.5 * dawn]} />
      {/* low sun just over the horizon: strong warm key from behind the aircraft */}
      <directionalLight position={sunDir.clone().multiplyScalar(1000)} color={new THREE.Color("#ff9a5a").lerp(new THREE.Color("#ffd2a0"), dawn)} intensity={sunI} />
      {/* soft cool fill from the camera side so the fuselage never goes dead black */}
      <directionalLight position={[0, 300, 800]} color="#8fa6d8" intensity={0.35 + 0.25 * dawn} />
      <Clouds sunDir={sunDir} dawn={dawn} nearOpacity={1 - ramp(frame, 70, 110)} />
      {frame < T.floodEnd && (
        <>
          <Contrails sNow={s} camPos={cam.position} opacity={1 - ramp(frame, T.arcStart - 8, T.arcStart + 22)} tint={tint} />
          <Aircraft position={pose.position} quaternion={pose.quaternion} frame={frame} camPos={cam.position} sunIntensity={dawn} />
        </>
      )}
    </>
  );
};

export const SkyScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const textures = useSceneTextures();
  if (!textures) return null;
  return (
    <ThreeCanvas
      width={width}
      height={height}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ fov: 44, near: 0.5, far: 20000, position: [0, 4, 430] }}
    >
      <TexturesContext.Provider value={textures}>
        <World frame={frame} />
      </TexturesContext.Provider>
    </ThreeCanvas>
  );
};
