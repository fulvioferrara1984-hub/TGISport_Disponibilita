// Prove dei calcoli on-site (app/onsite.js): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
require('../app/onsite.js');
const O = window.DO.onsite;

const OGGI = '2026-10-09';
const dep = (campi) => Object.assign({
  id: 'd1', titolo: '', luogo: 'Roma', sport: 'Rugby', note: '', stato: 'aperta',
  giorni: [{ data: '2026-10-12', attivita: 'Travel Day', partita: '' }, { data: '2026-10-13', attivita: 'MD', partita: 'Italia-Francia' }],
  da: '2026-10-12', a: '2026-10-13', posti: { TL: 1, OP: 2 },
  destinatari: ['a', 'b', 'c', 'd'], accettatiTL: [], accettatiOP: [], rifiuti: [], esclusi: [],
}, campi);

test('attività proposte', () => {
  assert.deepEqual(O.attivitaProposte(0), []);
  assert.deepEqual(O.attivitaProposte(1), ['MD']);
  assert.deepEqual(O.attivitaProposte(2), ['MD', 'Travel Day']);
  assert.deepEqual(O.attivitaProposte(3), ['Travel Day', 'MD', 'Travel Day']);
  assert.deepEqual(O.attivitaProposte(4), ['Travel Day', 'MD-1', 'MD', 'Travel Day']);
  assert.deepEqual(O.attivitaProposte(5), ['Travel Day', 'MD-2', 'MD-1', 'MD', 'Travel Day']);
});

