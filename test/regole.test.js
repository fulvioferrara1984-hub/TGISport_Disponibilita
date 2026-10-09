// Prove dei calcoli di turno (app/regole.js): node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
require('../app/onsite.js');
require('../app/regole.js');
const R = window.DO.regole;

const regole = R.complete({
  competizioni: [
    { nome: 'Serie A', prima: 4, dopo: 2 },
    { nome: 'Champions League', uefa: true, prima: 1, dopo: 2 },
    { nome: 'Ligue 1', prima: 1, dopo: null },
  ],
});
const turno = (e) => [R.convocazione(e, regole), R.fine(e, regole)];
// competizioni vere, senza le righe fisse delle mansioni (Remote TL, Remote Support) che stanno in cima
const normali = (r) => r.competizioni.filter((c) => !c.mansione);

test('ritrovo e fine per competizione', () => {
  assert.deepEqual(turno({ competizione: 'Serie A', orario: '20:45' }), ['16:45', '22:45']);
  assert.deepEqual(turno({ competizione: 'Champions League', orario: '21:00' }), ['20:00', '23:00']);
});

test('un solo campo compilato: l\'altro usa il valore generale', () => {
  assert.deepEqual(turno({ competizione: 'Ligue 1', orario: '20:45' }), ['19:45', '22:45']);
});

test('competizione sconosciuta usa i valori generali', () => {
  assert.deepEqual(turno({ competizione: 'X', orario: '15:00' }), ['11:00', '17:00']);
});

test('valori scritti a mano vincono', () => {
  assert.deepEqual(turno({ competizione: 'Serie A', orario: '20:45', convocazione: '18:00', fine: '23:30' }), ['18:00', '23:30']);
});

test('supervisione: durata predefinita dal ritrovo', () => {
  const sup = { tipo: 'supervisione', competizione: 'Champions League', convocazione: '10:00' };
  assert.equal(R.fine(sup, regole), '16:00');
  assert.deepEqual(R.intervallo(sup, regole), { inizio: 600, fine: 960 });
  assert.equal(R.fine(Object.assign({}, sup, { fine: '13:00' }), regole), '13:00');
});

test('supervisione importata: ritrovo dall\'anticipo generale, non dalla competizione', () => {
  assert.deepEqual(turno({ tipo: 'supervisione', competizione: 'Champions League', orario: '18:00' }), ['14:00', '20:00']);
});

test('fine oltre la mezzanotte vale fine giornata nel confronto', () => {
  const tardi = { competizione: 'Serie A', orario: '22:45' };
  assert.equal(R.fine(tardi, regole), '00:45');
  assert.equal(R.intervallo(tardi, regole).fine, 1439);
});

test('sovrapposti', () => {
  const p = (orario, data = '2026-10-17') => ({ competizione: 'Serie A', orario, data });
  assert.equal(R.sovrapposti(p('15:00'), p('20:45'), regole), true);
  assert.equal(R.sovrapposti(p('12:30'), p('20:45'), regole), false);
  assert.equal(R.sovrapposti(p('15:00'), p('20:45', '2026-10-18'), regole), false);
});

test('il notturno resta calcolato sul ritrovo', () => {
  assert.equal(R.notturno({ competizione: 'Serie A', orario: '02:00' }, regole), true);
});

test('competizioni salvate senza orari: si completano con i valori usati finora', () => {
  const r = R.complete({ competizioni: [{ nome: 'Serie A', sport: 'Calcio', uefa: false }] });
  assert.equal(normali(r)[0].prima, 4);
  assert.equal(normali(r)[0].dopo, 2);
  assert.deepEqual(turno({ competizione: 'Serie A', orario: '20:45' }), ['16:45', '22:45']);
});

test('conflitto: doppio turno o turni sovrapposti nello stesso giorno', () => {
  const g = '2026-10-17';
  const partita = { competizione: 'Serie A', orario: '20:45', data: g };
  const supMattina = { tipo: 'supervisione', convocazione: '10:00', data: g };
  const supPomeriggio = { tipo: 'supervisione', convocazione: '14:00', data: g };
  assert.deepEqual(R.conflitto(partita, [], regole), { livello: '', con: [] });
  assert.equal(R.conflitto(partita, [supMattina], regole).livello, 'doppio');
  assert.equal(R.conflitto(partita, [supPomeriggio], regole).livello, 'sovrapposto');
  const due = R.conflitto(partita, [supMattina, supPomeriggio], regole);
  assert.equal(due.livello, 'sovrapposto');
  assert.equal(due.con.length, 2);
});

