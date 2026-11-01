/**
 * @file copy-worker.mjs
 * Build script to copy the MapLibre GL JS web worker bundle to frontend/public/
 * so it can be served as a same-origin static asset in Next.js.
 *
 * Runs automatically via 'prebuild' and 'postinstall' npm hooks.
 * References: ARCHITECTURE.md Section 17.5, Decision D-17.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');
const distDir = path.join(frontendDir, 'node_modules', 'maplibre-gl', 'dist');
const publicDir = path.join(frontendDir, 'public');

// Candidates for MapLibre worker depending on version (v6 uses .mjs, v5 uses csp-worker.js)
const candidates = [
  'maplibre-gl-worker.mjs',
  'maplibre-gl-csp-worker.js',
  'maplibre-gl-worker.js'
];

let srcWorker = null;
for (const candidate of candidates) {
  const candidatePath = path.join(distDir, candidate);
  if (fs.existsSync(candidatePath)) {
    srcWorker = candidatePath;
    break;
  }
}

if (!srcWorker) {
  console.error('[copy-worker] Error: Could not find MapLibre worker bundle in', distDir);
  process.exit(1);
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Copy to both /maplibre-gl-csp-worker.js and /maplibre-gl-worker.mjs for maximum compatibility
const targets = [
  path.join(publicDir, 'maplibre-gl-csp-worker.js'),
  path.join(publicDir, 'maplibre-gl-worker.mjs')
];

for (const target of targets) {
  fs.copyFileSync(srcWorker, target);
  console.log(`[copy-worker] Copied ${path.basename(srcWorker)} -> ${path.relative(frontendDir, target)}`);
}
