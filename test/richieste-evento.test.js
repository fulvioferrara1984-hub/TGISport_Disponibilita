// Prove delle richieste di disponibilità per un evento (app/richieste-evento.js): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
require('../app/onsite.js');
require('../app/regole.js');
require('../app/richieste-evento.js');
const DO = window.DO, Q = DO.richiesteEvento;

const OGGI = '2026-10-09';
const regole = DO.regole.complete({ competizioni: [{ nome: 'Serie A', prima: 4, dopo: 2 }] });
const partita = (campi) => Object.assign({
  id: 'e1', tipo: 'partita', competizione: 'Serie A', round: '9', data: '2026-10-18', titolo: 'Roma-Lazio', orario: '20:45',
  operatoreId: '', stato: 'da-assegnare', daSostituire: false,
}, campi);
const richiesta = (campi) => Object.assign({
  id: 'e1', destinatari: ['a', 'b', 'c', 'd'], messaggio: '', evento: Q.copiaEvento(partita(), regole),
  aggiornata: '2026-10-09T10:00:00.000Z', risposte: {}, aperta: true, assegnato: '',
}, campi);

test('copia dell\'evento', () => {
  assert.deepEqual(Q.copiaEvento(partita(), regole), {
    titolo: 'Roma-Lazio', tipo: 'partita', competizione: 'Serie A', round: '9', data: '2026-10-18', orario: '20:45', ritrovo: '16:45', fine: '22:45',
  });
  assert.deepEqual(Q.copiaEvento({ tipo: 'supervisione', competizione: 'Serie A', data: '2026-10-18', titolo: 'Supervisione', convocazione: '10:00' }, regole), {
    titolo: 'Remote TL', tipo: 'supervisione', competizione: '', round: '', data: '2026-10-18', orario: '', ritrovo: '10:00', fine: '16:00',
  });
  assert.equal(Q.copiaEvento({ tipo: 'supervisione', data: '2026-10-18', convocazione: '10:00' }, regole).titolo, 'Remote TL');
  assert.deepEqual(Q.copiaEvento({ tipo: 'support', competizione: 'Remote Support', data: '2026-10-18', titolo: 'Remote Support', convocazione: '12:00' }, regole), {
    titolo: 'Remote Support', tipo: 'support', competizione: '', round: '', data: '2026-10-18', orario: '', ritrovo: '12:00', fine: '18:00',
  });
});

test('allineamento con l\'evento', () => {
  const copia = (e) => Q.copiaEvento(e, regole);
  const allinea = (r, e) => Q.allineamento(r, e, e ? copia(e) : null, OGGI);
  assert.equal(allinea(richiesta(), partita()), null);
  const assegnata = partita({ operatoreId: 'a', stato: 'assegnato' });
  assert.deepEqual(allinea(richiesta(), assegnata), { aperta: false, assegnato: 'a' });
  const chiusa = richiesta({ aperta: false, assegnato: 'a' });
  assert.equal(allinea(chiusa, assegnata), null);
  assert.deepEqual(allinea(chiusa, partita({ operatoreId: 'a', stato: 'rifiutato' })), { aperta: true, assegnato: '' });
  assert.deepEqual(allinea(chiusa, partita({ operatoreId: 'a', stato: 'confermato', daSostituire: true })), { aperta: true, assegnato: '' });
  assert.deepEqual(allinea(richiesta(), partita({ stato: 'annullato' })), { aperta: false, assegnato: '' });
  assert.deepEqual(allinea(richiesta({ evento: copia(partita({ data: '2026-10-08' })) }), partita({ data: '2026-10-08' })), { aperta: false, assegnato: '' });
  assert.deepEqual(allinea(richiesta(), null), { aperta: false, assegnato: '' });
  assert.equal(allinea(richiesta({ aperta: false }), null), null);
  const spostata = partita({ orario: '18:00' });
  const campi = allinea(richiesta(), spostata);
  assert.deepEqual(campi, { aperta: true, assegnato: '', evento: copia(spostata), aggiornata: true });
  assert.equal(campi.evento.orario, '18:00');
  assert.equal(campi.evento.ritrovo, '14:00');
  assert.equal(allinea(richiesta({ evento: campi.evento }), spostata), null);
  // chiusa per assegnazione e spostata: chiusura e copia nuova insieme
  assert.deepEqual(allinea(richiesta(), partita({ orario: '18:00', operatoreId: 'b', stato: 'assegnato' })),
    { aperta: false, assegnato: 'b', evento: copia(spostata), aggiornata: true });
});

