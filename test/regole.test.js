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

test('competizioni salvate senza orari restano valide', () => {
  const r = R.complete({ competizioni: [{ nome: 'Serie A', sport: 'Calcio', uefa: false }] });
  assert.equal(r.competizioni[0].prima, null);
  assert.equal(r.competizioni[0].dopo, null);
  assert.equal(r.fineOre, 2);
  assert.equal(r.durataSupervisioneOre, 6);
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
  assert.deepEqual(convocazioni[1], ['05/10/2026', 'Partita', 'Serie A', '', '', 'Inter-Monza', '18:00', '14:00', '20:00', 'Bruno Blu', 'OP', 'Annullato']);
  assert.deepEqual(convocazioni[2].slice(0, 2).concat(convocazioni[2].slice(7)), ['18/10/2026', 'Supervisione', '10:00', '16:00', 'Anna Neri', 'TL', 'Confermato']);
  assert.deepEqual(presenze, [
    ['Operatore', 'Partite confermate', 'Supervisioni confermate', 'In attesa', 'Giorni on-site'],
    ['Anna Neri', 0, 1, 0, 0],
    ['Bruno Blu', 1, 0, 1, 0],
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
  assert.deepEqual(ottobre.presenze, [['Operatore', 'Partite confermate', 'Supervisioni confermate', 'In attesa', 'Giorni on-site'], ['Anna Neri', 0, 0, 0, 2]]);
  assert.equal(JSON.stringify(ottobre).match(/€|[Cc]ompens/), null);
  const annullato = R.righeMese([], ops, regole, '2026-10', [Object.assign({}, dep, { stato: 'annullata' })]);
  assert.equal(annullato.convocazioni.length, 1);
  assert.equal(annullato.presenze.length, 1);
});

test('colore delle competizioni', () => {
  const r = R.complete({ competizioni: [{ nome: 'Serie A', colore: '#FF0000' }, { nome: 'Ligue 1', colore: 'rosso' }, { nome: 'Liga' }] });
  assert.equal(r.competizioni[0].colore, '#ff0000');
  assert.equal(r.competizioni[1].colore, '');
  assert.equal(r.competizioni[2].colore, '');
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
