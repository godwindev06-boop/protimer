const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const missing = (dict, ref) => Object.keys(ref).filter(key => !(key in dict));

function controllerI18N() {
  const context = vm.createContext({ localStorage: { getItem: () => null }, navigator: { language: 'fr-FR' } });
  const base = read('controller/i18n.js');
  vm.runInContext(base.slice(0, base.indexOf('function applyLang')) + '\n' + read('controller/i18n-fr.js') + '\nthis.result={I18N,lang,t};', context);
  return context.result;
}

test('controller French dictionary covers every English and Serbian key', () => {
  const { I18N } = controllerI18N();
  assert.deepEqual(missing(I18N.fr, I18N.en), []);
  assert.deepEqual(missing(I18N.fr, I18N.sr), []);
});

test('every data-i18n key used by Control exists in all three languages', () => {
  const { I18N } = controllerI18N();
  const keys = [...read('controller.html').matchAll(/data-i18n(?:-ph|-title|-html)?="([^"]+)"/g)].map(m => m[1]);
  assert.ok(keys.length > 100);
  for (const lang of ['sr', 'en', 'fr']) assert.deepEqual([...new Set(keys.filter(key => !(key in I18N[lang])))], [], lang);
});

test('Control offers SR, EN and FR and starts in the system language when nothing is saved', () => {
  assert.match(read('controller.html'), /data-lang="sr">SR<\/button>\s*<button data-lang="en">EN<\/button>\s*<button data-lang="fr">FR<\/button>/);
  const { lang, t } = controllerI18N();
  assert.equal(lang, 'fr');
  assert.equal(t('cueImportBtn'), 'Importer CSV');
});

test('Stream Deck UI has a complete French string table', () => {
  const src = read('deck-ui.js');
  const table = vm.runInNewContext('(' + src.slice(src.indexOf('{', src.indexOf('const STRINGS')), src.indexOf('};', src.indexOf('const STRINGS')) + 1) + ')');
  assert.deepEqual(missing(table.fr, table.en), []);
  assert.doesNotMatch(src, /language==='sr'\?'/, 'inline two-language strings must go through tx()');
});

test('phone remote and Backstage translate every key into French', () => {
  const remote = read('remote.html'), backstage = read('backstage.html');
  const remoteI18N = vm.runInNewContext('(' + remote.slice(remote.indexOf('{', remote.indexOf('const I18N')), remote.indexOf('\n};', remote.indexOf('const I18N')) + 2) + ')');
  const backstageT = vm.runInNewContext('(' + backstage.slice(backstage.indexOf('{', backstage.indexOf('const T =')), backstage.indexOf('\n};', backstage.indexOf('const T =')) + 2) + ')');
  assert.deepEqual(missing(remoteI18N.fr, remoteI18N.en), []);
  assert.deepEqual(missing(backstageT.fr, backstageT.en), []);
});

test('audience screen shows French NEXT and reconnect labels', () => {
  const output = read('output.html');
  assert.match(output, /fr:'À SUIVRE'/);
  assert.match(output, /fr:'RECONNEXION…'/);
});
