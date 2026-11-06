// Prove dell'esecuzione del giro (app/partite-piattaforma-admin.js) con dati e avvisi finti: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
require('../app/regole.js');
require('../app/building.js');
require('../app/partite-piattaforma.js');
require('../app/partite-piattaforma-admin.js');
const DO = window.DO;
const REGOLE = DO.regole.complete({ competizioni: [{ nome: 'Serie A', sport: 'Calcio', prima: 4, dopo: 2 }] });

const ev = (c) => Object.assign({ id: 'p1', codice: '2627-SA-042', competizione: 'SERIE A', round: '12', data: '2026-11-20', ko: '20:45',
  squadraA: 'VENEZIA', squadraB: 'NAPOLI', stato: 'CONFIRMED', modalita: 'REMOTE', attivita: 'MD' }, c);
const pa = (c) => Object.assign({ id: 'c1', tipo: 'partita', competizione: 'Serie A', round: '12', data: '2026-11-20', orario: '20:45',
  titolo: 'Venezia-Napoli', progettoId: '', stato: 'assegnato', inviata: false, operatoreId: 'o1', convocazione: '', fine: '' }, c);

// ambiente: un evento da creare, una partita libera da collegare, una collegata con KO cambiato, una collegata ad evento annullato
function prepara({ solaLettura = false, sincronizzato = true, risposta = true, errore = null } = {}) {
  const scritture = [], avvisi = [];
  DO.oggi = () => '2026-11-06';
  DO.avviso = (testo, tipo, durata) => avvisi.push({ testo, tipo, durata });
  DO.admin = { solaLettura, sincronizzato, regole: REGOLE, operatori: [], eventi: [
    pa({ id: 'libera', titolo: 'Roma-Lazio', data: '2026-11-21' }),
    pa({ id: 'coll', titolo: 'Venezia-Napoli', progettoId: 'p2', orario: '18:00' }),
    pa({ id: 'ann', titolo: 'Inter-Milan', progettoId: 'p3', data: '2026-11-22' }),
  ] };
  DO.dati = {
    leggiCompetizioniPiattaforma: async () => [],
    leggiProgetti: async () => ({}),
    creaPartitaPiattaforma: async (...a) => { scritture.push(['crea', ...a]); if (errore === 'crea') throw new Error('rifiutata'); return risposta; },
    aggiornaDallaPiattaforma: async (...a) => { scritture.push(['aggiorna', ...a]); return risposta; },
  };
  const finestra = [
    ev({ id: 'p0', codice: 'X-1', squadraA: 'GENOA', squadraB: 'TORINO', data: '2026-11-25' }),
    ev({ id: 'p1', squadraA: 'ROMA', squadraB: 'LAZIO', data: '2026-11-21' }),
    ev({ id: 'p2', ko: '20:45', data: '2026-11-20' }),
    ev({ id: 'p3', stato: 'CANCELLED', squadraA: 'INTER', squadraB: 'MILAN', data: '2026-11-22' }),
  ];
  return { scritture, avvisi, finestra };
}

test('esegui: scrive tutte le azioni in ordine e dà un solo avviso', async () => {
  const { scritture, avvisi, finestra } = prepara();
  await DO.partiteAdmin.esegui(finestra);
  assert.deepEqual(scritture.map((s) => s[0] + ':' + (s[1] || '')), ['crea:p0', 'aggiorna:libera', 'aggiorna:coll', 'aggiorna:ann']);
  assert.equal(avvisi.length, 1);
  assert.equal(avvisi[0].testo, 'Dalla piattaforma: 1 partita creata, 1 collegata, 1 aggiornata, 1 annullata.');
  assert.deepEqual([avvisi[0].tipo, avvisi[0].durata], ['ok', 8000]);
  assert.deepEqual(scritture[3].slice(3, 4), [{ stato: 'annullato' }]);
});

for (const [nome, opzioni] of [['sola visualizzazione', { solaLettura: true }], ['copia locale non sincronizzata', { sincronizzato: false }]]) {
  test('esegui: ' + nome + ' non scrive e non avvisa', async () => {
    const { scritture, avvisi, finestra } = prepara(opzioni);
    await DO.partiteAdmin.esegui(finestra);
    assert.deepEqual(scritture, []);
    assert.deepEqual(avvisi, []);
  });
}

test('esegui: una risposta false della transazione non conta e non è un errore', async () => {
  const { scritture, avvisi, finestra } = prepara({ risposta: false });
  await DO.partiteAdmin.esegui(finestra);
  assert.equal(scritture.length, 4);
  assert.deepEqual(avvisi, []);
});

test('esegui: un errore vero conta come non riuscita e si prosegue', async () => {
  const { scritture, avvisi, finestra } = prepara({ errore: 'crea' });
  const avviso = console.warn; console.warn = () => {};
  try { await DO.partiteAdmin.esegui(finestra); } finally { console.warn = avviso; }
  assert.equal(scritture.length, 4);
  assert.equal(avvisi[0].testo, 'Dalla piattaforma: 1 partita collegata, 1 aggiornata, 1 annullata, 1 non riuscita.');
});

test('esegui: competizioni o finestra non lette: il giro non parte', async () => {
  const { scritture, avvisi, finestra } = prepara();
  DO.dati.leggiCompetizioniPiattaforma = async () => null;
  await DO.partiteAdmin.esegui(finestra);
  await DO.partiteAdmin.esegui(null);
  assert.deepEqual(scritture, []);
  assert.deepEqual(avvisi, []);
});
