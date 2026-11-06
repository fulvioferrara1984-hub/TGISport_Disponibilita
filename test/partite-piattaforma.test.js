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

// ---- il giro ----
const ORA = '10:00';
const COMP = [];
const giro = (c) => P.giro(Object.assign({ progetti: [], letti: {}, partite: [], competizioniPiattaforma: COMP, regole: REGOLE, oggi: OGGI, ora: ORA }, c));
const vuote = (a) => Object.keys(a).forEach((k) => assert.equal(a[k].length, 0, k));
const lib = (c) => pa(Object.assign({ progettoId: '' }, c));
const annullataDal = (testo, c) => pa(Object.assign({ stato: 'annullato', storico: [{ quando: 'x', testo: 'Creato' }, { quando: 'y', testo }] }, c));

test('giro: crea l\'evento senza partite', () => {
  const a = giro({ progetti: [ev()] });
  assert.equal(a.crea.length, 1);
  assert.equal(a.crea[0].campi.progettoId, 'p1');
  assert.equal(a.crea[0].evento.id, 'p1');
});

test('giro: bordi della finestra', () => {
  assert.equal(giro({ progetti: [ev({ data: '2026-12-10' })] }).crea.length, 1);
  assert.equal(giro({ progetti: [ev({ data: '2026-12-11' })] }).crea.length, 0);
  assert.equal(giro({ progetti: [ev({ data: '2026-11-05' })] }).crea.length, 0);
});

test('giro: esclusi', () => {
  [{ modalita: 'ON-SITE' }, { modalita: 'FLYKIT' }, { modalita: 'TBC' }, { stato: 'TBC' }, { stato: 'CANCELLED' }, { attivita: 'MD-1' }]
    .forEach((c) => vuote(giro({ progetti: [ev(c)] })));
});

test('giro: già iniziata non si crea', () => {
  assert.equal(giro({ progetti: [ev({ data: OGGI, ko: '09:00' })] }).crea.length, 0);
});

test('giro: collega per giorno e squadre', () => {
  const a = giro({ progetti: [ev()], partite: [lib({ titolo: 'Venezia - Napoli' })] });
  assert.equal(a.collega.length, 1);
  assert.equal(a.collega[0].partita.id, 'c1');
  assert.equal(a.collega[0].campi.progettoId, 'p1');
  assert.equal(a.crea.length, 0);
});

test('giro: una partita libera già iniziata oggi non si tocca e l\'evento non fa doppioni', () => {
  const iniziata = lib({ data: OGGI, orario: '09:00', inviata: true });
  vuote(giro({ progetti: [ev({ data: OGGI, ko: '20:45' })], partite: [iniziata] }));
  // se non è ancora iniziata si collega come sempre
  assert.equal(giro({ progetti: [ev({ data: OGGI, ko: '20:45' })], partite: [lib({ data: OGGI, orario: '20:45' })] }).collega.length, 1);
});

test('giro: due partite della stessa partita si collegano entrambe', () => {
  const a = giro({ progetti: [ev()], partite: [lib(), lib({ id: 'c2' })] });
  assert.equal(a.collega.length, 2);
  assert.equal(a.dubbi.length, 0);
});

test('giro: una partita collegata a un altro evento non si ricollega', () => {
  const a = giro({ progetti: [ev()], partite: [pa({ progettoId: 'p2' })], letti: {} });
  assert.equal(a.collega.length, 0);
  assert.equal(a.crea.length, 1);
});

test('giro: dubbio con nomi diversi', () => {
  const a = giro({ progetti: [ev({ squadraA: 'STADE RENNAIS', squadraB: 'OLYMPIACOS' })], partite: [lib({ titolo: 'Rennais-Olympiacos' })] });
  assert.deepEqual(a.dubbi[0].candidate.map((x) => x.id), ['c1']);
  assert.equal(a.crea.length, 0);
  assert.equal(a.collega.length, 0);
});

test('giro: due eventi sulla stessa partita libera', () => {
  const a = giro({ progetti: [ev(), ev({ id: 'p2' })], partite: [lib()] });
  assert.equal(a.dubbi.length, 2);
  assert.equal(a.collega.length, 0);
  assert.equal(a.crea.length, 0);
});