test('esportazione mensile: due fogli, solo presenze, annullati esclusi dalle presenze', () => {
  const ops = [{ id: 'a', nome: 'Anna Neri', ruolo: 'TL' }, { id: 'b', nome: 'Bruno Blu', ruolo: 'OP' }];
  const ev = [
    { id: '1', tipo: 'partita', competizione: 'Serie A', round: '9', sport: 'Calcio', data: '2026-10-18', titolo: 'Roma-Lazio', orario: '20:45', operatoreId: 'b', stato: 'confermato', gettone: 'maggiorato' },
    { id: '2', tipo: 'supervisione', competizione: 'Serie A', data: '2026-10-18', titolo: 'Supervisione', convocazione: '10:00', operatoreId: 'a', stato: 'confermato' },
    { id: '3', tipo: 'partita', competizione: 'Serie A', data: '2026-10-05', titolo: 'Inter-Monza', orario: '18:00', operatoreId: 'b', stato: 'annullato' },
    { id: '4', tipo: 'partita', competizione: 'Serie A', data: '2026-10-20', titolo: 'Milan-Genoa', orario: '15:00', operatoreId: 'b', stato: 'convocato' },
    { id: '5', tipo: 'partita', competizione: 'Serie A', data: '2026-11-01', titolo: 'Fuori mese', orario: '15:00', operatoreId: 'b', stato: 'confermato' },
  ];
  const { convocazioni, presenze } = R.righeMese(ev, ops, regole, '2026-10');
  assert.deepEqual(convocazioni[0], ['Data', 'Tipo', 'Competizione', 'Round', 'Sport', 'Evento', 'Orario', 'Ritrovo', 'Fine turno', 'Operatore', 'Ruolo', 'Stato']);
  assert.equal(convocazioni.length, 5);   // intestazione + 4 eventi di ottobre, annullato compreso
  assert.deepEqual(convocazioni[1], ['05/10/2026', 'Partita', 'Serie A', '', '', 'Inter-Monza', '18:00', '14:00', '20:00', 'Bruno Blu', 'Remote OP', 'Annullato']);
  assert.deepEqual(convocazioni[2], ['18/10/2026', 'Remote TL', 'Remote TL', '', '', 'Remote TL', '', '10:00', '16:00', 'Anna Neri', 'Remote TL', 'Confermato']);
  assert.deepEqual(presenze, [
    ['Operatore', 'Partite confermate', 'Remote TL confermati', 'Remote Support confermati', 'In attesa', 'Giorni on-site'],
    ['Anna Neri', 0, 1, 0, 0, 0],
    ['Bruno Blu', 1, 0, 0, 1, 0],
  ]);
  assert.equal(JSON.stringify({ convocazioni, presenze }).match(/€|[Gg]ettone|[Mm]aggiorat/), null);
});

test('modifica di una convocazione inviata: orari salvati intatti se l\'evento non cambia', () => {
  const inviata = { tipo: 'partita', competizione: 'Serie A', data: '2026-10-18', orario: '20:45', inviata: true, convocazioneCalcolata: '16:45', fineCalcolata: '22:45' };
  const nuoveRegole = R.complete({ competizioni: [{ nome: 'Serie A', prima: 3, dopo: 2 }] });
  assert.deepEqual(R.ricalcoloInvio(inviata, { note: 'solo una nota' }, nuoveRegole), { cambiato: false, calcolati: null });
  const fineAMano = R.ricalcoloInvio(inviata, { fine: '23:30' }, regole);
  assert.equal(fineAMano.cambiato, true);
  assert.deepEqual(fineAMano.calcolati, { convocazioneCalcolata: '16:45', fineCalcolata: '23:30' });
  assert.equal(R.ricalcoloInvio(inviata, { orario: '18:00' }, regole).cambiato, true);
  assert.equal(R.ricalcoloInvio(inviata, { data: '2026-10-19' }, regole).cambiato, true);
  const nonInviata = R.ricalcoloInvio(Object.assign({}, inviata, { inviata: false }), { note: 'x' }, regole);
  assert.deepEqual(nonInviata, { cambiato: false, calcolati: { convocazioneCalcolata: '16:45', fineCalcolata: '22:45' } });
  const supImportata = { tipo: 'supervisione', data: '2026-10-18', orario: '18:00', convocazione: '', inviata: true, convocazioneCalcolata: '14:00' };
  assert.equal(R.ricalcoloInvio(supImportata, { orario: '', convocazione: '14:00' }, regole).cambiato, false);
});

