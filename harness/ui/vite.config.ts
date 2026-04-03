import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const uiRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: uiRoot,
  plugins: [react()],
  server: {
    port: 5173
  },
  build: {
    outDir: resolve(uiRoot, "dist"),
    emptyOutDir: true
  }
});

