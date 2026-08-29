import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GameShell } from "@/components/hud/GameShell";
import "@/styles.css";

/**
 * Punto de entrada de la versión estática (GitHub Pages).
 *
 * El juego es cliente puro: la partida vive en `localStorage` y no hay auth ni base de datos.
 * Esta entrada monta el mismo `GameShell` sin router ni servidor, así que la build de Pages no
 * comparte nada con la configuración de TanStack Start / Nitro y no puede romperla.
 */
const el = document.getElementById("app");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <GameShell />
    </StrictMode>,
  );
}
