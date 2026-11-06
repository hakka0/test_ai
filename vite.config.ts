import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
const version=JSON.parse(readFileSync(new URL("./package.json",import.meta.url),"utf8")).version;
export default defineConfig({
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
  build: { chunkSizeWarningLimit: 1600 },
});