test('giorni consecutivi', () => {
  assert.deepEqual(O.giorniDa('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(O.giorniDa('2026-10-12', '2026-10-11'), []);
});

test('normalizza: giorni ordinati e senza doppioni, testi tagliati', () => {
  const n = O.normalizza({
    titolo: ' Sei Nazioni ', luogo: ' Roma ', sport: 'Rugby', note: 'x'.repeat(600),
    giorni: [{ data: '2026-10-13', attivita: 'MD', partita: 'Italia-Francia' }, { data: '2026-10-12', attivita: 'Travel Day' }, { data: '2026-10-13', attivita: 'MD-1' }],
    posti: { TL: '1', OP: 2 },
  }, OGGI);
  assert.deepEqual(n.giorni, [{ data: '2026-10-12', attivita: 'Travel Day', partita: '' }, { data: '2026-10-13', attivita: 'MD', partita: 'Italia-Francia' }]);
  assert.deepEqual([n.titolo, n.luogo, n.da, n.a, n.note.length], ['Sei Nazioni', 'Roma', '2026-10-12', '2026-10-13', 500]);
  assert.deepEqual(n.posti, { TL: 1, OP: 2 });
});

test('normalizza: messaggi d\'errore', () => {
  const base = { luogo: 'Roma', sport: 'Rugby', giorni: [{ data: '2026-10-12', attivita: 'MD' }], posti: { TL: 1, OP: 0 } };
  const errore = (campi, messaggio) => assert.throws(() => O.normalizza(Object.assign({}, base, campi), OGGI), { message: messaggio });
  errore({ giorni: [] }, 'Scegli almeno un giorno.');
  errore({ giorni: O.giorniDa('2026-11-01', '2026-12-02').map((data) => ({ data, attivita: 'MD' })) }, 'Al massimo 31 giorni.');
  errore({ giorni: [{ data: OGGI, attivita: 'MD' }] }, 'Il deployment deve iniziare da domani in poi.');
  errore({ giorni: [{ data: '2026-10-12', attivita: ' ' }] }, 'Indica l\'attività di ogni giorno.');
  errore({ luogo: ' ' }, 'Scrivi il luogo.');
  errore({ sport: '' }, 'Scrivi lo sport.');
  errore({ posti: { TL: 1.5, OP: 0 } }, 'I posti vanno da 0 a 20.');
  errore({ posti: { TL: 21, OP: 0 } }, 'I posti vanno da 0 a 20.');
  errore({ posti: { TL: 0, OP: 0 } }, 'Indica almeno un posto.');
});

test('compenso proposto', () => {
  assert.equal(O.compensoProposto(4, 150), 600);
  assert.equal(O.compensoProposto(3, 133.333), 400);
});

test('posti liberi ed etichetta', () => {
  const d = dep({ accettatiTL: ['a'], accettatiOP: ['b'] });
  assert.deepEqual(O.postiLiberi(d), { TL: 0, OP: 1 });
  assert.equal(O.etichettaPosti(d), 'TL 1/1 · OP 1/2');
  assert.equal(O.etichettaPosti(dep({ accettatiTL: ['a'], accettatiOP: ['b', 'c'] })), 'TL 1/1 · OP 2/2 · completo');
  assert.equal(O.etichettaPosti(dep({ posti: { TL: 0, OP: 2 } })), 'OP 0/2');
  assert.deepEqual(O.postiLiberi({ posti: { TL: 1, OP: 1 } }), { TL: 1, OP: 1 });
});

test('ruolo accettato', () => {
  const d = dep({ accettatiTL: ['a'], accettatiOP: ['b'] });
  assert.deepEqual([O.ruoloAccettato(d, 'a'), O.ruoloAccettato(d, 'b'), O.ruoloAccettato(d, 'c')], ['TL', 'OP', '']);
});

test('giorni on-site di un operatore', () => {
  const d = dep({ accettatiOP: ['b'] });
  assert.deepEqual(O.giorniOnsite([d], 'b'), {
    '2026-10-12': { id: 'd1', luogo: 'Roma', sport: 'Rugby', attivita: 'Travel Day', partita: '', ruolo: 'OP' },
    '2026-10-13': { id: 'd1', luogo: 'Roma', sport: 'Rugby', attivita: 'MD', partita: 'Italia-Francia', ruolo: 'OP' },
  });
  assert.deepEqual(O.giorniOnsite([dep({ accettatiOP: ['b'], stato: 'annullata' })], 'b'), {});
  assert.deepEqual(O.giorniOnsite([d], 'c'), {});
});

test('convocazioni remote che bloccano l\'accettazione', () => {
  const d = dep({ giorni: O.giorniDa('2026-10-12', '2026-10-15').map((data) => ({ data, attivita: 'MD', partita: '' })), a: '2026-10-15' });
  const eventi = [
    { data: '2026-10-13', stato: 'confermato' }, { data: '2026-10-12', stato: 'convocato' }, { data: '2026-10-12', stato: 'confermato' },
    { data: '2026-10-14', stato: 'rifiutato' }, { data: '2026-10-15', stato: 'annullato' }, { data: '2026-10-16', stato: 'confermato' },
    { data: '2026-10-15', stato: 'assegnato' },
  ];
  assert.deepEqual(O.conflittiRemoti(d, eventi), ['2026-10-12', '2026-10-13']);
  assert.deepEqual(O.conflittiRemoti(d, eventi, ['assegnato', 'convocato', 'confermato']), ['2026-10-12', '2026-10-13', '2026-10-15']);
});

test('stato della richiesta per l\'operatore', () => {
  const op = (id, onsite) => ({ id, onsite });
  const s = (campi, o, oggi = OGGI) => O.statoPerOperatore(dep(campi), o, oggi);
  assert.equal(s({ accettatiTL: ['a'] }, op('a', 'TL')), 'accettato');
  assert.equal(s({ accettatiTL: ['a'], stato: 'annullata' }, op('a', 'TL')), 'annullato');
  assert.equal(s({ esclusi: ['a'] }, op('a', 'TL')), 'escluso');
  assert.equal(s({ stato: 'chiusa' }, op('a', 'TL')), 'scaduta');
  assert.equal(s({}, op('a', 'TL'), '2026-10-12'), 'scaduta');
  assert.equal(s({}, op('a', '')), 'non-abilitato');
  assert.equal(s({ posti: { TL: 1, OP: 0 } }, op('a', 'OP')), 'non-abilitato');   // abilitazione cambiata da TL a OP
  assert.equal(s({ accettatiTL: ['z'] }, op('a', 'TL')), 'esaurito');
  assert.equal(s({ accettatiTL: ['z'] }, op('b', 'OP')), 'da-rispondere');      // TL finiti, OP ancora liberi
  assert.equal(s({ rifiuti: ['a'] }, op('a', 'TL')), 'rifiutato');
  assert.equal(s({ rifiuti: ['a'], accettatiTL: ['z'] }, op('a', 'TL')), 'esaurito');
  assert.equal(s({}, op('a', 'TL')), 'da-rispondere');
});

test('quote del compenso per mese', () => {
  const giorni = (lista) => dep({ giorni: lista.map((data) => ({ data, attivita: 'MD', partita: '' })), da: lista[0], a: lista[lista.length - 1] });
  assert.deepEqual(O.quoteMese(giorni(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']), 600), { '2026-10': 300, '2026-11': 300 });
  assert.deepEqual(O.quoteMese(giorni(['2026-10-31', '2026-11-01', '2026-11-02']), 100), { '2026-10': 33.33, '2026-11': 66.67 });
  assert.deepEqual(O.quoteMese(giorni(['2026-10-12', '2026-10-13']), 0), { '2026-10': 0 });
});

test('periodo breve', () => {
  assert.equal(O.periodoBreve('2026-10-12', '2026-10-12'), '12 ottobre');
  assert.equal(O.periodoBreve('2026-10-12', '2026-10-15'), '12–15 ottobre');
  assert.equal(O.periodoBreve('2026-10-30', '2026-11-02'), '30 ottobre – 2 novembre');
});

test('compenso valido', () => {
  assert.equal(O.compensoValido('600'), 600);
  assert.equal(O.compensoValido(12.5), 12.5);
  assert.equal(O.compensoValido(0), 0);
  ['', null, -1, 'abc'].forEach((v) => assert.throws(() => O.compensoValido(v), { message: 'Compenso non valido.' }, String(v)));
});

test('modifiche del supervisore', () => {
  const d = dep({ accettatiOP: ['b', 'c'], destinatari: ['a', 'b', 'c'] });
  assert.deepEqual(O.modifiche(d, { titolo: ' Finale ', note: 'n', destinatariAggiunti: ['c', 'e'] }), { titolo: 'Finale', note: 'n', destinatari: ['a', 'b', 'c', 'e'] });
  assert.deepEqual(O.modifiche(d, { posti: { TL: 0, OP: '3' }, luogo: ' Milano ' }), { posti: { TL: 0, OP: 3 }, luogo: 'Milano' });
  assert.throws(() => O.modifiche(d, { posti: { TL: 1, OP: 1 } }), { message: 'I posti non possono essere meno di chi ha già accettato.' });
  assert.throws(() => O.modifiche(d, { posti: { TL: 0, OP: 0 } }), { message: 'Indica almeno un posto.' });
  assert.throws(() => O.modifiche(d, { posti: { TL: -1, OP: 2 } }), { message: 'I posti vanno da 0 a 20.' });
  assert.throws(() => O.modifiche(d, { luogo: '' }), { message: 'Scrivi il luogo.' });
  assert.throws(() => O.modifiche(d, { sport: ' ' }), { message: 'Scrivi lo sport.' });
});

test('messaggi per chi non può accettare', () => {
  assert.equal(O.MESSAGGI.esaurito, 'Posti esauriti');
  assert.equal(O.MESSAGGI['non-abilitato'], 'Questa richiesta non ha posti per la tua abilitazione on-site.');
  assert.equal(O.MESSAGGI.escluso, 'Il supervisore ti ha tolto da questo deployment.');
  ['accettato', 'annullato', 'scaduta', 'non-abilitato'].forEach((k) => assert.ok(O.MESSAGGI[k], k));
});

test('conflitti con altri deployment on-site già accettati', () => {
  const primo = dep({ id: 'd1', accettatiOP: ['a'] });
  const secondo = dep({ id: 'd2', giorni: [{ data: '2026-10-13', attivita: 'MD', partita: '' }, { data: '2026-10-14', attivita: 'Travel Day', partita: '' }], da: '2026-10-13', a: '2026-10-14' });
  assert.deepEqual(O.conflittiOnsite(secondo, [primo, secondo], 'a'), ['2026-10-13']);
  assert.deepEqual(O.conflittiOnsite(secondo, [Object.assign({}, primo, { stato: 'annullata' }), secondo], 'a'), []);
  assert.deepEqual(O.conflittiOnsite(primo, [primo, secondo], 'a'), []);          // il deployment stesso non conta
  assert.deepEqual(O.conflittiOnsite(secondo, [primo, secondo], 'b'), []);
});
