const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = { 'controller/controller.css': '../fonts/', 'output.html': 'fonts/', 'remote.html': 'fonts/', 'backstage.html': 'fonts/' };

test('every view embeds the bundled Inter font and uses no system-only font stack', () => {
  for (const [file, prefix] of Object.entries(pages)) {
    const css = read(file);
    for (const font of ['inter-latin.woff2', 'inter-latin-ext.woff2']) {
      assert.ok(css.includes(`url("${prefix}${font}")`), `${file} loads ${font}`);
      assert.ok(fs.statSync(path.join(root, 'fonts', font)).size > 20000);
    }
    for (const family of css.matchAll(/font-family:\s*([^;}]+)/g))
      if (family[1].trim() !== 'inherit') assert.match(family[1], /^"ProTimer Inter"/, `${file}: ${family[1]}`);
    assert.doesNotMatch(css, /SF Mono|Menlo/);
  }
  assert.doesNotMatch(read('deck-ui.css'), /SF Mono|Menlo|-apple-system,"Helvetica/);
});

test('fonts are packaged, licensed and served to phones / OBS', () => {
  const pkg = require('../package.json');
  assert.ok(pkg.build.files.includes('fonts/**/*'));
  assert.ok(read('licenses/Inter-OFL.txt').includes('SIL Open Font License'));
  const main = read('main.js');
  assert.match(main, /'\/fonts\/inter-latin\.woff2': 'inter-latin\.woff2'/);
  assert.match(main, /'Content-Type': 'font\/woff2'/);
});