test('conflitto: turni rifiutati o annullati non contano', () => {
  const g = '2026-10-17';
  const partita = { competizione: 'Serie A', orario: '20:45', data: g };
  const rifiutata = { competizione: 'Serie A', orario: '20:45', data: g, stato: 'rifiutato' };
  const annullata = { competizione: 'Serie A', orario: '20:45', data: g, stato: 'annullato' };
  assert.deepEqual(R.conflitto(partita, [rifiutata, annullata], regole), { livello: '', con: [] });
});

test('numeri dalle impostazioni: vuoto o fuori limite non valgono', () => {
  assert.equal(R.numero('', { min: 0, max: 14, intero: true }), null);
  assert.equal(R.numero('3', { min: 0, max: 14, intero: true }), 3);
  assert.equal(R.numero('15', { min: 0, max: 14, intero: true }), null);
  assert.equal(R.numero('2.5', { min: 0, max: 14, intero: true }), null);
  assert.equal(R.numero('2.5', { min: 0, max: 12 }), 2.5);
  assert.equal(R.numero('-1', { min: 0, max: 12 }), null);
});

test('stato dei promemoria nelle impostazioni', () => {
  const base = { promemoriaAttivi: true, promemoriaGiorni: 3, promemoriaProgrammato: true, ultimoPromemoria: null };
  assert.equal(R.statoPromemoria({ emailSupervisori: '', emailAttive: true }, '2026-10-10'), 'Script delle email da aggiornare: i promemoria non sono ancora disponibili.');
  assert.equal(R.statoPromemoria(Object.assign({}, base, { promemoriaProgrammato: false })), 'Invio giornaliero non attivo: esegui attivaPromemoria nello script delle email.');
  assert.equal(R.statoPromemoria(base), 'Nessun promemoria ancora inviato.');
  const con = (u) => R.statoPromemoria(Object.assign({}, base, { ultimoPromemoria: Object.assign({ giorno: '2026-10-10', quando: '2026-10-10T06:14:00Z' }, u) }), '2026-10-10');
  const inizio = 'Ultimo promemoria: sab 10 ottobre alle 8:14 · ';
  assert.equal(con({ riepilogo: true, operatori: 3 }), inizio + 'riepilogo ai supervisori + 3 operatori');
  assert.equal(con({ riepilogo: true, operatori: 1 }), inizio + 'riepilogo ai supervisori + 1 operatore');
  assert.equal(con({ riepilogo: true, operatori: 0 }), inizio + 'riepilogo ai supervisori');
  assert.equal(con({ riepilogo: false, operatori: 1 }), inizio + '1 operatore');
  assert.equal(con({ riepilogo: false, operatori: 0 }), inizio + 'niente in sospeso, nessuna email');
});

test('stato dei promemoria: email non partite ed eventi senza destinatari', () => {
  const imp = (u) => ({ promemoriaAttivi: true, promemoriaGiorni: 3, promemoriaProgrammato: true, ultimoPromemoria: Object.assign({ giorno: '2026-10-10', quando: '2026-10-10T06:14:00Z' }, u) });
  const inizio = 'Ultimo promemoria: sab 10 ottobre alle 8:14 · ';
  const stato = R.statoPromemoria;
  R.statoPromemoria = (x) => stato(x, '2026-10-10');
  assert.equal(R.statoPromemoria(imp({ riepilogo: true, operatori: 2, nonInviate: 1, inSospeso: 4 })), inizio + 'riepilogo ai supervisori + 2 operatori · 1 email non partita');
  assert.equal(R.statoPromemoria(imp({ riepilogo: false, operatori: 0, nonInviate: 0, inSospeso: 3 })), inizio + '3 eventi da sistemare, nessuna email partita');
  assert.equal(R.statoPromemoria(imp({ riepilogo: false, operatori: 0, nonInviate: 2, inSospeso: 1, fallito: true })), inizio + '1 evento da sistemare, nessuna email partita · 2 email non partite');
  assert.equal(R.statoPromemoria(imp({ riepilogo: false, operatori: 0, nonInviate: 0, inSospeso: 0 })), inizio + 'niente in sospeso, nessuna email');
  R.statoPromemoria = stato;
});

