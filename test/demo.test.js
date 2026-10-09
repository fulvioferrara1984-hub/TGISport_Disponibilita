// Prove del backend demo, che replica le regole di Firebase: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = { addEventListener() {} };
// memoria del browser in versione minima: la demo salva lì i suoi dati
const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
global.localStorage = memoria();
global.sessionStorage = memoria();
require('../app/comune.js');
require('../app/regole.js');
require('../app/demo.js');
const DO = window.DO, D = DO.demo;

const statoDemo = () => new Promise((fatto) => { const ferma = D.ascolta((s) => { ferma(); fatto(s); }); });

test('rinunciare: solo convocazioni in attesa e fuori dalla finestra di blocco', async () => {
  D.configura('operatore', () => {});
  await D.accediOperatore('DEMO-0001', false);
  const g = (n) => DO.aggiungi(DO.oggi(), n);
  await D.creaEventi([
    { tipo: 'partita', competizione: 'Serie A', data: g(1), titolo: 'Vicina', orario: '20:45', operatoreId: 'op-demo1' },
    { tipo: 'partita', competizione: 'Serie A', data: g(10), titolo: 'Lontana', orario: '20:45', operatoreId: 'op-demo1' },
    { tipo: 'partita', competizione: 'Serie A', data: g(11), titolo: 'Confermata', orario: '20:45', operatoreId: 'op-demo1' },
  ]);
  const ev = (await statoDemo()).eventi;
  const [vicina, lontana, confermata] = ['Vicina', 'Lontana', 'Confermata'].map((t) => ev.find((e) => e.titolo === t));
  await D.inviaConvocazioni([vicina, lontana, confermata], [], '');
  await D.rispondiConvocazione(confermata, 'confermato', '');
  await assert.rejects(D.rispondiConvocazione(vicina, 'rifiutato', ''), /chiama il supervisore/);
  await assert.rejects(D.rispondiConvocazione(confermata, 'rifiutato', ''), /chiama il supervisore/);
  await D.rispondiConvocazione(lontana, 'rifiutato', 'impegno');
  await D.rispondiConvocazione(vicina, 'confermato', '');
});

test('impostazioni dei promemoria nella demo', async () => {
  const imp = await D.leggiImpostazioni();
  assert.deepEqual([imp.promemoriaAttivi, imp.promemoriaGiorni, imp.promemoriaProgrammato, imp.ultimoPromemoria], [true, 3, true, null]);
  await assert.rejects(D.salvaImpostazioni({ emailSupervisori: 's@x.it', emailAttive: true, promemoriaAttivi: true, promemoriaGiorni: 8 }), /I giorni del promemoria vanno da 1 a 7\./);
  const vecchia = await D.salvaImpostazioni({ emailSupervisori: 's@x.it', emailAttive: true });
  assert.deepEqual([vecchia.promemoriaAttivi, vecchia.promemoriaGiorni, vecchia.emailSupervisori], [true, 3, 's@x.it']);
  const nuova = await D.salvaImpostazioni({ emailSupervisori: 's@x.it', emailAttive: true, promemoriaAttivi: false, promemoriaGiorni: 5 });
  assert.deepEqual([nuova.promemoriaAttivi, nuova.promemoriaGiorni], [false, 5]);
  assert.equal((await D.leggiImpostazioni()).promemoriaGiorni, 5);
});
