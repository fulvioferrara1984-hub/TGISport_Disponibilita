// Prove del building delle convocazioni (app/building.js): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
require('../app/building.js');
const B = window.DO.building;

const OGGI = '2026-11-01';
// evento della piattaforma (collezione progetti)
const p = (campi) => Object.assign({
  id: 'p1', data: '2026-11-04', squadraA: 'VENEZIA', squadraB: 'NAPOLI', competizione: 'SERIE A',
  stato: 'CONFIRMED', modalita: 'REMOTE', building: 'T1',
}, campi);
// convocazione di Disponibilità Ops (collezione eventi)
const c = (campi) => Object.assign({
  id: 'c1', tipo: 'partita', data: '2026-11-04', titolo: 'Venezia-Napoli', competizione: 'Serie A',
  stato: 'confermato', inviata: true, building: 'T1',
}, campi);

test('normalizza: come la piattaforma (minuscole, senza accenti, solo lettere e cifre)', () => {
  assert.equal(B.normalizza('Atlético-Napoli'), 'atleticonapoli');
  assert.equal(B.normalizza('  Real  Madrid / U-19 '), 'realmadridu19');
  assert.equal(B.normalizza(''), '');
  assert.equal(B.normalizza(undefined), '');
  assert.equal(B.normalizza(null), '');
});

test('abbina: giorno e squadre', () => {
  assert.deepEqual(B.abbina(c(), [p()]), { building: 'T1', motivo: '' });
  // le squadre senza accenti sulla piattaforma, con gli accenti nel titolo
  assert.deepEqual(B.abbina(c({ titolo: 'Atlético-Napoli' }), [p({ squadraA: 'ATLETICO' })]), { building: 'T1', motivo: '' });
  // evento di un altro giorno, annullato o FlyKit: non conta
  const NON_TROVATO = { building: '', motivo: 'non trovato' };
  assert.deepEqual(B.abbina(c(), [p({ data: '2026-11-05' })]), NON_TROVATO);
  assert.deepEqual(B.abbina(c(), [p({ stato: 'CANCELLED' })]), NON_TROVATO);
  assert.deepEqual(B.abbina(c(), [p({ modalita: 'FLYKIT' })]), NON_TROVATO);
  // altre squadre, nessun evento
  assert.deepEqual(B.abbina(c(), [p({ squadraB: 'ROMA' })]), NON_TROVATO);
  assert.deepEqual(B.abbina(c(), []), NON_TROVATO);
  // l'evento c'è ma non ha building: non è un errore
  assert.deepEqual(B.abbina(c(), [p({ building: '' })]), { building: '', motivo: '' });
  assert.deepEqual(B.abbina(c(), [p({ building: undefined })]), { building: '', motivo: '' });
  // titolo vuoto: non si abbina a un evento a squadre vuote
  assert.deepEqual(B.abbina(c({ titolo: '' }), [p({ squadraA: '', squadraB: '' })]), NON_TROVATO);
  assert.deepEqual(B.abbina(c({ titolo: '-' }), [p({ squadraA: '', squadraB: '' })]), NON_TROVATO);
});

test('abbina: più eventi', () => {
  // stesso building: vale quello
  assert.deepEqual(B.abbina(c(), [p({ id: 'p1' }), p({ id: 'p2' })]), { building: 'T1', motivo: '' });
  // un evento senza building non contraddice l'altro
  assert.deepEqual(B.abbina(c(), [p({ id: 'p1', building: '' }), p({ id: 'p2', building: 'T3' })]), { building: 'T3', motivo: '' });
  // building diversi e stessa competizione: ambiguo
  assert.deepEqual(B.abbina(c(), [p({ id: 'p1' }), p({ id: 'p2', building: 'T3' })]), { building: '', motivo: 'ambiguo' });
  // building diversi, la competizione scioglie
  const due = [p({ id: 'p1', building: 'T1', competizione: 'SERIE A' }), p({ id: 'p2', building: 'T3', competizione: 'COPPA ITALIA' })];
  assert.deepEqual(B.abbina(c({ competizione: 'Serie A' }), due), { building: 'T1', motivo: '' });
  assert.deepEqual(B.abbina(c({ competizione: 'Coppa Italia' }), due), { building: 'T3', motivo: '' });
  // la competizione non è nessuna delle due, o manca: ambiguo
  assert.deepEqual(B.abbina(c({ competizione: 'Champions League' }), due), { building: '', motivo: 'ambiguo' });
  assert.deepEqual(B.abbina(c({ competizione: '' }), due), { building: '', motivo: 'ambiguo' });
  // competizione vuota da entrambe le parti: non è un'indicazione
  const vuote = [p({ id: 'p1', building: 'T1', competizione: '' }), p({ id: 'p2', building: 'T3', competizione: 'COPPA ITALIA' })];
  assert.deepEqual(B.abbina(c({ competizione: '' }), vuote), { building: '', motivo: 'ambiguo' });
  // due eventi con la stessa competizione e building diversi: la competizione non scioglie
  const stessa = [p({ id: 'p1', building: 'T1' }), p({ id: 'p2', building: 'T3' }), p({ id: 'p3', building: 'EXT', competizione: 'COPPA ITALIA' })];
  assert.deepEqual(B.abbina(c(), stessa), { building: '', motivo: 'ambiguo' });
  // due eventi della stessa competizione con lo stesso building bastano a sciogliere
  const doppio = [p({ id: 'p1', building: 'T1' }), p({ id: 'p2', building: 'T1' }), p({ id: 'p3', building: 'T3', competizione: 'COPPA ITALIA' })];
  assert.deepEqual(B.abbina(c(), doppio), { building: 'T1', motivo: '' });
  // gli eventi annullati non fanno ambiguità
  assert.deepEqual(B.abbina(c(), [p({ id: 'p1' }), p({ id: 'p2', building: 'T3', stato: 'CANCELLED' })]), { building: 'T1', motivo: '' });
});

