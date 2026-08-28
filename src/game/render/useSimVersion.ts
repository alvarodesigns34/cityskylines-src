import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { CitySim } from "../sim/city";
import { sim } from "../store";

/**
 * Vuelve a renderizar la capa solo cuando cambia su contador de versión.
 *
 * Cada capa observa el suyo (`roadsVersion`, `buildingsVersion`, …), así pintar una calle no
 * reconstruye las mallas de edificios ni de árboles.
 */
export function useSimVersion(pick: (s: CitySim) => number): number {
  const [rev, setRev] = useState(0);
  const last = useRef(-1);
  useFrame(() => {
    if (!sim) return;
    const v = pick(sim);
    if (v !== last.current) {
      last.current = v;
      setRev((n) => n + 1);
    }
  });
  return rev;
}