test('stato dei promemoria: avviso se l\'ultimo giro è vecchio', () => {
  const imp = (campi) => Object.assign({ promemoriaAttivi: true, promemoriaGiorni: 3, promemoriaProgrammato: true,
    ultimoPromemoria: { giorno: '2026-10-10', quando: '2026-10-10T06:14:00Z', riepilogo: false, operatori: 0, inSospeso: 0 } }, campi);
  const inizio = 'Ultimo promemoria: sab 10 ottobre alle 8:14 · niente in sospeso, nessuna email';
  assert.equal(R.statoPromemoria(imp(), '2026-10-11'), inizio);
  assert.equal(R.statoPromemoria(imp(), '2026-10-13'), inizio + ' · ⚠ nessun giro da 3 giorni: controlla lo script delle email');
  assert.equal(R.statoPromemoria(imp({ promemoriaAttivi: false }), '2026-10-13'), inizio);
});

test('esportazione mensile con on-site', () => {
  const ops = [{ id: 'a', nome: 'Anna Neri', ruolo: 'OP' }, { id: 'b', nome: 'Bruno Blu', ruolo: 'OP' }];
  const dep = {
    id: 'd1', luogo: 'Roma', sport: 'Rugby', stato: 'aperta', da: '2026-10-30', a: '2026-11-02', posti: { TL: 1, OP: 1 },
    giorni: [{ data: '2026-10-30', attivita: 'Travel Day', partita: '' }, { data: '2026-10-31', attivita: 'MD', partita: 'Italia-Galles' },
      { data: '2026-11-01', attivita: 'MD+1', partita: '' }, { data: '2026-11-02', attivita: 'Travel Day', partita: '' }],
    accettatiTL: ['a'], accettatiOP: [], rifiuti: ['b'], esclusi: [],
  };
  const ottobre = R.righeMese([], ops, regole, '2026-10', [dep]);
  assert.deepEqual(ottobre.convocazioni.slice(1), [
    ['30/10/2026', 'On-site', '', '', 'Rugby', 'Travel Day · Roma', '', '', '', 'Anna Neri', 'On-site TL', 'Confermato'],
    ['31/10/2026', 'On-site', '', '', 'Rugby', 'MD · Italia-Galles · Roma', '', '', '', 'Anna Neri', 'On-site TL', 'Confermato'],
  ]);
  assert.deepEqual(ottobre.presenze, [['Operatore', 'Partite confermate', 'Remote TL confermati', 'Remote Support confermati', 'In attesa', 'Giorni on-site'], ['Anna Neri', 0, 0, 0, 0, 2]]);
  assert.equal(JSON.stringify(ottobre).match(/€|[Cc]ompens/), null);
  const annullato = R.righeMese([], ops, regole, '2026-10', [Object.assign({}, dep, { stato: 'annullata' })]);
  assert.equal(annullato.convocazioni.length, 1);
  assert.equal(annullato.presenze.length, 1);
});

test('colore delle competizioni', () => {
  const r = R.complete({ competizioni: [{ nome: 'Serie A', colore: '#FF0000' }, { nome: 'Ligue 1', colore: 'rosso' }, { nome: 'Liga' }] });
  assert.equal(normali(r)[0].colore, '#ff0000');
  assert.equal(normali(r)[1].colore, '');
  assert.equal(normali(r)[2].colore, '');
  assert.equal(R.coloreCompetizione('Serie A', r), '#ff0000');
  const auto = R.coloreCompetizione('Ligue 1', r);
  assert.ok(R.PALETTE.includes(auto));
  assert.equal(R.coloreCompetizione('Ligue 1', r), auto);
  assert.ok(R.PALETTE.includes(R.coloreCompetizione('Coppa sconosciuta', r)));
  assert.equal(R.coloreCompetizione('', r), '#94a3b8');
  assert.equal(R.PALETTE.length, 12);
});