test('giorniDaLeggere: date future delle partite assegnate, convocate o confermate', () => {
  const lista = [
    c({ id: 'a', stato: 'assegnato', data: '2026-11-04' }),
    c({ id: 'b', stato: 'confermato', data: '2026-11-04' }),
    c({ id: 'c', stato: 'convocato', data: '2026-11-02' }),
    c({ id: 'd', stato: 'da-assegnare', data: '2026-11-05' }),
    c({ id: 'e', stato: 'annullato', data: '2026-11-06' }),
    c({ id: 'f', stato: 'confermato', data: '2026-10-30' }),
    c({ id: 'g', stato: 'confermato', tipo: 'supervisione', data: '2026-11-07' }),
  ];
  assert.deepEqual(B.giorniDaLeggere(lista, OGGI), ['2026-11-02', '2026-11-04']);
  // oggi stesso conta, ieri no
  assert.deepEqual(B.giorniDaLeggere([c({ data: OGGI }), c({ data: '2026-10-31' })], OGGI), [OGGI]);
  assert.deepEqual(B.giorniDaLeggere([], OGGI), []);
  assert.deepEqual(B.giorniDaLeggere(undefined, OGGI), []);
});

test('daRimandare: building cambiato dopo l\'invio', () => {
  const evento = c({ building: 'T1' });
  assert.deepEqual(B.daRimandare([evento], [p({ building: 'T3' })], OGGI), [{ evento, vecchio: 'T1', nuovo: 'T3' }]);
  // inviata senza building e adesso c'è: si rimanda
  const senza = c({ building: '' });
  assert.deepEqual(B.daRimandare([senza], [p({ building: 'T3' })], OGGI), [{ evento: senza, vecchio: '', nuovo: 'T3' }]);
  // l'ordine dell'elenco resta quello delle convocazioni
  const e1 = c({ id: 'c1', building: 'T1' }), e2 = c({ id: 'c2', building: 'T1', titolo: 'Roma-Lazio' });
  const lista = [p({ id: 'p1', building: 'T3' }), p({ id: 'p2', squadraA: 'ROMA', squadraB: 'LAZIO', building: 'EXT' })];
  assert.deepEqual(B.daRimandare([e1, e2], lista, OGGI).map((x) => [x.evento.id, x.vecchio, x.nuovo]), [['c1', 'T1', 'T3'], ['c2', 'T1', 'EXT']]);

  const niente = (e, progetti) => assert.deepEqual(B.daRimandare([e], progetti === undefined ? [p({ building: 'T3' })] : progetti, OGGI), []);
  niente(c({ building: 'T3' }));                                  // building uguale
  niente(c(), [p({ building: '' })]);                             // evento senza building: resta quello inviato
  niente(c(), [p({ data: '2026-11-05', building: 'T3' })]);       // evento non trovato
  niente(c(), [p({ id: 'p1', building: 'T1' }), p({ id: 'p2', building: 'T3' })]);   // ambiguo
  niente(c({ inviata: false }));                                  // non ancora inviata
  niente(c({ inviata: undefined }));
  niente(c({ stato: 'annullato' }));
  niente(c({ stato: 'rifiutato' }));
  niente(c({ stato: 'assegnato' }));
  niente(c({ data: '2026-10-30' }), [p({ data: '2026-10-30', building: 'T3' })]);   // partita passata
  niente(c({ tipo: 'supervisione' }));                            // turno remoto
  niente(c({ tipo: 'support' }));
  niente((() => { const x = c(); delete x.building; return x; })());   // campo assente: tocca a daCompletare
  niente(c(), []);                                                // nessun evento della piattaforma
  assert.deepEqual(B.daRimandare([], [p()], OGGI), []);
  assert.deepEqual(B.daRimandare(undefined, undefined, OGGI), []);
});

test('daCompletare: convocazioni inviate prima della funzione', () => {
  const x = c(); delete x.building;
  assert.deepEqual(B.daCompletare([x], [p({ building: 'T1' })], OGGI), [{ evento: x, nuovo: 'T1' }]);

  const niente = (e, progetti) => assert.deepEqual(B.daCompletare([e], progetti === undefined ? [p({ building: 'T1' })] : progetti, OGGI), []);
  niente(c({ building: 'T1' }));                                  // campo presente
  niente(c({ building: '' }));                                    // presente anche se vuoto
  niente((() => { const y = c(); delete y.building; return y; })(), [p({ data: '2026-11-05' })]);      // non trovato
  niente((() => { const y = c(); delete y.building; return y; })(), [p({ building: '' })]);            // evento senza building
  niente((() => { const y = c(); delete y.building; return y; })(), [p({ id: 'p1' }), p({ id: 'p2', building: 'T3' })]);   // ambiguo
  niente((() => { const y = c({ inviata: false }); delete y.building; return y; })());
  niente((() => { const y = c({ stato: 'annullato' }); delete y.building; return y; })());
  niente((() => { const y = c({ data: '2026-10-30' }); delete y.building; return y; })(), [p({ data: '2026-10-30' })]);
  niente((() => { const y = c({ tipo: 'supervisione' }); delete y.building; return y; })());
  assert.deepEqual(B.daCompletare(undefined, undefined, OGGI), []);
});
