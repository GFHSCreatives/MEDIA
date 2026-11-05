import { createContext, useContext, useEffect, useState } from "react";
import * as THREE from "three";
import { continueRender, delayRender, staticFile } from "remotion";

export type SceneTextures = { cloudAtlas: THREE.Texture; glow: THREE.Texture };

const FILES = { cloudAtlas: "textures/cloud-atlas.png", glow: "textures/glow.png" } as const;
let cached: SceneTextures | null = null;

/**
 * Preload every texture the 3D scene needs *outside* <ThreeCanvas>.
 * ThreeCanvas only redraws when the Remotion frame changes, so textures must be
 * ready before the canvas mounts or the first rendered frame would miss them.
 */
export const useSceneTextures = () => {
  const [tex, setTex] = useState<SceneTextures | null>(cached);
  const [handle] = useState(() => (cached ? null : delayRender("Loading scene textures")));
  useEffect(() => {
    if (tex) return;
    const loader = new THREE.TextureLoader();
    Promise.all(
      Object.entries(FILES).map(
        ([key, file]) =>
          new Promise<[string, THREE.Texture]>((resolve, reject) =>
            loader.load(
              staticFile(file),
              (t) => {
                t.colorSpace = THREE.NoColorSpace;
                t.anisotropy = 4;
                t.needsUpdate = true;
                resolve([key, t]);
              },
              undefined,
              reject,
            ),
          ),
      ),
    ).then((entries) => {
      cached = Object.fromEntries(entries) as SceneTextures;
      setTex(cached);
    });
  }, [tex]);
  useEffect(() => {
    if (tex && handle !== null) continueRender(handle);
  }, [tex, handle]);
  return tex;
};

export const TexturesContext = createContext<SceneTextures | null>(null);
export const useTextures = () => {
  const t = useContext(TexturesContext);
  if (!t) throw new Error("Scene textures not loaded");
  return t;
};
