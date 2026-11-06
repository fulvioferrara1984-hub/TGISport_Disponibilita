// Prove delle partite remote dalla piattaforma (app/partite-piattaforma.js): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
require('../app/regole.js');
require('../app/building.js');
require('../app/partite-piattaforma.js');
const R = window.DO.regole;
const P = window.DO.partitePiattaforma;

const OGGI = '2026-11-06';
const REGOLE = R.complete({ competizioni: [{ nome: 'Serie A', sport: 'Calcio', prima: 4, dopo: 2 }, { nome: 'Champions League', sport: 'Calcio' }] });
const ev = (c) => Object.assign({ id: 'p1', codice: '2627-SA-042', competizione: 'SERIE A', round: '12', data: '2026-11-20', ko: '20:45',
  squadraA: 'VENEZIA', squadraB: 'NAPOLI', stato: 'CONFIRMED', modalita: 'REMOTE', attivita: 'MD' }, c);
const pa = (c) => Object.assign({ id: 'c1', tipo: 'partita', competizione: 'Serie A', round: '12', data: '2026-11-20', orario: '20:45',
  titolo: 'Venezia-Napoli', progettoId: 'p1', stato: 'assegnato', inviata: false, operatoreId: 'o1', convocazione: '', fine: '' }, c);

test('finestra: 35 giorni compreso oggi', () => {
  assert.deepEqual(P.finestra('2026-11-06'), { da: '2026-11-06', a: '2026-12-10' });
});

test('nomeCompetizione', () => {
  assert.equal(P.nomeCompetizione(ev(), [], REGOLE), 'Serie A');
  assert.equal(P.nomeCompetizione(ev({ competizione: 'UEFA CHAMPIONS LEAGUE' }), [{ nome: 'UEFA CHAMPIONS LEAGUE', nomeDisponibilita: 'Champions League' }], REGOLE), 'Champions League');
  assert.equal(P.nomeCompetizione(ev({ competizione: 'UEFA YOUTH LEAGUE' }), [], REGOLE), '');
  const mansione = R.complete(REGOLE).competizioni.find((c) => c.mansione).nome;
  assert.equal(P.nomeCompetizione(ev({ competizione: mansione }), [], REGOLE), '');
});

test('titoloPiattaforma', () => {
  assert.equal(P.titoloPiattaforma(ev()), 'VENEZIA – NAPOLI');
  assert.equal(P.titoloPiattaforma(ev({ squadraA: '', squadraB: '' })), 'SERIE A');
});

test('partitaDa', () => {
  const p = P.partitaDa(ev(), 'Serie A', REGOLE);
  assert.equal(p.tipo, 'partita');
  assert.equal(p.competizione, 'Serie A');
  assert.equal(p.sport, 'Calcio');
  assert.equal(p.round, '12');
  assert.equal(p.data, '2026-11-20');
  assert.equal(p.orario, '20:45');
  assert.equal(p.titolo, 'VENEZIA – NAPOLI');
  assert.equal(p.progettoId, 'p1');
  assert.equal(p.convocazione, '');
  assert.equal(p.fine, '');
  assert.equal(p.note, '');
  assert.equal(p.gettone, '');
  assert.equal(p.daSostituire, false);
  assert.equal(p.convocazioneCalcolata, R.convocazione(p, REGOLE));
  assert.equal(p.fineCalcolata, R.fine(p, REGOLE));
  assert.equal(P.partitaDa(ev({ ko: '' }), 'Serie A', REGOLE).orario, '');
});

test('allineamento: KO cambiato su partita non inviata', () => {
  const a = P.allineamento(pa(), ev({ ko: '18:00' }), REGOLE, OGGI);
  assert.equal(a.campi.orario, '18:00');
  assert.equal(a.rimanda, false);
  assert.equal(a.nota, 'Dalla piattaforma: KO 20:45 → 18:00');
  assert.equal(a.campi.convocazioneCalcolata, '14:00');
  assert.ok(a.campi.fineCalcolata);
});

test('allineamento: KO cambiato su partita inviata', () => {
  const a = P.allineamento(pa({ inviata: true, stato: 'confermato' }), ev({ ko: '18:00' }), REGOLE, OGGI);
  assert.equal(a.campi.inviata, false);
  assert.equal(a.campi.stato, 'assegnato');
  assert.equal(a.campi.risposta, '');
  assert.equal(a.rimanda, true);
  assert.ok(a.nota.endsWith(': convocazione da rimandare'));
});

test('allineamento: stesso KO in un altro formato', () => {
  assert.equal(P.allineamento(pa({ orario: '08:45' }), ev({ ko: '8:45' }), REGOLE, OGGI), null);
  assert.equal(P.allineamento(pa({ orario: '20:45' }), ev({ ko: '8:45' }), REGOLE, OGGI).campi.orario, '08:45');
});

test('allineamento: KO vuoto non cancella', () => {
  assert.equal(P.allineamento(pa(), ev({ ko: '' }), REGOLE, OGGI), null);
});

test('allineamento: nomi uguali a meno di maiuscole e trattini', () => {
  assert.equal(P.allineamento(pa(), ev(), REGOLE, OGGI), null);
  const a = P.allineamento(pa({ titolo: 'Rennais-Olympiacos', inviata: true, stato: 'confermato' }), ev({ squadraA: 'STADE RENNAIS', squadraB: 'OLYMPIACOS' }), REGOLE, OGGI);
  assert.equal(a.campi.titolo, 'STADE RENNAIS – OLYMPIACOS');
  assert.equal(a.rimanda, false);
});

test('allineamento: data e round', () => {
  const a = P.allineamento(pa({ data: '2026-11-20' }), ev({ data: '2026-11-21' }), REGOLE, OGGI);
  assert.equal(a.campi.data, '2026-11-21');
  assert.match(a.nota, /data 20\/11 → 21\/11/);
  assert.equal(P.allineamento(pa(), ev({ data: '2026-11-01' }), REGOLE, OGGI), null);
  assert.equal(P.allineamento(pa(), ev({ round: '' }), REGOLE, OGGI), null);
  assert.equal(P.allineamento(pa(), ev({ round: '13' }), REGOLE, OGGI).campi.round, '13');
});

test('allineamento: ritrovo e fine scritti a mano restano', () => {
  const a = P.allineamento(pa({ convocazione: '16:00' }), ev({ ko: '18:00' }), REGOLE, OGGI);
  ['convocazione', 'fine', 'operatoreId', 'gettone', 'note', 'building'].forEach((k) => assert.ok(!(k in a.campi), k));
});

test('collegamento', () => {
  const nulla = P.collegamento(pa({ progettoId: undefined }), ev(), REGOLE, OGGI);
  assert.equal(nulla.campi.progettoId, 'p1');
  assert.equal(nulla.nota, 'Collegata alla piattaforma (2627-SA-042)');
  const ko = P.collegamento(pa(), ev({ ko: '18:00' }), REGOLE, OGGI);
  assert.equal(ko.nota, 'Collegata alla piattaforma (2627-SA-042); Dalla piattaforma: KO 20:45 → 18:00');
  assert.equal(ko.campi.orario, '18:00');
});

test('NOTE', () => {
  assert.equal(P.NOTE.creata('X'), 'Creata dalla piattaforma (X)');
  assert.equal(P.NOTE.creata(''), 'Creata dalla piattaforma');
  assert.equal(P.NOTE.annullata('evento annullato'), 'Annullata dalla piattaforma: evento annullato');
});
