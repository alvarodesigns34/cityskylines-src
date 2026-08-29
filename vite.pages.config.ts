import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Build estática para GitHub Pages.
 *
 * Deliberadamente aparte de `vite.config.ts`: aquella compila la app con TanStack Start y
 * Nitro (servidor), que es lo que usa el entorno de desarrollo. Aquí solo hace falta un SPA,
 * porque el juego no toca servidor en ningún momento.
 *
 * `PAGES_BASE` permite cambiar la ruta base (por defecto, el nombre del repositorio) si algún
 * día se sirve desde un dominio propio.
 */
export default defineConfig({
  base: process.env.PAGES_BASE ?? "/cityskylines-src/",
  root: fileURLToPath(new URL("./pages", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [tailwindcss(), viteReact()],
  build: {
    outDir: fileURLToPath(new URL("./dist-pages", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});
