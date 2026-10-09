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
    titolo: 'Supervisione', tipo: 'supervisione', competizione: 'Serie A', round: '', data: '2026-10-18', orario: '', ritrovo: '10:00', fine: '16:00',
  });
  assert.equal(Q.copiaEvento({ tipo: 'supervisione', data: '2026-10-18', convocazione: '10:00' }, regole).titolo, 'Supervisione');
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
});
