// Prove del backup settimanale dello script di Google (backend/Codice.gs): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { carica, j } = require('./gs.js');

const ADESSO = new Date('2026-10-16T16:04:00Z');   // venerdì 16 ottobre, 18:04 in Italia
const REGOLE = {
  tariffe: { 'P.IVA': { diurno: 140, notturno: 210, maggiorato: 210 }, Coop: { diurno: 175, notturno: 262.5, maggiorato: 262.5 } },
  tariffaOnsite: 150, notteDa: '22:00', notteA: '06:00', anticipoOre: 4, fineOre: 2, durataSupervisioneOre: 6, sport: ['Calcio', 'Rugby'],
  competizioni: [
    { nome: 'Remote TL', mansione: true, prima: 0, dopo: 6, compenso: 'diurno', colore: '' },
    { nome: 'Serie A', sport: 'Calcio', compenso: 'diurno', prima: 4, dopo: 2, colore: '#a16207' },
    { nome: 'Champions League', sport: 'Calcio', compenso: 'dimezzato', prima: null, dopo: null },
  ],
};
const OPERATORI = [
  { id: 'c', nome: 'Carla Verdi', ruolo: 'OP', contratto: '', attivo: true },
  { id: 'a', nome: 'Anna Neri', mansione: 'Regia', ruolo: 'TL', contratto: 'P.IVA', email: 'anna@x.it', telefono: '+39 1', onsite: 'TL', attivo: true },
  { id: 'b', nome: 'Bruno Blu', mansione: '', ruolo: 'SUP', contratto: 'Coop', email: '', telefono: '', onsite: '', attivo: false },
];
const EVENTI = [
  { id: 'e1', tipo: 'partita', competizione: 'Serie A', round: '9', sport: 'Calcio', data: '2026-10-18', titolo: 'Roma-Lazio', orario: '20:45', convocazione: '',
    convocazioneCalcolata: '16:45', fine: '', fineCalcolata: '22:45', operatoreId: 'a', stato: 'confermato', gettone: 'maggiorato', note: 'Regia & co', daSostituire: false },
  { id: 'e2', tipo: 'supervisione', competizione: 'Serie A', round: '9', sport: 'Calcio', data: '2026-10-18', titolo: 'Supervisione', orario: '',
    convocazione: '10:00', convocazioneCalcolata: '10:00', fineCalcolata: '16:00', operatoreId: 'a', stato: 'convocato' },
  { id: 'e3', tipo: 'support', competizione: 'Remote Support', data: '2026-10-17', titolo: 'Remote Support', orario: '', convocazione: '12:00',
    convocazioneCalcolata: '12:00', fineCalcolata: '18:00', operatoreId: '', stato: 'da-assegnare' },
  { id: 'e4', tipo: 'partita', competizione: 'Champions League', round: 'MD3', sport: 'Calcio', data: '2026-10-21', titolo: 'Atalanta-PSG', orario: '21:00',
    convocazione: '', convocazioneCalcolata: '20:00', fineCalcolata: '23:00', operatoreId: '', stato: 'annullato' },
  { id: 'e5', tipo: 'partita', competizione: 'Serie A', round: '9', sport: 'Calcio', data: '2026-10-18', titolo: 'Inter-Monza', orario: '15:00', convocazione: '',
    convocazioneCalcolata: '11:00', fine: '18:30', fineCalcolata: '18:30', operatoreId: 'c', stato: 'rifiutato', daSostituire: true },
];
const ONSITE = [{ id: 'd1', luogo: 'Roma', sport: 'Rugby', titolo: 'Sei Nazioni', da: '2026-11-12', a: '2026-11-13', stato: 'aperta', posti: { TL: 1, OP: 2 },
  giorni: [{ data: '2026-11-12', attivita: 'Travel Day', partita: '' }, { data: '2026-11-13', attivita: 'MD', partita: 'Italia-Francia' }],
  accettatiTL: ['a'], accettatiOP: ['b', 'c'] }];
const DATI = { eventi: EVENTI, onsite: ONSITE, compensi: { d1: 300 }, operatori: OPERATORI, regole: REGOLE };
const { gs } = carica();
const righe = () => j(gs.righeBackup(DATI, ADESSO));

// ---------------------------------------------------------------- righe dei fogli

test('stagione e giorni di Excel', () => {
  assert.deepEqual(['2026-10-16', '2027-03-02', '2026-07-31', '2026-08-01'].map(gs.stagioneDa), ['2026-08-01', '2026-08-01', '2025-08-01', '2026-08-01']);
  assert.equal(gs.giornoExcel('2026-10-18'), 46313);
});

