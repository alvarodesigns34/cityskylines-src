import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { N } from "../sim/types";
import { sim, useGame } from "../store";
import { CameraRig } from "./CameraRig";
import { skyFor } from "./daynight";
import { Buildings, Grass, Roads, StreetLamps, Vegetation } from "./layers/City";
import { Clouds, Rain, Smoke, Vehicles } from "./layers/Effects";
import { DataOverlay, Ghost, Selection, ZonePlates } from "./layers/Overlays";
import { Horizon, Sky, Terrain, Water } from "./layers/Terrain";
import { cityUniforms } from "./materials";

export function CityCanvas({ interactive }: { interactive: boolean }) {
  const worldId = useGame((s) => s.worldId);
  return (
    <Canvas
      className="absolute inset-0"
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.5, far: 2200, position: [30, 34, 52] }}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
        alpha: false,
      }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
        scene.background = null;
        gl.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
      }}
    >
      <SceneRoot key={worldId} interactive={interactive} />
    </Canvas>
  );
}

function SceneRoot({ interactive }: { interactive: boolean }) {
  return (
    <>
      <Sky />
      <SimTicker interactive={interactive} />
      <CameraRig interactive={interactive} />
      {sim ? (
        <group>
          <Terrain />
          <Horizon />
          <Water />
          <Roads />
          <StreetLamps />
          <Vegetation />
          <Grass />
          <Buildings />
          <Vehicles />
          <Smoke />
          <Clouds />
          <Rain />
          {interactive ? <ZonePlates /> : null}
          {interactive ? <DataOverlay /> : null}
          {interactive ? <Ghost /> : null}
          {interactive ? <Selection /> : null}
        </group>
      ) : null}
    </>
  );
}

/**
 * Un único punto donde avanza la simulación, se publica el snapshot al HUD y se guarda.
 * El render nunca modifica reglas: solo lee.
 */
function SimTicker({ interactive }: { interactive: boolean }) {
  const snapAcc = useRef(0);
  const saveAcc = useRef(0);
  const frames = useRef(0);
  const fpsAcc = useRef(0);
  const { gl } = useThree();
  const pull = useGame((s) => s.pullSnapshot);
  const persist = useGame((s) => s.persistNow);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl]);

  useFrame((_, dt) => {
    frames.current += 1;
    fpsAcc.current += dt;
    if (typeof window !== "undefined" && fpsAcc.current > 0.5) {
      (window as Window & { __r3f?: { frames: number; calls: number; fps: number } }).__r3f = {
        frames: frames.current,
        calls: gl.info.render.calls,
        fps: Math.round(frames.current / fpsAcc.current),
      };
      frames.current = 0;
      fpsAcc.current = 0;
    }
    if (!sim) return;

    sim.step(interactive ? dt : dt * 0.35);
    // Ventanas y farolas siguen la hora del simulador, no el reloj real.
    const sky = skyFor(sim.hour);
    cityUniforms.uNight.value = sky.night;
    cityUniforms.uRain.value = sim.rain;
    cityUniforms.uTime.value += dt;
    gl.toneMappingExposure = 1.12 + sky.night * 0.2;

    snapAcc.current += dt;
    if (snapAcc.current > 0.25) {
      snapAcc.current = 0;
      if (interactive) pull();
    }
    if (interactive) {
      saveAcc.current += dt;
      if (saveAcc.current > 15) {
        saveAcc.current = 0;
        persist();
      }
    }
  });
  return null;
}

export const MAP_SIZE = N;
