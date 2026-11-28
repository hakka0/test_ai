import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { defineConfig } from "vite";

const version=JSON.parse(readFileSync(new URL("./package.json",import.meta.url),"utf8")).version;
const pagesArtPath = "bachess/public/units/toon-pixel-test-20261117/";
const pagesArtDirectory = new URL("./" + pagesArtPath, import.meta.url);

function readPagesUnitArt() {
  return ["", "icons/"].flatMap(folder =>
    readdirSync(new URL(folder, pagesArtDirectory), { withFileTypes: true })
      .filter(file => file.isFile() && file.name.endsWith(".png"))
      .map(file => {
        const key = folder + file.name;
        const source = readFileSync(new URL(key, pagesArtDirectory));
        const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
        const fileName = `assets/${folder}${file.name.slice(0, -4)}-${hash}.png`;
        return { key, fileName, source };
      }),
  );
}

export default defineConfig(({command, mode}) => {
  const pages = mode === "pages";
  const art = pages ? readPagesUnitArt() : [];
  const unitImages = Object.fromEntries(art.map(({key, fileName}) =>
    [key, command === "build" ? fileName : pagesArtPath + key],
  ));
  return {
    base: pages ? (process.env.PAGES_BASE_PATH || "/test_ai/") : "/",
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __PAGES_UNIT_IMAGES__: JSON.stringify(unitImages),
    },
    plugins: pages ? [{
      name: "pages-unit-images",
      apply: "build",
      generateBundle() {
        for (const {fileName, source} of art) this.emitFile({type: "asset", fileName, source});
      },
    }] : [],
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
    build: { outDir: pages ? "dist-pages" : "dist", chunkSizeWarningLimit: 1600 },
  };
});
