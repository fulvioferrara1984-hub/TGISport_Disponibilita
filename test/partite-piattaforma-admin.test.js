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

test('esegui: restituisce i campi scritti per ogni partita aggiornata (l\'invio non aspetta l\'ascolto)', async () => {
  const { finestra } = prepara();
  const scritte = await DO.partiteAdmin.esegui(finestra);
  assert.deepEqual(Object.keys(scritte).sort(), ['ann', 'coll', 'libera']);
  assert.deepEqual(scritte.ann, { stato: 'annullato' });
  assert.equal(scritte.coll.orario, '20:45');
  assert.equal(scritte.libera.progettoId, 'p1');
});

test('esegui: nessun campo restituito per le scritture rifiutate, in sola visualizzazione o senza giro', async () => {
  let { finestra } = prepara({ risposta: false });
  assert.deepEqual(await DO.partiteAdmin.esegui(finestra), {});
  ({ finestra } = prepara({ solaLettura: true }));
  assert.deepEqual(await DO.partiteAdmin.esegui(finestra), {});
  prepara();
  assert.deepEqual(await DO.partiteAdmin.esegui(null), {});
});

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

test('esegui: un collegamento che rimanda conta tra le collegate e tra le da rimandare', async () => {
  const { avvisi, finestra } = prepara();
  DO.admin.eventi = [pa({ id: 'libera', titolo: 'Roma-Lazio', data: '2026-11-21', inviata: true, orario: '18:00' })];
  await DO.partiteAdmin.esegui([finestra[1]]);
  assert.equal(avvisi[0].testo, 'Dalla piattaforma: 1 partita collegata, 1 da rimandare.');
});

test('filtra: dopo un aggiornamento le righe che non servono più spariscono', async () => {
  const { finestra } = prepara({ solaLettura: true });
  const ev6 = Object.assign({}, finestra[3], { id: 'p6', squadraA: 'GENOA', squadraB: 'TORINO' });
  const rev = pa({ id: 'rev', titolo: 'Genoa-Torino', progettoId: 'p6', inviata: true, data: '2026-11-22' });
  const c1 = pa({ id: 'c1', titolo: 'Rennais-Olympiacos', progettoId: '', data: '2026-11-24' });
  const c2 = pa({ id: 'c2', titolo: 'Rennais-Olympiacos', progettoId: '', data: '2026-11-24' });
  DO.admin.eventi = [rev, c1, c2];
  await DO.partiteAdmin.esegui([ev6, ev({ id: 'p7', squadraA: 'STADE RENNAIS', squadraB: 'OLYMPIACOS', data: '2026-11-24' })]);
  let s = DO.partiteAdmin.stato();
  assert.deepEqual([s.dubbi.length, s.dubbi[0].candidate.length, s.daRivedere.length], [1, 2, 1]);
  DO.partiteAdmin.filtra();
  assert.deepEqual([DO.partiteAdmin.stato().dubbi[0].candidate.length, DO.partiteAdmin.stato().daRivedere.length], [2, 1]);
  // la riga «da rivedere» sparisce se la partita è annullata; una candidata sparisce se non è più libera
  DO.admin.eventi = [Object.assign({}, rev, { stato: 'annullato' }), c1, Object.assign({}, c2, { progettoId: 'altro' })];
  DO.partiteAdmin.filtra();
  s = DO.partiteAdmin.stato();
  assert.deepEqual([s.dubbi[0].candidate.map((c) => c.id), s.daRivedere.length], [['c1'], 0]);
  // il dubbio sparisce se una partita ha ora il progettoId dell'evento
  DO.admin.eventi = [Object.assign({}, c1, { progettoId: 'p7' })];
  DO.partiteAdmin.filtra();
  assert.equal(DO.partiteAdmin.stato().dubbi.length, 0);
});

// ---------- minori della revisione ----------
test('esegui: un allineamento che rimanda conta tra le da rimandare, non tra le aggiornate', async () => {
  const { avvisi, finestra } = prepara();
  DO.admin.eventi = [pa({ id: 'coll', progettoId: 'p2', orario: '18:00', inviata: true, stato: 'confermato' })];
  await DO.partiteAdmin.esegui([finestra[2]]);
  assert.equal(avvisi[0].testo, 'Dalla piattaforma: 1 partita da rimandare.');
});

test('esegui: un ripristino conta tra le ripristinate', async () => {
  const { avvisi, finestra } = prepara();
  DO.admin.eventi = [pa({ id: 'ann', progettoId: 'p2', stato: 'annullato', storico: [{ testo: 'Annullata dalla piattaforma: evento annullato' }] })];
  await DO.partiteAdmin.esegui([finestra[2]]);
  assert.equal(avvisi[0].testo, 'Dalla piattaforma: 1 partita ripristinata.');
});

test('esegui: rilettura per ID non riuscita: la partita collegata fuori finestra non si tocca', async () => {
  const { scritture, avvisi } = prepara();
  DO.dati.leggiProgetti = async () => { throw new Error('offline'); };
  DO.admin.eventi = [pa({ id: 'fuori', progettoId: 'p9', data: '2026-11-21' })];
  await DO.partiteAdmin.esegui([]);
  assert.deepEqual(scritture, []);
  assert.deepEqual(avvisi, []);
});

test('riquadro: durante la scrittura di Collega il pulsante resta disabilitato anche se il riquadro si ridisegna', async () => {
  const { finestra } = prepara();
  const box = { hidden: false, innerHTML: '' };
  global.document = { getElementById: (id) => (id === 'remote-piattaforma' ? box : null) };
  DO.giorno = () => ({ breve: 'Mar' });
  DO.esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  try {
    DO.admin.eventi = [pa({ id: 'c1', titolo: 'Rennais-Olympiacos', data: '2026-11-24' })];
    DO.admin.solaLettura = true;
    await DO.partiteAdmin.esegui([ev({ id: 'p7', squadraA: 'STADE RENNAIS', squadraB: 'OLYMPIACOS', data: '2026-11-24' })]);
    DO.admin.solaLettura = false;
    let finisci;
    DO.dati.aggiornaDallaPiattaforma = () => new Promise((r) => { finisci = r; });
    const bottone = { dataset: { azione: 'collega', id: 'p7|c1' }, disabled: false };
    const fatto = DO.partiteAdmin.clic(bottone);
    DO.partiteAdmin.disegna();
    assert.match(box.innerHTML, /data-id="p7\|c1" disabled/);
    finisci(false);
    DO.avviso = () => {};
    await fatto;
    DO.partiteAdmin.disegna();
    assert.doesNotMatch(box.innerHTML, /disabled/);
  } finally { delete global.document; }
});

test('riquadro: la data della riga passa da DO.esc', async () => {
  prepara({ solaLettura: true });
  const box = { hidden: false, innerHTML: '' };
  global.document = { getElementById: () => box };
  DO.giorno = () => ({ breve: '<b>' });
  DO.esc = (s) => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  try {
    DO.admin.eventi = [];
    await DO.partiteAdmin.esegui([ev({ id: 'p8', competizione: 'UEFA YOUTH LEAGUE' })]);
    assert.ok(box.innerHTML.includes('&lt;b&gt;'));
  } finally { delete global.document; }
});