test('giro: partita con le squadre di un altro evento del giorno non è candidata', () => {
  const tbc = ev({ id: 'p2', stato: 'TBC', squadraA: 'VERONA', squadraB: 'LECCE' });
  const inter = ev({ squadraA: 'INTER', squadraB: 'MILAN' });
  const a = giro({ progetti: [tbc, inter], partite: [lib({ titolo: 'Verona-Lecce' })] });
  assert.equal(a.dubbi.length, 0);
  assert.equal(a.crea.length, 1);
  assert.equal(a.crea[0].evento.id, 'p1');
});

test('giro: competizione sconosciuta', () => {
  const a = giro({ progetti: [ev({ competizione: 'UEFA YOUTH LEAGUE' })] });
  assert.equal(a.sconosciute[0].evento.id, 'p1');
  assert.equal(a.crea.length, 0);
});

test('giro: allinea la partita collegata', () => {
  assert.equal(giro({ progetti: [ev({ ko: '18:00' })], partite: [pa()] }).allinea.length, 1);
  const a = giro({ progetti: [ev({ ko: '18:00', stato: 'TBC' })], partite: [pa()] });
  assert.equal(a.allinea.length, 1);
  assert.equal(a.allinea[0].campi.orario, '18:00');
  vuote(giro({ progetti: [ev()], partite: [pa()] }));
});

test('giro: annulla la non inviata, rivede l\'inviata', () => {
  const nonInv = giro({ progetti: [ev({ stato: 'CANCELLED' })], partite: [pa()] });
  assert.equal(nonInv.annulla[0].nota, 'Annullata dalla piattaforma: evento annullato');
  assert.equal(nonInv.annulla[0].partita.id, 'c1');
  const inv = giro({ progetti: [ev({ stato: 'CANCELLED' })], partite: [pa({ inviata: true, stato: 'convocato' })] });
  assert.equal(inv.daRivedere[0].motivo, 'annullato nella piattaforma');
  assert.equal(inv.annulla.length, 0);
  const onsite = giro({ progetti: [ev({ modalita: 'ON-SITE' })], partite: [pa()] });
  assert.equal(onsite.annulla[0].nota, 'Annullata dalla piattaforma: evento non più remoto');
  assert.equal(giro({ progetti: [ev({ modalita: 'FLYKIT' })], partite: [pa({ inviata: true })] }).daRivedere[0].motivo, 'non più remoto nella piattaforma');
  const el = giro({ letti: { p1: null }, partite: [pa()] });
  assert.equal(el.annulla[0].nota, 'Annullata dalla piattaforma: evento eliminato');
  assert.equal(el.annulla[0].partita.id, 'c1');
  assert.equal(giro({ letti: { p1: null }, partite: [pa({ inviata: true })] }).daRivedere[0].motivo, 'eliminato nella piattaforma');
  assert.equal(giro({ letti: { p1: null }, partite: [pa({ inviata: true })] }).daRivedere[0].evento, null);
  // già annullata a mano: nulla
  vuote(giro({ progetti: [ev({ stato: 'CANCELLED' })], partite: [annullataDal('Annullato')] }));
});

test('giro: lettura non riuscita non tocca nulla', () => {
  vuote(giro({ partite: [pa({ progettoId: 'p9' })] }));
  vuote(giro({ progetti: [ev({ id: 'p8', modalita: 'ON-SITE' })], letti: {}, partite: [pa({ progettoId: 'p9' })] }));
});

test('giro: ripristino solo dopo un annullamento del giro', () => {
  const dalGiro = annullataDal('Annullata dalla piattaforma: evento annullato');
  const r = giro({ progetti: [ev()], partite: [dalGiro] });
  assert.equal(r.ripristina[0].campi.stato, 'assegnato');
  assert.equal(r.ripristina[0].nota, 'Ripristinata dalla piattaforma: evento confermato di nuovo');
  assert.equal(giro({ progetti: [ev()], partite: [Object.assign({}, dalGiro, { operatoreId: '' })] }).ripristina[0].campi.stato, 'da-assegnare');
  ['Annullato', 'Modificato'].forEach((t) => vuote(giro({ progetti: [ev()], partite: [annullataDal(t)] })));
  // evento non più confermato: resta annullata
  vuote(giro({ progetti: [ev({ stato: 'TBC' })], partite: [dalGiro] }));
});

test('giro: modalità TBC → nulla', () => {
  vuote(giro({ progetti: [ev({ modalita: 'TBC', ko: '18:00' })], partite: [pa()] }));
  vuote(giro({ progetti: [ev({ modalita: 'TBC', stato: 'CANCELLED' })], partite: [pa()] }));
});