test('stato della richiesta per l\'operatore', () => {
  const s = (r, id = 'a', oggi = OGGI) => Q.statoPerOperatore(r, id, oggi);
  assert.equal(s(richiesta()), 'da-rispondere');
  assert.equal(s(richiesta({ risposte: { a: { r: 'si', il: '2026-10-09T11:00:00Z' } } })), 'risposto-si');
  assert.equal(s(richiesta({ risposte: { a: { r: 'no', il: '2026-10-09T11:00:00Z' } } })), 'risposto-no');
  const si = { a: { r: 'si', il: '2026-10-09T11:00:00Z' } };
  assert.equal(s(richiesta({ aperta: false, assegnato: 'b', risposte: si })), 'coperto');
  assert.equal(s(richiesta({ aperta: false, assegnato: 'a', risposte: si })), 'nascosta');
  assert.equal(s(richiesta({ aperta: false, assegnato: '', risposte: si })), 'nascosta');
  assert.equal(s(richiesta({ aperta: false, assegnato: 'b', risposte: { a: { r: 'no' } } })), 'nascosta');
  assert.equal(s(richiesta(), 'a', '2026-10-19'), 'nascosta');
  assert.equal(s(richiesta(), 'a', '2026-10-18'), 'da-rispondere');
  assert.equal(s(richiesta({ aperta: false, assegnato: 'b', risposte: si }), 'a', '2026-10-19'), 'nascosta');
});

test('risposta data prima della modifica dell\'evento', () => {
  const r = (il, aggiornata = '2026-10-09T11:00:00.000Z') => richiesta({ aggiornata, risposte: { a: { r: 'si', il } } });
  assert.equal(Q.primaDellaModifica(r('2026-10-09T10:00:00.000Z'), 'a'), true);
  assert.equal(Q.primaDellaModifica(r('2026-10-09T12:00:00.000Z'), 'a'), false);
  assert.equal(Q.primaDellaModifica(r('2026-10-09T10:00:00.000Z'), 'b'), false);
  const ts = (iso) => ({ toMillis: () => Date.parse(iso) });
  assert.equal(Q.primaDellaModifica(r(ts('2026-10-09T10:00:00Z'), ts('2026-10-09T11:00:00Z')), 'a'), true);
  assert.equal(Q.primaDellaModifica(r(new Date('2026-10-09T12:00:00Z'), ts('2026-10-09T11:00:00Z')), 'a'), false);
  assert.equal(Q.ms(null), 0);
  assert.equal(Q.ms('boh'), 0);
});

test('riassunto delle risposte', () => {
  const r = richiesta({ risposte: { a: { r: 'si' }, b: { r: 'no' }, c: { r: 'si' } } });
  assert.deepEqual(Q.riassunto(r), { si: ['a', 'c'], no: ['b'], attesa: 1 });
  assert.deepEqual(Q.riassunto(richiesta({ destinatari: [], risposte: undefined })), { si: [], no: [], attesa: 0 });
});

test('preselezione dei destinatari', () => {
  const p = (campi) => Q.preselezione(Object.assign({ disponibilita: 'D', impegnato: false, onsite: false, giaChiesto: false }, campi));
  assert.equal(p({}), true);
  assert.equal(p({ disponibilita: 'P' }), true);
  assert.equal(p({ disponibilita: 'A' }), false);
  assert.equal(p({ disponibilita: '' }), false);
  assert.equal(p({ impegnato: true }), false);
  assert.equal(p({ onsite: true }), false);
  assert.equal(p({ giaChiesto: true }), false);
  assert.equal(p({ assegnato: true }), false);   // chi ha rifiutato o va sostituito su questo evento
});

test('eventi per cui si può chiedere', () => {
  const c = (campi) => Q.chiedibile(partita(campi), OGGI);
  assert.equal(c({}), '');
  assert.equal(c({ data: OGGI }), '');
  assert.equal(c({ operatoreId: 'a', stato: 'rifiutato' }), '');
  assert.equal(c({ operatoreId: 'a', stato: 'confermato', daSostituire: true }), '');
  assert.equal(c({ operatoreId: 'a', stato: 'assegnato' }), 'L\'evento ha già un operatore: segnalo «da sostituire» per chiedere ad altri.');
  assert.equal(c({ stato: 'annullato' }), 'L\'evento è annullato.');
  assert.equal(c({ data: '2026-10-08' }), 'La partita è già passata.');
});

