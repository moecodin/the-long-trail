import { defineConfig } from "vite";

// "./" keeps every file path relative, so the built game works from any
// folder or link (GitHub Pages, a phone preview, later the Capacitor app).
export default defineConfig({
  base: "./",
  // Three.js is big; that is expected and fine for a game.
  build: { chunkSizeWarningLimit: 900 },
});