test('stato degli eventi nel calendario', () => {
  const s = (campi) => R.statoCalendario(Object.assign({ data: '2026-10-20', operatoreId: 'a', stato: 'confermato' }, campi), '2026-10-09', 3);
  assert.equal(s({}), 'verde');
  assert.equal(s({ daSostituire: true, data: '2026-10-10' }), 'rosso');
  assert.equal(s({ stato: 'assegnato' }), 'blu');
  assert.equal(s({ stato: 'convocato' }), 'blu');
  assert.equal(s({ stato: 'da-assegnare', operatoreId: '', data: '2026-10-12' }), 'rosso');
  assert.equal(s({ stato: 'da-assegnare', operatoreId: '', data: '2026-10-13' }), 'arancione');
  assert.equal(s({ stato: 'rifiutato' }), 'arancione');
  assert.equal(s({ stato: 'annullato' }), '');
  assert.equal(s({ stato: 'da-assegnare', operatoreId: '', data: '2026-10-01' }), 'rosso');
});

test('colori automatici distinti per le competizioni principali', () => {
  const r = R.complete(null);
  const principali = ['Serie A', 'Coppa Italia', 'Supercoppa Italiana', 'Ligue 1', 'Champions League', 'Europa League', 'Conference League', 'Nations League'];
  const colori = principali.map((n) => R.coloreCompetizione(n, r));
  assert.equal(new Set(colori).size, principali.length, JSON.stringify(colori));
});

test('compenso per tipo di competizione', () => {
  const r = R.complete({ competizioni: [
    { nome: 'Serie A', compenso: 'diurno' }, { nome: 'Champions League', compenso: 'dimezzato' },
    { nome: 'Coppa', compenso: 'notturno' }, { nome: 'Finale', compenso: 'maggiorato' },
  ] });
  const piva = { contratto: 'P.IVA' };
  const g = (competizione, orario, campi) => { const x = R.gettone(Object.assign({ competizione, orario }, campi), piva, r); return [x.tipo, x.importo]; };
  assert.deepEqual(g('Serie A', '20:45'), ['diurno', 140]);
  assert.deepEqual(g('Serie A', '02:00'), ['notturno', 210]);
  assert.deepEqual(g('Champions League', '02:00'), ['dimezzato', 70]);
  assert.deepEqual(g('Coppa', '15:00'), ['notturno', 210]);
  assert.deepEqual(g('Finale', '15:00'), ['maggiorato', 210]);
  assert.deepEqual(g('Champions League', '21:00', { gettone: 'maggiorato' }), ['maggiorato', 210]);
  assert.deepEqual(g('Coppa', '15:00', { gettone: 'maggiorato' }), ['maggiorato', 210]);
  assert.deepEqual(g('Sconosciuta', '15:00'), ['diurno', 140]);
  assert.equal(R.compensoCompetizione('Champions League', r), 'dimezzato');
  assert.equal(R.compensoCompetizione('Sconosciuta', r), 'diurno');
});

test('migrazione da UEFA ½ al tipo di compenso', () => {
  const r = R.complete({ competizioni: [{ nome: 'A', uefa: true }, { nome: 'B' }, { nome: 'C', uefa: true, compenso: 'diurno' }, { nome: 'D', compenso: 'boh' }] });
  assert.deepEqual(normali(r).map((c) => c.compenso), ['dimezzato', 'diurno', 'diurno', 'diurno']);
  assert.equal(R.TIPI.dimezzato, 'Dimezzato (½ diurno)');
  assert.equal(R.TIPI.uefa, undefined);
  assert.equal(R.uefa, undefined);
  assert.equal(R.compensoCompetizione('Champions League', R.complete(null)), 'dimezzato');
});

test('nome dei ruoli remoti', () => {
  assert.equal(R.nomeRuolo('TL'), 'Remote TL');
  assert.equal(R.nomeRuolo('OP'), 'Remote OP');
  assert.equal(R.nomeRuolo(''), 'Remote OP');
  assert.equal(R.nomeRuolo('SUP'), 'Remote Support');
  assert.equal(R.nomeRuolo('boh'), 'Remote OP');
});