test('copia diversa solo nei campi della partita', () => {
  const c = Q.copiaEvento(partita(), regole);
  const rovesciata = Object.fromEntries(Object.entries(c).reverse());   // Firestore restituisce i campi in ordine alfabetico
  assert.equal(Q.copiaDiversa(c, rovesciata), false);
  assert.equal(Q.copiaDiversa(Object.assign({}, c, { round: undefined }), Object.assign({}, c, { round: '' })), false);
  assert.equal(Q.copiaDiversa(c, Object.assign({}, c, { orario: '18:00' })), true);
  assert.equal(Q.copiaDiversa(undefined, c), true);
  assert.equal(Q.allineamento(richiesta({ evento: rovesciata }), partita(), c, OGGI), null);
});

test('allineamento ripetuto: ogni passaggio dell\'evento si riflette sulla richiesta', async () => {
  const archivio = { e1: richiesta() };
  const scritture = [];
  const allinea = Q.allineatore(async (id, campi) => { scritture.push(campi); Object.assign(archivio[id], campi); });
  const passo = async (campi) => {
    allinea([archivio.e1], [partita(campi)], regole, OGGI);
    await new Promise((r) => setImmediate(r));
    return [archivio.e1.aperta, archivio.e1.assegnato];
  };
  assert.deepEqual(await passo({ operatoreId: 'a', stato: 'assegnato' }), [false, 'a']);
  assert.deepEqual(await passo({ operatoreId: 'a', stato: 'rifiutato' }), [true, '']);
  assert.deepEqual(await passo({ operatoreId: 'b', stato: 'assegnato' }), [false, 'b']);
  assert.deepEqual(await passo({ operatoreId: 'b', stato: 'rifiutato' }), [true, '']);
  assert.deepEqual(await passo({ operatoreId: 'a', stato: 'assegnato' }), [false, 'a']);
  assert.deepEqual(await passo({ operatoreId: 'a', stato: 'assegnato' }), [false, 'a']);   // già allineata: nessuna scrittura
  assert.equal(scritture.length, 5);
  // orario avanti e indietro: la copia segue ogni cambio
  await passo({ operatoreId: '', orario: '18:00' });
  await passo({ operatoreId: '', orario: '20:45' });
  await passo({ operatoreId: '', orario: '18:00' });
  assert.equal(archivio.e1.evento.orario, '18:00');
  assert.equal(scritture.length, 8);
});

test('allineamento: una correzione che fallisce non si ripete a ogni aggiornamento', async () => {
  let tentativi = 0;
  const allinea = Q.allineatore(async () => { tentativi++; throw new Error('negato'); });
  const avvisi = console.warn;
  console.warn = () => {};
  try {
    for (let i = 0; i < 3; i++) {
      allinea([richiesta()], [partita({ operatoreId: 'a', stato: 'assegnato' })], regole, OGGI);
      await new Promise((r) => setImmediate(r));
    }
  } finally { console.warn = avvisi; }
  assert.equal(tentativi, 1);
});

test('campi da scrivere sulla richiesta com\'è adesso', () => {
  const c = Q.copiaEvento(partita(), regole), spostata = Q.copiaEvento(partita({ orario: '18:00' }), regole);
  const r = richiesta({ evento: c });
  assert.deepEqual(Q.campiDaScrivere(r, { aperta: true, assegnato: '', evento: spostata, aggiornata: true }), { evento: spostata, aggiornata: true });
  assert.deepEqual(Q.campiDaScrivere(r, { aperta: false, assegnato: 'a' }), { aperta: false, assegnato: 'a' });
  // un'altra dashboard ha già scritto la stessa correzione: niente da scrivere, «aggiornata» non si sposta
  assert.equal(Q.campiDaScrivere(richiesta({ evento: spostata }), { aperta: true, assegnato: '', evento: spostata, aggiornata: true }), null);
  assert.equal(Q.campiDaScrivere(richiesta({ evento: spostata, aperta: false, assegnato: 'a' }), { aperta: false, assegnato: 'a', evento: spostata, aggiornata: true }), null);
  assert.deepEqual(Q.campiDaScrivere(richiesta({ aperta: false, assegnato: 'a' }), { aperta: false, assegnato: 'b' }), { aperta: false, assegnato: 'b' });
});

