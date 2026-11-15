// Prove del salvataggio delle regole con data di validità (app/impostazioni.js), con la pagina simulata: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
const ascolti = {}, elementi = {};
const elemento = (id) => elementi[id] || (elementi[id] = {
  id, hidden: false, innerHTML: '', value: '', textContent: '', addEventListener: (tipo, f) => { ascolti[id + ':' + tipo] = f; },
  showModal() { this.aperto = true; }, close() { this.aperto = false; }, querySelectorAll: () => [], querySelector: () => null,
});
global.document = { getElementById: elemento, querySelectorAll: () => [], activeElement: null };
require('../app/comune.js');
require('../app/onsite.js');
require('../app/regole.js');
const DO = window.DO;
let salvate = [];
let pagina = null;
DO.admin = { registra(p) { pagina = p; }, regole: DO.regole.complete(null), operatori: [], eventi: [], disp: {}, vista: '', operativo: { telefono: '', giorniBlocco: 2 }, visualizzatori: [] };
DO.dati = { salvaRegole: async (r) => { salvate.push(r); } };
DO.avviso = () => {};
DO.oggi = () => '2026-11-15';
require('../app/impostazioni.js');
const invia = (id) => ascolti[id + ':submit']({ preventDefault() {} });

test('cambio di compenso: chiede la data, errore nel dialog, poi salva con la versione precedente', async () => {
  salvate = [];
  pagina.mostra('impostazioni');
  // il compenso della prima competizione cambia: la bozza si modifica dal modulo
  ascolti['reg-competizioni:change']({ target: { dataset: { campo: 'compenso' }, value: 'maggiorato', closest: () => ({ dataset: { i: '0' } }) } });
  invia('form-competizioni');
  assert.equal(elemento('dlg-dal').aperto, true);
  assert.equal(salvate.length, 0);
  elemento('dal-giorno').value = '2026-11-20';
  await invia('form-dal');
  assert.equal(elemento('dal-errore').hidden, false);
  assert.equal(salvate.length, 0);
  elemento('dal-giorno').value = '2026-11-10';
  await invia('form-dal');
  assert.equal(elemento('dlg-dal').aperto, false);
  assert.equal(salvate.length, 1);
  assert.equal(salvate[0].dal, '2026-11-10');
  assert.equal(salvate[0].precedenti.length, 1);
  assert.equal(salvate[0].competizioni[0].compenso, 'maggiorato');
});

test('rinomina senza cambio di compenso: salva subito, il vecchio nome diventa alias', async () => {
  DO.admin.regole = DO.regole.complete(null);
  const nome = DO.admin.regole.competizioni[0].nome;
  salvate = [];
  pagina.mostra('impostazioni');
  ascolti['reg-competizioni:input']({ target: { dataset: { campo: 'nome' }, value: nome + ' bis', closest: (s) => (s === 'li' ? { dataset: { i: '0' }, querySelector: () => ({}) } : null) } });
  await invia('form-competizioni');
  assert.equal(salvate.length, 1);
  assert.equal(salvate[0].competizioni[0].nome, nome + ' bis');
  assert.deepEqual(salvate[0].competizioni[0].alias, [nome]);
  assert.equal(salvate[0].precedenti.length, 0);
});

test('regole precedenti: elenca solo le competizioni con compenso o ritrovo diversi, anche dopo una rinomina', () => {
  const base = DO.regole.complete(null);
  const [c0, c1] = base.competizioni.filter((c) => !c.mansione);
  const v = { dal: '', tariffe: base.tariffe, notteDa: '22:00', notteA: '06:00', anticipoOre: 4,
    competizioni: [
      { nome: 'Vecchio Nome', alias: [], compenso: c0.compenso, prima: c0.prima },          // rinominata, uguale
      { nome: c1.nome, alias: [], compenso: 'maggiorato', prima: c1.prima }] };            // compenso diverso
  DO.admin.regole = Object.assign({}, base, { dal: '2026-11-01', precedenti: [v],
    competizioni: base.competizioni.map((c) => (c === c0 ? Object.assign({}, c, { nome: 'Nuovo Nome', alias: ['Vecchio Nome'] }) : c)) });
  pagina.mostra('impostazioni');
  const html = elemento('reg-precedenti-elenco').innerHTML;
  assert.equal(elemento('reg-precedenti').hidden, false);
  assert.ok(!html.includes('Vecchio Nome'));
  assert.ok(html.includes(c1.nome));
});

test('regole precedenti: una versione parziale non fa saltare la pagina e compare nell\'elenco', () => {
  const base = DO.regole.complete(null);
  DO.admin.regole = Object.assign({}, base, { dal: '2026-11-01',
    precedenti: [{ dal: '', tariffe: { 'P.IVA': { diurno: 130 } }, competizioni: [{ nome: 'Serie A', compenso: 'maggiorato' }] }] });
  elemento('reg-competizioni').innerHTML = '';
  pagina.mostra('impostazioni');
  assert.equal(elemento('reg-precedenti').hidden, false);
  assert.ok(elemento('reg-precedenti-elenco').innerHTML.includes('130'));
  assert.ok(elemento('reg-competizioni').innerHTML.length > 0);
});
