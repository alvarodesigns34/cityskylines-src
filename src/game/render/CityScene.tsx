import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { N } from "../sim/types";
import { sim, useGame } from "../store";
import { CameraRig } from "./CameraRig";
import { skyFor } from "./daynight";
import { Buildings, Roads, StreetLamps, Vegetation } from "./layers/City";
import { Smoke, Vehicles } from "./layers/Effects";
import { DataOverlay, Ghost, Selection, ZonePlates } from "./layers/Overlays";
import { Sky, Terrain, Water } from "./layers/Terrain";
import { cityUniforms } from "./materials";

export function CityCanvas({ interactive }: { interactive: boolean }) {
  const worldId = useGame((s) => s.worldId);
  return (
    <Canvas
      className="absolute inset-0"
      shadows="percentage"
      dpr={[1, 1.75]}
      camera={{ fov: 42, near: 0.5, far: 2200, position: [30, 34, 52] }}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
        alpha: false,
      }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
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
          <Water />
          <Roads />
          <StreetLamps />
          <Vegetation />
          <Buildings />
          <Vehicles />
          <Smoke />
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
    cityUniforms.uNight.value = skyFor(sim.hour).night;
    cityUniforms.uTime.value += dt;

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