test('foglio Convocazioni', () => {
  const { titolo, convocazioni, conteggi } = righe();
  assert.equal(titolo, 'Backup eventi · Disponibilità Ops TGI Sport · venerdì 16 ottobre alle 18:04 · stagione 2026/27');
  assert.deepEqual(convocazioni[0], [titolo]);
  assert.deepEqual(convocazioni[1], ['Competizione', 'Round', 'Sport', 'Data', 'Partita / turno', 'Orario evento', 'Ritrovo', 'Operatore', 'Fine turno', 'Conferma',
    'Note', 'Stato', 'Gettone maggiorato', 'Da sostituire', 'Tipo', 'ID evento', 'Ritrovo scritto a mano', 'Fine scritta a mano']);
  const d = (iso) => ({ data: iso });
  assert.deepEqual(convocazioni.slice(2), [
    ['Remote Support', '', '', d('2026-10-17'), 'Remote Support', '', '12:00', '', '18:00', '', '', 'Da assegnare', '', '', 'Remote Support', 'e3', '12:00', ''],
    ['Remote TL', '', '', d('2026-10-18'), 'Remote TL', '', '10:00', 'Anna Neri', '16:00', '', '', 'In attesa di risposta', '', '', 'Remote TL', 'e2', '10:00', ''],
    ['Serie A', '9', 'Calcio', d('2026-10-18'), 'Inter-Monza', '15:00', '11:00', 'Carla Verdi', '18:30', '', '', 'Rifiutato', '', 'SI', 'Partita', 'e5', '', '18:30'],
    ['Serie A', '9', 'Calcio', d('2026-10-18'), 'Roma-Lazio', '20:45', '16:45', 'Anna Neri', '22:45', 'SI', 'Regia & co', 'Confermato', 'SI', '', 'Partita', 'e1', '', ''],
    ['Champions League', 'MD3', 'Calcio', d('2026-10-21'), 'Atalanta-PSG', '21:00', '20:00', '', '23:00', '', '', 'Annullato', '', '', 'Partita', 'e4', '', ''],
  ]);
  assert.deepEqual(conteggi, { eventi: 5, annullati: 1, deployment: 1 });
});

test('foglio On-site', () => {
  const { onsite } = righe();
  assert.deepEqual(onsite[0], ['Luogo', 'Sport', 'Titolo', 'Dal', 'Al', 'Giorno', 'Attività', 'Partita', 'Posti TL', 'Posti OP', 'On-site TL', 'On-site OP', 'Stato', 'Compenso']);
  assert.deepEqual(onsite.slice(1), [
    ['Roma', 'Rugby', 'Sei Nazioni', { data: '2026-11-12' }, { data: '2026-11-13' }, { data: '2026-11-12' }, 'Travel Day', '', 1, 2, 'Anna Neri', 'Bruno Blu, Carla Verdi', 'Aperta', 300],
    ['Roma', 'Rugby', 'Sei Nazioni', { data: '2026-11-12' }, { data: '2026-11-13' }, { data: '2026-11-13' }, 'MD', 'Italia-Francia', 1, 2, 'Anna Neri', 'Bruno Blu, Carla Verdi', 'Aperta', 300],
  ]);
});

test('foglio Operatori', () => {
  assert.deepEqual(righe().operatori, [
    ['Nome', 'Mansione', 'Ruolo', 'Contratto', 'Email', 'Telefono', 'On-site', 'Attivo'],
    ['Anna Neri', 'Regia', 'Remote TL', 'P.IVA', 'anna@x.it', '+39 1', 'TL', 'SI'],
    ['Bruno Blu', '', 'Remote Support', 'Coop', '', '', '', 'NO'],
    ['Carla Verdi', '', 'Remote OP', '', '', '', '', 'SI'],
  ]);
});

test('foglio Impostazioni', () => {
  const imp = righe().impostazioni;
  assert.deepEqual(imp[0], ['Voce', 'Valore', '', 'Operatore', 'Contratto', '', 'Sport', '', 'Competizione / mansione', 'Compenso', 'Ore prima', 'Ore dopo', 'Colore']);
  assert.equal(imp.length, 10);   // intestazione + 9 voci (le più lunghe delle quattro liste)
  assert.deepEqual(imp[1], ['Netto P.IVA diurno', 140, '', 'Anna Neri', 'P.IVA', '', 'Calcio', '', 'Remote TL', 'Diurno', 0, 6, '']);
  assert.deepEqual(imp[2], ['Netto P.IVA notturno', 210, '', 'Bruno Blu', 'Coop', '', 'Rugby', '', 'Remote Support', 'Diurno', 0, 6, '']);
  assert.deepEqual(imp[3], ['Netto P.IVA maggiorato', 210, '', 'Carla Verdi', '', '', '', '', 'Serie A', 'Diurno', 4, 2, '#a16207']);
  assert.deepEqual(imp[4], ['Netto Coop diurno', 175, '', '', '', '', '', '', 'Champions League', 'Dimezzato', 4, 2, '']);
  assert.deepEqual(imp.slice(5).map((r) => r.slice(0, 2)), [['Netto Coop notturno', 262.5], ['Netto Coop maggiorato', 262.5],
    ['Tariffa on-site (€ al giorno)', 150], ['Notturno dalle', '22:00'], ['Notturno alle', '06:00']]);
  // regole mai salvate: tariffe e righe mansione con i valori iniziali (Remote TL dalla vecchia durata della supervisione)
  const vuote = j(gs.righeBackup({ eventi: [], onsite: [], compensi: {}, operatori: [], regole: { durataSupervisioneOre: 8 } }, ADESSO)).impostazioni;
  assert.deepEqual(vuote[1].slice(0, 2), ['Netto P.IVA diurno', 140]);
  assert.deepEqual(vuote.slice(1, 3).map((r) => r.slice(8)), [['Remote TL', 'Diurno', 0, 8, ''], ['Remote Support', 'Diurno', 0, 6, '']]);
});
