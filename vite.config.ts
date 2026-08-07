import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve("packages/report-ui"),
  plugins: [svelte()],
  build: {
    emptyOutDir: true,
    outDir: path.resolve("skills/utsuri-review/assets/report-ui"),
    rollupOptions: {
      input: path.resolve("packages/report-ui/src/main.ts"),
      output: {
        entryFileNames: "app.js",
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith(".css")) ? "app.css" : "[name][extname]"
      }
    }
  }
});
