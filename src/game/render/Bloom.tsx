import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { sim } from "../store";
import { skyFor } from "./daynight";

/**
 * Resplandor de noche sobre ventanas, farolas y faros.
 *
 * Umbral alto (0.86): solo lo que ya emite luz brilla, no la escena entera. Se atenúa a 0
 * durante el día porque de día no hay nada emisivo que resaltar y ahorra el coste del pase.
 */
export function Bloom() {
  const { gl, scene, camera, size } = useThree();

  const { composer, bloom } = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const b = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.28, 0.94);
    c.addPass(b);
    c.addPass(new OutputPass());
    return { composer: c, bloom: b };
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
    composer.setPixelRatio(gl.getPixelRatio());
  }, [composer, gl, size]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame(
    () => {
      const night = skyFor(sim?.hour ?? 12).night;
      bloom.strength = night * 0.32;
      composer.render();
    },
    1,
  );

  return null;
}
