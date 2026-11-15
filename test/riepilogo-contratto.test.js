// Prove del Riepilogo con contratto e regole del giorno (app/riepilogo.js), con la pagina simulata: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
const ascolti = {}, elementi = {};
const elemento = (id) => elementi[id] || (elementi[id] = {
  id, hidden: false, innerHTML: '', value: '', textContent: '', addEventListener: (tipo, f) => { ascolti[id + ':' + tipo] = f; },
  querySelectorAll: () => [], querySelector: () => null,
});
global.document = { getElementById: elemento, querySelectorAll: () => [], activeElement: null };
require('../app/comune.js');
require('../app/onsite.js');
require('../app/regole.js');
const DO = window.DO;
const R = DO.regole;
let pagina = null;
DO.admin = { registra(p) { pagina = p; }, regole: R.complete(null), operatori: [], eventi: [], onsite: [], compensiOnsite: {}, vista: 'riepilogo' };
DO.oggi = () => '2026-11-15';
require('../app/riepilogo.js');
const A = DO.admin;

// Excel finto: raccoglie i fogli come tabelle
let fogli = {};
window.XLSX = { utils: { book_new: () => ({}), aoa_to_sheet: (a) => a, book_append_sheet: (wb, f, nome) => { fogli[nome] = f; } }, writeFile() {} };
const periodo = async (id) => { elemento('rie-periodo').value = id; pagina.mostra('riepilogo'); elemento('rie-periodo').value = id; pagina.mostra('riepilogo'); fogli = {}; await ascolti['rie-excel:click'](); };

// Mario è P.IVA fino al 1 novembre, Coop dal 2 novembre; Luca è sempre P.IVA
const MARIO = { id: 'm', nome: 'Mario', ruolo: 'operatore', attivo: true, contratto: 'Coop', contrattoDal: '2026-11-02', contrattiPrecedenti: [{ dal: '', contratto: 'P.IVA' }] };
const LUCA = { id: 'l', nome: 'Luca', ruolo: 'operatore', attivo: true, contratto: 'P.IVA' };
const evento = (id, data, operatoreId) => ({ id, data, operatoreId, tipo: 'partita', competizione: 'Serie A', orario: '20:45', stato: 'confermato' });
function prepara(conCambio) {
  A.operatori = [conCambio ? MARIO : Object.assign({}, MARIO, { contratto: 'P.IVA', contrattoDal: undefined, contrattiPrecedenti: undefined }), LUCA];
  A.eventi = [evento('e1', '2026-11-01', 'm'), evento('e2', '2026-11-10', 'm'), evento('e3', '2026-11-10', 'l')];
  A.onsite = [{ id: 'd1', stato: 'aperta', da: '2026-10-29', a: '2026-11-03', luogo: 'X', sport: 'Y',
    giorni: ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'].map((data) => ({ data })), accettatiOP: ['m'], accettatiTL: [] }];
  A.compensiOnsite = { d1: 1000 };
}
const tariffa = (c) => R.gettone(evento('x', '2026-11-10', 'm'), { contratto: c }, A.regole).importo;

test('eventi: il contratto è quello del giorno, e Netto P.IVA / Coop lo seguono', async () => {
  prepara(true);
  await periodo('2026-11');
  const conv = fogli.Convocazioni;
  assert.equal(conv[1][10], 'P.IVA');   // 1 novembre
  assert.equal(conv[2][10], 'Coop');    // 10 novembre
  assert.notEqual(tariffa('P.IVA'), tariffa('Coop'));
  const comp = fogli['Per competizione'];
  assert.deepEqual(comp[1], ['Serie A', 3, tariffa('P.IVA') * 2, tariffa('Coop'), tariffa('P.IVA') * 2 + tariffa('Coop')]);
});

test('on-site: il deployment si divide per contratto, con le quote per mese', async () => {
  prepara(true);
  await periodo('2026-11');
  const on = fogli['On-site'];
  assert.equal(on.length, 3);
  assert.deepEqual(on.slice(1).map((r) => [r[7], r[8], r[9]]), [['P.IVA', 1, 166.67], ['Coop', 2, 333.33]]);
  await periodo('stagione');
  assert.deepEqual(fogli['On-site'].slice(1).map((r) => [r[7], r[8], r[9]]), [['P.IVA', 4, 666.67], ['Coop', 2, 333.33]]);
  assert.deepEqual(fogli['Per competizione'].pop(), ['On-site (giorni-persona)', 6, 666.67, 333.33, 1000]);
  // la tabella per operatore dà il contratto a fine periodo
  assert.equal(fogli['Per operatore'].find((r) => r[0] === 'Mario')[2], 'Coop');
});

test('senza cambi di contratto una sola riga on-site con tutto il periodo', async () => {
  prepara(false);
  await periodo('2026-11');
  const on = fogli['On-site'];
  assert.equal(on.length, 2);
  assert.deepEqual([on[1][7], on[1][8], on[1][9]], ['P.IVA', 3, 500]);
});

test('nota dei cambi sopra le tabelle solo se ci sono cambi nel periodo', () => {
  prepara(true);
  elemento('rie-periodo').value = '2026-11';
  pagina.mostra('riepilogo');
  elemento('rie-periodo').value = '2026-11';
  pagina.mostra('riepilogo');
  assert.match(elemento('rie-contenuto').innerHTML, /<p class="nota">Mario: Coop dal 02\/11<\/p>/);
  elemento('rie-periodo').value = '2026-10';
  pagina.mostra('riepilogo');
  assert.doesNotMatch(elemento('rie-contenuto').innerHTML, /<p class="nota">/);
});

test('competizione rinominata: una riga sola, col nome in vigore, nella pagina e nell\'Excel', async () => {
  const regolePrima = A.regole;
  A.regole = R.complete({ competizioni: [{ nome: 'Serie A Enilive', alias: ['Serie A'], sport: 'Calcio' }] });
  prepara(false);
  A.onsite = [];
  A.eventi = [evento('e1', '2026-11-10', 'l'), Object.assign(evento('e2', '2026-11-11', 'l'), { competizione: 'Serie A Enilive' })];
  await periodo('2026-11');
  const comp = fogli['Per competizione'];
  assert.deepEqual(comp.slice(1).map((r) => [r[0], r[1]]), [['Serie A Enilive', 2]]);
  const html = elemento('rie-contenuto').innerHTML;
  assert.equal((html.match(/<b>Serie A Enilive<\/b>/g) || []).length, 2);   // «Per competizione» e l'incrocio
  assert.ok(!html.includes('<b>Serie A</b>'));
  A.regole = regolePrima;
});
