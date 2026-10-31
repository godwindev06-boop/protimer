const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { controllerSource } = require('./helpers/controller-source');

const source = controllerSource();
function section(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Controller section exists: ${start}`);
  return source.slice(first, last);
}
// Stvarne funkcije iz kontrolera: parseTime/formatDurationHMS (timer.js) i CSV uvoz/izvoz (rundown-csv.js).
function csv() {
  const context = vm.createContext({});
  vm.runInContext(section('function pad(n)', '\nfunction '), context);
  vm.runInContext(section('function parseTime(str)', '\nfunction '), context);
  vm.runInContext(section('function formatDurationHMS(ms)', '\nfunction '), context);
  vm.runInContext(section('function parseRundownCSV(txt)', 'function cueMessage('), context);
  return context;
}

test('rundown export uses a header, HH:MM:SS durations and semicolons', () => {
  const ctx = csv();
  const text = ctx.rundownToCSV([
    { name: 'Louange et adoration', durationMs: 25 * 60000, note: 'Chorale', color: '#22C55E' },
    { name: 'Prédication', durationMs: 3600000 + 90000, note: '', color: '' }
  ]);
  assert.equal(text, 'Name;Duration;Note;Color\r\nLouange et adoration;00:25:00;Chorale;#22C55E\r\nPrédication;01:01:30;;\r\n');
});

test('rundown export quotes separators and quotes, and flattens line breaks', () => {
  const ctx = csv();
  const text = ctx.rundownToCSV([{ name: 'Annonces; offrande', durationMs: 300000, note: 'Dire "merci",\nvite', color: '' }]);
  assert.equal(text.split('\r\n')[1], '"Annonces; offrande";00:05:00;"Dire ""merci"", vite";');
});

test('exported rundown imports back unchanged', () => {
  const ctx = csv();
  const cues = [
    { name: 'Accueil', durationMs: 5 * 60000, note: 'Pasteur Jean, chantre', color: '#2563EB' },
    { name: 'Annonces; offrande', durationMs: 10 * 60000, note: 'Dire "merci"', color: '' },
    { name: 'Prédication', durationMs: 45 * 60000 + 30000, note: '', color: '#8B5CF6' }
  ];
  const back = JSON.parse(JSON.stringify(ctx.parseRundownCSV(ctx.rundownToCSV(cues))));
  assert.deepEqual(back, cues);
});

test('import keeps comma, semicolon and tab files working and skips the header', () => {
  const ctx = csv();
  const rows = text => JSON.parse(JSON.stringify(ctx.parseRundownCSV(text))).map(r => [r.name, r.durationMs]);
  assert.deepEqual(rows('Session,Duration,Note\nAccueil,05:00,x\nLouange,20,y'), [['Accueil', 300000], ['Louange', 1200000]]);
  assert.deepEqual(rows('Nom;Durée\nAccueil;00:05:00'), [['Accueil', 300000]]);
  assert.deepEqual(rows('Accueil\t5:00\t\t#ffffff'), [['Accueil', 300000]]);
});

test('imported names and notes respect the editor limits', () => {
  const ctx = csv();
  const [row] = ctx.parseRundownCSV(`${'N'.repeat(300)};10:00;${'x'.repeat(400)}`);
  assert.equal(row.name.length, 160);
  assert.equal(row.note.length, 240);
});

test('export file name is dated', () => {
  assert.equal(csv().rundownFileName(new Date(2026, 10, 1)), 'protimer-rundown-2026-11-01.csv');
});
