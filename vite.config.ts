import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
const version=JSON.parse(readFileSync(new URL("./package.json",import.meta.url),"utf8")).version;
export default defineConfig(({mode}) => ({
  base: mode === "pages" ? (process.env.PAGES_BASE_PATH || "/test_ai/") : "/",
  define: {__APP_VERSION__:JSON.stringify(version)},
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/matchmake": "http://127.0.0.1:2567",
      "/health": "http://127.0.0.1:2567",
      "/socket": {
        target: "ws://127.0.0.1:2567",
        ws: true,
        rewrite: (p) => p.replace(/^\/socket/, ""),
      },
    },
  },
  build: { outDir: mode === "pages" ? "dist-pages" : "dist", chunkSizeWarningLimit: 1600 },
}));