test('giro: partita già iniziata non si tocca', () => {
  const p = pa({ data: OGGI, orario: '09:30', convocazione: '09:00' });
  vuote(giro({ progetti: [ev({ data: OGGI, ko: '12:00' })], partite: [p] }));
  vuote(giro({ progetti: [ev({ data: OGGI, stato: 'CANCELLED' })], partite: [p] }));
});

test('giro: partita passata non si tocca', () => {
  vuote(giro({ progetti: [], letti: { p1: null }, partite: [pa({ data: '2026-11-01' })] }));
});

test('giro: evento in letti fuori finestra segue la partita ma non crea', () => {
  const a = giro({ letti: { p1: ev({ data: '2026-12-26' }) }, partite: [pa()] });
  assert.equal(a.allinea.length, 1);
  assert.equal(a.allinea[0].campi.data, '2026-12-26');
  assert.equal(giro({ letti: { p1: ev({ data: '2026-11-20' }) }, partite: [] }).crea.length, 0);
});

test('daRileggere', () => {
  assert.deepEqual(P.daRileggere([pa({ progettoId: 'p2' })], [], OGGI), ['p2']);
  assert.deepEqual(P.daRileggere([pa({ progettoId: 'p2' })], [ev({ id: 'p2' })], OGGI), []);
  assert.deepEqual(P.daRileggere([pa({ progettoId: 'p2', data: '2026-11-01' })], [], OGGI), []);
  assert.deepEqual(P.daRileggere([annullataDal('Annullato', { progettoId: 'p2' })], [], OGGI), []);
  assert.deepEqual(P.daRileggere([annullataDal('Annullata dalla piattaforma: evento eliminato', { progettoId: 'p2' })], [], OGGI), ['p2']);
  assert.deepEqual(P.daRileggere([pa({ progettoId: 'p2' }), pa({ id: 'c2', progettoId: 'p2' }), pa({ id: 'c3', progettoId: '' })], [], OGGI), ['p2']);
  assert.deepEqual(P.daRileggere([pa({ progettoId: 'p2', tipo: 'turno' })], [], OGGI), []);
});

test('atteso', () => {
  assert.deepEqual(P.atteso(pa({ progettoId: undefined, inviata: undefined })),
    { progettoId: '', data: '2026-11-20', titolo: 'Venezia-Napoli', orario: '20:45', inviata: false, stato: 'assegnato' });
});

test('testoAvviso', () => {
  assert.equal(P.testoAvviso({ create: 3, collegate: 2, aggiornate: 1, rimandate: 1, annullate: 1 }),
    'Dalla piattaforma: 3 partite create, 2 collegate, 1 aggiornata, 1 da rimandare, 1 annullata.');
  assert.equal(P.testoAvviso({ create: 1 }), 'Dalla piattaforma: 1 partita creata.');
  assert.equal(P.testoAvviso({ collegate: 2 }), 'Dalla piattaforma: 2 partite collegate.');
  assert.equal(P.testoAvviso({ ripristinate: 1, nonRiuscite: 2 }), 'Dalla piattaforma: 1 partita ripristinata, 2 non riuscite.');
  assert.equal(P.testoAvviso({ nonRiuscite: 1 }), 'Dalla piattaforma: 1 partita non riuscita.');
  assert.equal(P.testoAvviso({ create: 0 }), '');
  assert.equal(P.testoAvviso({}), '');
});

test('puoScrivere', () => {
  assert.equal(P.puoScrivere({ solaLettura: false, sincronizzato: true }), true);
  assert.equal(P.puoScrivere({ solaLettura: true, sincronizzato: true }), false);
  assert.equal(P.puoScrivere({ solaLettura: false, sincronizzato: false }), false);
  assert.equal(P.puoScrivere({}), false);
});

test('conScritte: sovrappone i campi scritti dal giro alle partite in memoria, senza toccare le altre', () => {
  const eventi = [{ id: 'a', orario: '20:45', stato: 'assegnato' }, { id: 'b', orario: '15:00' }];
  const v = P.conScritte(eventi, { a: { orario: '21:00', convocazioneCalcolata: '17:00' }, z: { orario: '10:00' } });
  assert.deepEqual(v, [{ id: 'a', orario: '21:00', stato: 'assegnato', convocazioneCalcolata: '17:00' }, { id: 'b', orario: '15:00' }]);
  assert.equal(eventi[0].orario, '20:45');
  assert.equal(P.conScritte(eventi, {})[1], eventi[1]);
  assert.deepEqual(P.conScritte(eventi, undefined), eventi);
});
