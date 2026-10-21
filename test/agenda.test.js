// Prove di «Aggiungi al calendario» (app/agenda.js): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
require('../app/agenda.js');
const A = window.DO.agenda;

const SITO = 'https://esempio.github.io/TGISport_Disponibilita/';
const ADESSO = new Date(Date.UTC(2026, 9, 21, 10, 0, 0));
const partita = (campi) => Object.assign({
  id: 'e1', data: '2026-10-24', orario: '20:45', convocazione: '', convocazioneCalcolata: '19:15', fine: '', fineCalcolata: '23:00',
  titolo: 'Milan-Inter', tipo: 'partita', competizione: 'Serie A', round: '8', stato: 'confermato',
}, campi);
const deployment = (campi) => Object.assign({
  id: 'd1', luogo: 'Roma', titolo: 'Six Nations', sport: 'Rugby', note: 'Hotel vicino allo stadio', stato: 'aperta',
  giorni: [{ data: '2026-11-12', attivita: 'Travel Day', partita: '' }, { data: '2026-11-13', attivita: 'MD', partita: 'Italia-Francia' }],
  da: '2026-11-12', a: '2026-11-13',
}, campi);
const righe = (testo) => testo.replace(/\r\n /g, '').split('\r\n');

test('calendario: partita confermata, dal ritrovo alla fine turno', () => {
  const ev = A.daConvocazione(partita(), SITO);
  assert.equal(ev.uid, 'convocazione-e1@tgisport-disponibilita');
  assert.equal(ev.titolo, 'TGI Sport · Milan-Inter');
  assert.equal(ev.tuttoIlGiorno, false);
  assert.equal(ev.da, '2026-10-24T19:15');
  assert.equal(ev.a, '2026-10-24T23:00');
  assert.equal(ev.url, SITO);
  assert.equal(ev.descrizione, 'Evento alle 20:45\nSerie A · giornata 8\nRitrovo 19:15 – fine turno 23:00\nLe tue convocazioni: ' + SITO);
  // ritrovo e fine scritti a mano valgono più di quelli calcolati; round non numerico com'è
  const mano = A.daConvocazione(partita({ convocazione: '19:00', fine: '23:30', round: 'Ottavi' }), SITO);
  assert.equal(mano.da, '2026-10-24T19:00');
  assert.equal(mano.a, '2026-10-24T23:30');
  assert.match(mano.descrizione, /^Evento alle 20:45\nSerie A · Ottavi\nRitrovo 19:00 – fine turno 23:30\n/);
});

test('calendario: partite di notte come nel resto del sito', () => {
  // ritrovo dopo l'orario della partita: il turno parte il giorno prima
  const notte = A.daConvocazione(partita({ data: '2026-10-25', orario: '00:30', convocazioneCalcolata: '23:00', fineCalcolata: '02:30' }), SITO);
  assert.equal(notte.da, '2026-10-24T23:00');
  assert.equal(notte.a, '2026-10-25T02:30');
  // fine turno dopo mezzanotte: finisce il giorno dopo
  const tardi = A.daConvocazione(partita({ fineCalcolata: '00:45' }), SITO);
  assert.equal(tardi.da, '2026-10-24T19:15');
  assert.equal(tardi.a, '2026-10-25T00:45');
});

test('calendario: turni remoti, senza fine turno 3 ore', () => {
  const turno = { id: 't1', data: '2026-10-24', tipo: 'supervisione', titolo: 'Remote TL', competizione: '', round: '', orario: '', convocazione: '22:30', fine: '' };
  const ev = A.daConvocazione(turno, SITO);
  assert.equal(ev.titolo, 'TGI Sport · Turno Remote TL');
  assert.equal(ev.da, '2026-10-24T22:30');
  assert.equal(ev.a, '2026-10-25T01:30');
  assert.equal(ev.descrizione, 'Inizio turno 22:30\nLe tue convocazioni: ' + SITO);
  const conFine = A.daConvocazione(Object.assign({}, turno, { tipo: 'support', convocazione: '19:00', fine: '23:00' }), SITO);
  assert.equal(conFine.titolo, 'TGI Sport · Turno Remote Support');
  assert.equal(conFine.a, '2026-10-24T23:00');
  assert.equal(conFine.descrizione, 'Turno 19:00 – 23:00\nLe tue convocazioni: ' + SITO);
  // fine uguale all'inizio: come se mancasse
  assert.equal(A.daConvocazione(Object.assign({}, turno, { fine: '22:30' }), SITO).a, '2026-10-25T01:30');
});

test('calendario: senza ritrovo né orario tutto il giorno', () => {
  const ev = A.daConvocazione(partita({ orario: '', convocazioneCalcolata: '', fineCalcolata: '' }), SITO);
  assert.equal(ev.tuttoIlGiorno, true);
  assert.equal(ev.da, '2026-10-24');
  assert.equal(ev.a, '2026-10-25');
  // solo l'orario della partita: si parte da quello
  assert.equal(A.daConvocazione(partita({ convocazioneCalcolata: '', fineCalcolata: '' }), SITO).da, '2026-10-24T20:45');
});