test('ruoli: chi può fare cosa', () => {
  const tabella = ['OP', 'SUP', 'TL'].map((ruolo) => ['partita', 'support', 'supervisione'].map((tipo) => R.puoFare(ruolo, tipo)));
  assert.deepEqual(tabella, [[true, false, false], [true, true, false], [true, true, true]]);
  assert.equal(R.sceltaOperatore('supervisione'), '— Scegli un Remote TL —');
  assert.equal(R.sceltaOperatore('support'), '— Scegli un Remote Support o Remote TL —');
  assert.equal(R.sceltaOperatore('partita'), '— Scegli operatore —');
});

test('mansione dell\'evento: colore, compenso e ore dalla riga Remote TL / Remote Support', () => {
  const piva = { contratto: 'P.IVA' };
  const vecchio = { tipo: 'supervisione', competizione: 'Champions League', convocazione: '10:00' };
  assert.equal(R.competizioneDi(vecchio), 'Remote TL');
  assert.deepEqual([R.gettone(vecchio, piva, regole).tipo, R.gettone(vecchio, piva, regole).importo], ['diurno', 140]);
  assert.equal(R.fine(vecchio, regole), '16:00');
  assert.equal(R.coloreCompetizione(R.competizioneDi(vecchio), regole), R.coloreCompetizione('Remote TL', regole));
  const support = { tipo: 'support', competizione: 'Remote Support', convocazione: '12:00' };
  assert.equal(R.competizioneDi(support), 'Remote Support');
  assert.deepEqual(turno(support), ['12:00', '18:00']);
  assert.equal(R.competizioneDi({ tipo: 'partita', competizione: 'Serie A' }), 'Serie A');
  assert.deepEqual(['partita', 'supervisione', 'support'].map(R.nomeTipo), ['Partita', 'Remote TL', 'Remote Support']);
  // compenso e durata si cambiano dalla riga della mansione
  const r = R.complete({ competizioni: [{ nome: 'Remote Support', mansione: true, compenso: 'maggiorato', dopo: 4 }] });
  assert.equal(R.gettone(support, piva, r).tipo, 'maggiorato');
  assert.equal(R.fine(support, r), '16:00');
});

test('righe mansione nelle regole', () => {
  const r = R.complete({ competizioni: [{ nome: 'Serie A' }] });
  assert.deepEqual(r.competizioni.slice(0, 2).map((c) => [c.nome, c.mansione, c.prima, c.dopo, c.compenso, c.sport]),
    [['Remote TL', true, 0, 6, 'diurno', ''], ['Remote Support', true, 0, 6, 'diurno', '']]);
  assert.deepEqual([r.competizioni[2].nome, r.competizioni[2].prima, r.competizioni[2].dopo], ['Serie A', 4, 2]);
  const lunghi = R.complete({ durataSupervisioneOre: 8 });
  assert.deepEqual(lunghi.competizioni.slice(0, 2).map((c) => c.dopo), [8, 6]);
  const salvata = R.complete({ competizioni: [{ nome: 'Remote TL', mansione: true, prima: 3, dopo: 0, compenso: 'notturno', colore: '#123456', sport: 'Calcio' }] });
  const tl = salvata.competizioni.filter((c) => c.nome === 'Remote TL');
  assert.equal(tl.length, 1);
  assert.deepEqual([tl[0].prima, tl[0].dopo, tl[0].compenso, tl[0].colore, tl[0].sport], [0, 6, 'notturno', '#123456', '']);
  assert.equal(R.complete({ competizioni: [{ nome: 'Remote TL', mansione: true, dopo: 7.5 }] }).competizioni[0].dopo, 7.5);
  assert.equal(R.complete(R.complete(null)).competizioni.filter((c) => c.mansione).length, 2);
});

