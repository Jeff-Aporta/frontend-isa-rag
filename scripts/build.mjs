/**
 * Build _dist: CSS + ESM main.tsx minificados.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "_dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "js"), { recursive: true });
mkdirSync(join(dist, "css"), { recursive: true });

const cssResult = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["css/app.css"],
  bundle: true,
  outfile: join(dist, "css", "app.css"),
  minify: true,
  logLevel: "info",
  write: true,
  metafile: true,
});

const jsResult = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["js/main.tsx"],
  bundle: true,
  format: "esm",
  outfile: join(dist, "js", "main.js"),
  minify: true,
  sourcemap: true,
  target: "es2022",
  jsx: "automatic",
  legalComments: "none",
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
  metafile: true,
  logLevel: "info",
});

const cssOut = readFileSync(join(dist, "css", "app.css"));
const jsOut = readFileSync(join(dist, "js", "main.js"));
const bytesIn =
  Object.values(cssResult.metafile?.inputs || {}).reduce((s, i) => s + i.bytes, 0) +
  Object.values(jsResult.metafile?.inputs || {}).reduce((s, i) => s + i.bytes, 0);
const bytesOut = cssOut.byteLength + jsOut.byteLength;
const meta = {
  builtAt: new Date().toISOString(),
  mode: "bundle",
  entry: ["css/app.css", "js/main.tsx"],
  files: 2,
  bytesIn,
  bytesOut,
  hash: createHash("sha256").update(jsOut).update(cssOut).digest("hex").slice(0, 12),
  outputs: ["_dist/css/app.css", "_dist/js/main.js"],
};

writeFileSync(join(dist, "build-meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");

// Inyecta el hash del build en index.html como ?v=<hash> en el script y css
// para que los browsers invaliden cache al deployar.
const indexPath = join(root, "index.html");
let indexHtml = readFileSync(indexPath, "utf8");
const versioned = indexHtml
  .replace(/_dist\/css\/app\.css(\?v=[a-z0-9]+)?/, `_dist/css/app.css?v=${meta.hash}`)
  .replace(/_dist\/js\/main\.js(\?v=[a-z0-9]+)?/, `_dist/js/main.js?v=${meta.hash}`);
if (versioned !== indexHtml) {
  writeFileSync(indexPath, versioned, "utf8");
  console.log(`OK index.html versionado con ?v=${meta.hash}`);
}

const pct = meta.bytesIn ? Math.round((1 - meta.bytesOut / meta.bytesIn) * 100) : 0;
console.log(`OK _dist hash=${meta.hash} ${meta.bytesIn} → ${meta.bytesOut} B (−${pct}%)`);