test('calendario: on-site di più giorni, tutto il giorno', () => {
  const ev = A.daOnsite(deployment(), 'TL', SITO);
  assert.equal(ev.uid, 'onsite-d1@tgisport-disponibilita');
  assert.equal(ev.titolo, 'TGI Sport · On-site Roma · Six Nations');
  assert.equal(ev.tuttoIlGiorno, true);
  assert.equal(ev.da, '2026-11-12');
  assert.equal(ev.a, '2026-11-14');
  assert.equal(ev.descrizione, 'Rugby · posto on-site TL\nGio 12 novembre · Travel Day\nVen 13 novembre · MD · Italia-Francia\nHotel vicino allo stadio\nLe tue convocazioni: ' + SITO);
  const semplice = A.daOnsite(deployment({ titolo: '', note: '' }), 'OP', SITO);
  assert.equal(semplice.titolo, 'TGI Sport · On-site Roma');
  assert.doesNotMatch(semplice.descrizione, /Hotel/);
});

test('file .ics: evento con orari, ora di Roma e avviso 1 ora prima', () => {
  const testo = A.ics(A.daConvocazione(partita(), SITO), ADESSO);
  assert.ok(testo.endsWith('END:VCALENDAR\r\n'));
  assert.doesNotMatch(testo.replace(/\r\n/g, ''), /[\r\n]/);
  const r = righe(testo);
  assert.equal(r[0], 'BEGIN:VCALENDAR');
  for (const riga of ['VERSION:2.0', 'PRODID:-//TGI Sport//Disponibilita Ops//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Rome', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'UID:convocazione-e1@tgisport-disponibilita', 'DTSTAMP:20261021T100000Z',
    'DTSTART;TZID=Europe/Rome:20261024T191500', 'DTEND;TZID=Europe/Rome:20261024T230000',
    'SUMMARY:TGI Sport · Milan-Inter', 'URL:' + SITO,
    'DESCRIPTION:Evento alle 20:45\\nSerie A · giornata 8\\nRitrovo 19:15 – fine turno 23:00\\nLe tue convocazioni: ' + SITO,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT1H', 'END:VALARM', 'END:VEVENT']) {
    assert.ok(r.includes(riga), 'manca ' + riga);
  }
  assert.ok(r.indexOf('END:VTIMEZONE') < r.indexOf('BEGIN:VEVENT'));
});

test('file .ics: virgole, punti e virgola e barre nel testo', () => {
  const r = righe(A.ics(A.daConvocazione(partita({ titolo: 'Roma, Lazio; derby \\ ritorno' }), SITO), ADESSO));
  assert.ok(r.includes('SUMMARY:TGI Sport · Roma\\, Lazio\\; derby \\\\ ritorno'));
});

test('file .ics: righe lunghe spezzate a 75 byte senza rompere le lettere', () => {
  const lungo = 'Società Sportiva Lazio – Associazione Calcio Fiorentina · ritorno à è ì ò ù '.repeat(3);
  const testo = A.ics(A.daConvocazione(partita({ titolo: lungo }), SITO), ADESSO);
  for (const fisica of testo.split('\r\n')) assert.ok(Buffer.byteLength(fisica, 'utf8') <= 75, fisica);
  assert.ok(righe(testo).includes('SUMMARY:TGI Sport · ' + lungo));
  assert.doesNotMatch(testo, /�/);
});

test('file .ics: on-site tutto il giorno, senza fuso né avviso', () => {
  const r = righe(A.ics(A.daOnsite(deployment(), 'TL', SITO), ADESSO));
  assert.ok(r.includes('DTSTART;VALUE=DATE:20261112'));
  assert.ok(r.includes('DTEND;VALUE=DATE:20261114'));
  assert.ok(!r.includes('BEGIN:VTIMEZONE'));
  assert.ok(!r.includes('BEGIN:VALARM'));
});

test('link di Google Calendar', () => {
  const ev = A.daConvocazione(partita(), SITO);
  const link = A.linkGoogle(ev);
  assert.ok(link.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&'));
  const p = new URL(link).searchParams;
  assert.equal(p.get('text'), 'TGI Sport · Milan-Inter');
  assert.equal(p.get('dates'), '20261024T191500/20261024T230000');
  assert.equal(p.get('ctz'), 'Europe/Rome');
  assert.equal(p.get('details'), ev.descrizione);
  const giornata = new URL(A.linkGoogle(A.daOnsite(deployment(), 'TL', SITO))).searchParams;
  assert.equal(giornata.get('dates'), '20261112/20261114');
  assert.equal(giornata.get('ctz'), null);
});

test('nome del file e riga del pannello', () => {
  assert.equal(A.nomeFile(A.daConvocazione(partita(), SITO)), 'TGI-Sport-2026-10-24.ics');
  assert.equal(A.nomeFile(A.daOnsite(deployment(), 'TL', SITO)), 'TGI-Sport-2026-11-12.ics');
  assert.equal(A.quando(A.daConvocazione(partita(), SITO)), 'Sabato 24 ottobre · 19:15 – 23:00');
  assert.equal(A.quando(A.daConvocazione(partita({ data: '2026-10-25', orario: '00:30', convocazioneCalcolata: '23:00', fineCalcolata: '02:30' }), SITO)),
    'Sabato 24 ottobre · 23:00 – 02:30 di domenica');
  assert.equal(A.quando(A.daOnsite(deployment(), 'TL', SITO)), 'Dal 12 al 13 novembre');
  assert.equal(A.quando(A.daOnsite(deployment({ giorni: [{ data: '2026-11-12', attivita: 'MD', partita: '' }], a: '2026-11-12' }), 'TL', SITO)), 'Giovedì 12 novembre');
});
