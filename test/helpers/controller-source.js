'use strict';
// controller.html učitava CSS i JS iz controller/. Testovi koji seku izvorni kod po markerima
// dobijaju isti "virtuelni" jedinstveni dokument: lokalni fajlovi se ubacuju inline, istim redosledom.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function controllerSource() {
  return read('controller.html')
    .replace(/<link rel="stylesheet" href="(controller\/[^"]+\.css)">/g, (_, file) => `<style>\n${read(file)}</style>`)
    // Moduli se spajaju u jedan <script> blok, kao pre podele: sekcije mogu da pređu granicu fajla.
    .replace(/(?:<script src="controller\/[^"]+\.js"><\/script>\s*)+/, block =>
      `<script>\n${[...block.matchAll(/src="([^"]+)"/g)].map(m => read(m[1])).join('\n')}</script>\n`);
}

function controllerModules() {
  return [...read('controller.html').matchAll(/<script src="(controller\/[^"]+\.js)"><\/script>/g)].map(m => m[1]);
}

module.exports = { controllerSource, controllerModules };
