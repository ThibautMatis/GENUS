import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Chemins relatifs : le site fonctionne aussi bien en local que sur GitHub Pages (/GENUS/)
  base: "./",
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
});