test('operatori assegnabili a un evento', () => {
  const ops = [{ id: 'a', ruolo: 'TL', attivo: true }, { id: 'b', ruolo: 'SUP', attivo: true }, { id: 'c', ruolo: 'OP', attivo: true }, { id: 'd', ruolo: 'OP', attivo: false }];
  const ids = (e) => R.assegnabili(ops, e).map((o) => o.id);
  assert.deepEqual(ids({ tipo: 'supervisione' }), ['a']);
  assert.deepEqual(ids({ tipo: 'supervisione', operatoreId: 'c' }), ['a', 'c']);   // assegnato prima del cambio di ruolo
  assert.deepEqual(ids({ tipo: 'support' }), ['a', 'b']);
  assert.deepEqual(ids({ tipo: 'partita' }), ['a', 'b', 'c']);
  assert.deepEqual(ids({ tipo: 'partita', operatoreId: 'd' }), ['a', 'b', 'c', 'd']);
});

test('compatibilità con le dashboard della versione precedente: Dimezzato scritto anche come uefa', () => {
  const r = R.complete({ competizioni: [{ nome: 'Champions League', compenso: 'dimezzato' }, { nome: 'Serie A', compenso: 'notturno' }] });
  assert.deepEqual(normali(r).map((c) => c.uefa), [true, false]);
  // una dashboard vecchia che risalva { uefa } senza compenso non perde il Dimezzato
  const risalvato = R.complete({ competizioni: normali(r).map((c) => ({ nome: c.nome, uefa: c.uefa })) });
  assert.equal(normali(risalvato)[0].compenso, 'dimezzato');
});

test('riga dell\'ultimo backup', () => {
  const s = (imp) => R.statoBackup(imp);
  assert.equal(s(undefined), 'Script delle email da aggiornare: il backup non è ancora disponibile.');
  assert.equal(s({ promemoriaAttivi: true }), 'Script delle email da aggiornare: il backup non è ancora disponibile.');
  assert.equal(s({ backupAttivo: true, backupProgrammato: false }), 'Invio del venerdì non attivo: esegui attivaPromemoria nello script delle email.');
  assert.equal(s({ backupAttivo: true, backupProgrammato: true, ultimoBackup: null }), 'Nessun backup ancora inviato.');
  assert.equal(s({ backupAttivo: true, backupProgrammato: true, ultimoBackup: { quando: '2026-10-16T16:04:00.000Z', eventi: 152, deployment: 3, errore: '' } }),
    'Ultimo backup: venerdì 16 ottobre alle 18:04 · 152 eventi, 3 deployment');
  assert.equal(s({ backupAttivo: false, backupProgrammato: true, ultimoBackup: { quando: '2026-10-16T16:04:00.000Z', errore: 'Nessun indirizzo dei supervisori.' } }),
    'Ultimo backup non riuscito: Nessun indirizzo dei supervisori.');
});

test('compenso con un nome di Object.prototype vale Diurno', () => {
  const r = R.complete({ competizioni: [{ nome: 'Strana', compenso: 'toString' }, { nome: 'Remote TL', mansione: true, compenso: 'constructor' }] });
  assert.equal(r.competizioni.find((c) => c.nome === 'Strana').compenso, 'diurno');
  assert.equal(r.competizioni.find((c) => c.nome === 'Remote TL').compenso, 'diurno');
});

test('compensi: Dimezzato di giorno, Notturno di notte, Maggiorato di notte', () => {
  const r = R.complete({ competizioni: [{ nome: 'Coppa D', compenso: 'dimezzato', prima: 4, dopo: 2 }, { nome: 'Coppa N', compenso: 'notturno', prima: 4, dopo: 2 },
    { nome: 'Coppa M', compenso: 'maggiorato', prima: 4, dopo: 2 }] });
  const g = (comp, orario) => { const x = R.gettone({ competizione: comp, orario }, { contratto: 'P.IVA' }, r); return [x.tipo, x.importo]; };
  assert.deepEqual(g('Coppa D', '15:00'), ['dimezzato', 70]);
  assert.deepEqual(g('Coppa N', '02:00'), ['notturno', 210]);
  assert.deepEqual(g('Coppa M', '02:00'), ['maggiorato', 210]);
});

test('calendario: assegnato e da sostituire', () => {
  assert.equal(R.statoCalendario({ operatoreId: 'a', stato: 'assegnato', daSostituire: true, data: '2026-10-30' }, '2026-10-09', 3), 'arancione');
  assert.equal(R.statoCalendario({ operatoreId: 'a', stato: 'assegnato', daSostituire: true, data: '2026-10-10' }, '2026-10-09', 3), 'rosso');
});
