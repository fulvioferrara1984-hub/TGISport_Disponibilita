// Prove dell'importazione dal file Excel della stagione (app/impostazioni.js), con la pagina simulata: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// pagina minima: ogni elemento ricorda i suoi ascoltatori
global.window = {};
const ascolti = {}, elementi = {};
const elemento = (id) => elementi[id] || (elementi[id] = {
  id, hidden: false, innerHTML: '', value: '', addEventListener: (tipo, f) => { ascolti[id + ':' + tipo] = f; }, querySelectorAll: () => [], querySelector: () => null,
});
global.document = { getElementById: elemento, querySelectorAll: () => [], activeElement: null };
require('../app/comune.js');
require('../app/onsite.js');
require('../app/regole.js');
const DO = window.DO;
let importato = null;
DO.admin = { registra() {}, regole: DO.regole.complete(null), operatori: [{ id: 'luca', nome: 'Luca Bianchi', ruolo: 'OP', attivo: true }], eventi: [], disp: {}, vista: '' };
let operativoSalvato = null;
DO.dati = { importa: async (p) => { importato = p; }, salvaOperatore: async () => {}, salvaOperativo: async (o) => { operativoSalvato = o; } };
DO.avviso = () => {};
require('../app/impostazioni.js');

const giorno = (iso) => (Date.UTC(...iso.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))) / 864e5) + 25569;
async function importa(righe) {
  const fogli = {
    Impostazioni: [['Voce', 'Valore'], ['Netto P.IVA diurno', 140]],
    Convocazioni: [['Convocazioni'], ['Competizione', 'Round', 'Sport', 'Data', 'Partita', 'Orario', '', 'Operatore', '', 'Conferma', 'Note']].concat(righe),
  };
  DO.caricaXlsx = async () => ({ read: () => ({ Sheets: { Impostazioni: 'Impostazioni', Convocazioni: 'Convocazioni' } }), utils: { sheet_to_json: (ws) => fogli[ws] } });
  importato = null;
  await ascolti['imp-file:change']({ target: { files: [{ name: 'stagione.xlsx', arrayBuffer: async () => new ArrayBuffer(0) }], value: '' } });
  await ascolti['imp-anteprima:click']({ target: { id: 'imp-conferma' } });
  return importato;
}

test('importazione: turni remoti, competizione presa dalla riga sopra, chiavi stabili', async () => {
  const p = await importa([
    ['Serie A', '9', 'Calcio', giorno('2026-10-24'), 'Roma-Lazio', '20:45', '', '', '', '', ''],
    ['', '9', '', giorno('2026-10-24'), 'Supporto', '18:00', '', 'Luca Bianchi', '', 'SI', ''],
    ['', '9', '', giorno('2026-10-24'), 'Torino-Lecce', '15:00', '', '', '', '', ''],
    ['', '', '', giorno('2026-10-25'), 'Remote Support', '12:00', '', 'Nuovo Operatore', '', '', ''],
  ]);
  const [partita, tl, seconda, support] = p.eventi;
  // la riga «Supporto» senza competizione tiene la chiave di sempre (con la competizione della riga sopra)
  assert.equal(tl.id, 'xls-2026-10-24-supervisione-1800-serie-a');
  assert.deepEqual([tl.tipo, tl.competizione, tl.titolo, tl.convocazione, tl.fineCalcolata], ['supervisione', 'Remote TL', 'Remote TL', '14:00', '20:00']);
  // e la partita dopo il turno riceve ancora la competizione
  assert.equal(seconda.competizione, 'Serie A');
  assert.equal(seconda.id, 'xls-2026-10-24-torino-lecce-1500-serie-a');
  assert.equal(partita.competizione, 'Serie A');
  assert.deepEqual([support.tipo, support.competizione], ['support', 'Remote Support']);
  // ruoli: Luca da Remote OP a Remote TL; il nuovo operatore entra come Remote Support
  assert.deepEqual(p.operatori.map((o) => [o.nome, o.ruolo]), [['Nuovo Operatore', 'SUP']]);
});

// ---------------------------------------------------------------- ripristino da un backup

const TITOLO = 'Backup eventi · Disponibilità Ops TGI Sport · venerdì 16 ottobre alle 18:04 · stagione 2026/27';
const INTESTAZIONI = ['Competizione', 'Round', 'Sport', 'Data', 'Partita / turno', 'Orario evento', 'Ritrovo', 'Operatore', 'Fine turno', 'Conferma',
  'Note', 'Stato', 'Gettone maggiorato', 'Da sostituire', 'Tipo', 'ID evento', 'Ritrovo scritto a mano', 'Fine scritta a mano', 'Inviata', 'Motivo del rifiuto'];
const BACKUP = {
  Convocazioni: [[TITOLO], INTESTAZIONI,
    ['Serie A', '9', 'Calcio', giorno('2026-10-18'), 'Roma-Lazio', '20:45', '16:00', 'Luca Bianchi', '22:45', 'SI', 'Regia & co', 'Confermato', 'SI', '', 'Partita', 'evA', '', '', 'SI', ''],
    ['Remote TL', '', '', giorno('2026-10-18'), 'Remote TL', '', '10:00', 'Luca Bianchi', '16:00', '', '', 'In attesa di risposta', '', '', 'Remote TL', 'evB', '10:00', '', 'SI', ''],
    ['Remote Support', '', '', giorno('2026-10-17'), 'Remote Support', '', '12:00', '', '18:00', '', '', 'Da assegnare', '', '', 'Remote Support', 'evC', '12:00', '', '', ''],
    ['Champions League', 'MD3', 'Calcio', giorno('2026-10-21'), 'Atalanta-PSG', '21:00', '20:00', '', '23:00', '', '', 'Annullato', '', '', 'Partita', 'evD', '', '', '', ''],
    ['Serie A', '9', 'Calcio', giorno('2026-10-19'), 'Lecce-Genoa', '18:30', '14:30', 'Luca Bianchi', '20:30', '', '', 'Annullato', '', '', 'Partita', 'evF', '', '', '', ''],
    ['Serie A', '9', 'Calcio', giorno('2026-10-18'), 'Inter-Monza', '15:00', '11:00', 'Nuovo Operatore', '18:30', '', '', 'Rifiutato', '', 'SI', 'Partita', 'evE', '', '18:30', 'SI', 'Malato']],
  Operatori: [['Nome', 'Mansione', 'Ruolo', 'Contratto', 'Email', 'Telefono', 'On-site', 'Attivo'],
    ['Luca Bianchi', 'Regia', 'Remote TL', 'P.IVA', 'luca@x.it', '+39 1', 'TL', 'SI'],
    ['Nuovo Operatore', 'Audio', 'Remote Support', 'Coop', 'nuovo@x.it', '', '', 'SI'],
    ['Anna Neri', 'Regia', 'Remote TL', 'P.IVA', '', '', '', 'SI'],
    ['Carla Verdi', 'Grafica', 'Remote OP', 'Coop', 'carla@x.it', '+39 3', '', 'SI']],
  Impostazioni: [['Voce', 'Valore', '', 'Operatore', 'Contratto', '', 'Sport', '', 'Competizione / mansione', 'Compenso', 'Ore prima', 'Ore dopo', 'Colore', 'Sport della competizione'],
    ['Netto P.IVA diurno', 150, '', 'Luca Bianchi', 'P.IVA', '', 'Calcio', '', 'Remote TL', 'Diurno', 0, 6, '', ''],
    ['Netto P.IVA notturno', 220, '', 'Nuovo Operatore', 'Coop', '', 'Rugby', '', 'Remote Support', 'Notturno', 0, 5, '', ''],
    ['Netto P.IVA maggiorato', 230, '', '', '', '', 'Basket', '', 'Serie A', 'Diurno', 4, 2, '#a16207', 'Calcio'],
    ['Netto Coop diurno', 175, '', '', '', '', '', '', 'Champions League', 'Dimezzato', 1, 2, '', 'Calcio'],
    ['Netto Coop notturno', 262.5, '', '', '', '', '', '', 'Coppa X', 'Diurno', 3, 2, '', 'Basket'],
    ['Netto Coop maggiorato', 262.5], ['Tariffa on-site (€ al giorno)', 160], ['Notturno dalle', '23:00'], ['Notturno alle', '06:00']],
};
async function importaFogli(fogli) {
  DO.caricaXlsx = async () => ({ read: () => ({ Sheets: Object.fromEntries(Object.keys(fogli).map((n) => [n, n])) }), utils: { sheet_to_json: (ws) => fogli[ws] } });
  importato = null;
  await ascolti['imp-file:change']({ target: { files: [{ name: 'Backup_TGI_Sport_2026-10-16.xlsx', arrayBuffer: async () => new ArrayBuffer(0) }], value: '' } });
  const anteprima = elemento('imp-anteprima').innerHTML;
  await ascolti['imp-anteprima:click']({ target: { id: 'imp-conferma' } });
  return { p: importato, anteprima };
}

test('ripristino da un backup', async () => {
  const operatoriPrima = DO.admin.operatori;
  DO.admin.operatori = [{ id: 'luca', nome: 'Luca Bianchi', ruolo: 'OP', attivo: true },
    { id: 'anna', nome: 'Anna Neri', mansione: 'Regia', ruolo: 'TL', contratto: 'P.IVA', email: 'nuova@x.it', telefono: '', onsite: '', attivo: false },
    { id: 'carla', nome: 'Carla Verdi', mansione: 'Grafica', ruolo: 'OP', contratto: 'Coop', email: 'carla@x.it', telefono: '+39 3', onsite: '', attivo: true }];
  DO.admin.eventi = [{ id: 'evA', storico: [{ quando: '2026-10-01T10:00:00Z', testo: 'Creato' }] }];
  const { p, anteprima } = await importaFogli(BACKUP);
  assert.ok(anteprima.includes('Backup del venerdì 16 ottobre: 1 evento torna come nel backup (le modifiche fatte dopo quella data si perdono), 5 da ricreare'), anteprima);
  assert.ok(!anteprima.includes('già importati') && !anteprima.includes('risultano già inviati'));
  const ev = Object.fromEntries(p.eventi.map((e) => [e.id, e]));
  assert.deepEqual(Object.keys(ev).sort(), ['evA', 'evB', 'evC', 'evD', 'evE', 'evF']);
  const a = ev.evA, b = ev.evB, c = ev.evC, d = ev.evD, e = ev.evE, f = ev.evF;
  // evA è stata inviata: gli orari restano quelli dati all'operatore (16:00), il ritrovo resta automatico
  assert.deepEqual([a.tipo, a.stato, a.gettone, a.daSostituire, a.convocazione, a.convocazioneCalcolata, a.fineCalcolata, a.inviata, a.operatoreId, a.note],
    ['partita', 'confermato', 'maggiorato', false, '', '16:00', '22:45', true, 'luca', 'Regia & co']);
  assert.deepEqual(a.storico.map((s) => s.testo), ['Creato', 'Ripristinato dal backup del venerdì 16 ottobre']);
  assert.deepEqual([b.tipo, b.competizione, b.titolo, b.orario, b.convocazione, b.fineCalcolata, b.stato, b.inviata], ['supervisione', 'Remote TL', 'Remote TL', '', '10:00', '16:00', 'convocato', true]);
  // evC non è stata inviata: orari ricalcolati con le regole del file (durata 5)
  assert.deepEqual([c.tipo, c.competizione, c.stato, c.operatoreId, c.inviata, c.convocazione, c.fineCalcolata], ['support', 'Remote Support', 'da-assegnare', '', false, '12:00', '17:00']);
  assert.deepEqual([d.stato, d.inviata, d.competizione, d.convocazioneCalcolata], ['annullato', false, 'Champions League', '20:00']);   // 1 ora prima dal file
  assert.deepEqual([e.stato, e.daSostituire, e.fine, e.inviata, e.operatoreId, e.risposta], ['rifiutato', true, '18:30', true, 'xls-nuovo-operatore', 'Malato']);
  assert.deepEqual([f.stato, f.operatoreId, f.inviata], ['annullato', 'luca', false]);   // annullata prima di essere inviata
  // operatori: il nuovo con i suoi dati; degli esistenti cambia solo ciò che è diverso, mai con un campo vuoto
  assert.deepEqual(p.operatori.map((o) => [o.id, o.nome, o.ruolo, o.contratto, o.email, o.mansione, o.attivo]), [['xls-nuovo-operatore', 'Nuovo Operatore', 'SUP', 'Coop', 'nuovo@x.it', 'Audio', true]]);
  assert.deepEqual(p.esistenti, {
    luca: { mansione: 'Regia', ruolo: 'TL', contratto: 'P.IVA', email: 'luca@x.it', telefono: '+39 1', onsite: 'TL' },
    anna: { attivo: true },
  });
  assert.ok(anteprima.includes('<b>Anna Neri</b>: accesso riattivato'), anteprima);
  assert.ok(anteprima.includes('<b>Luca Bianchi</b>: ruolo Remote TL, mansione Regia, contratto P.IVA, email luca@x.it, telefono +39 1, on-site TL'), anteprima);
  assert.ok(!anteprima.includes('Carla Verdi'));
  // impostazioni dal file
  assert.deepEqual(p.regole.tariffe['P.IVA'], { diurno: 150, notturno: 220, maggiorato: 230 });
  assert.deepEqual([p.regole.tariffaOnsite, p.regole.notteDa], [160, '23:00']);
  const comp = (n) => p.regole.competizioni.find((x) => x.nome === n);
  assert.deepEqual([comp('Remote Support').compenso, comp('Remote Support').dopo, comp('Champions League').prima, comp('Serie A').colore, comp('Coppa X').sport], ['notturno', 5, 1, '#a16207', 'Basket']);
  assert.ok(p.regole.sport.includes('Rugby'));
  // reimportando lo stesso file non si duplica nulla
  DO.admin.eventi = p.eventi;
  const di_nuovo = await importaFogli(BACKUP);
  assert.deepEqual(di_nuovo.p.eventi.map((x) => x.id).sort(), ['evA', 'evB', 'evC', 'evD', 'evE', 'evF']);
  assert.ok(di_nuovo.anteprima.includes('6 eventi tornano come nel backup (le modifiche fatte dopo quella data si perdono), 0 da ricreare'));
  DO.admin.eventi = [];
  DO.admin.operatori = operatoriPrima;
});

// il file scritto dallo script (backend/Codice.gs) e riletto dall'importazione: le colonne devono combaciare
const { carica: caricaScript, leggiZip } = require('./gs.js');
function fogliDaXlsx(bytes) {
  const parti = leggiZip(bytes);
  const testo = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/_x([0-9A-Fa-f]{4})_/g, (x, h) => String.fromCharCode(parseInt(h, 16)));
  const colonna = (lettere) => [...lettere].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const nomi = [...parti['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => testo(m[1]));
  return Object.fromEntries(nomi.map((nome, i) => {
    const righe = [];
    for (const r of parti['xl/worksheets/sheet' + (i + 1) + '.xml'].matchAll(/<row r="(\d+)">(.*?)<\/row>/g)) {
      const riga = [];
      for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*>(.*?)<\/c>/g)) {
        const v = /<v>(.*?)<\/v>/.exec(c[2]), t = /<t[^>]*>(.*?)<\/t>/.exec(c[2]);
        riga[colonna(c[1])] = v ? Number(v[1]) : testo(t[1]);
      }
      righe[Number(r[1]) - 1] = Array.from(riga, (x) => (x === undefined ? null : x));
    }
    return [nome, Array.from(righe, (r) => r || [])];
  }));
}

test('andata e ritorno: il backup dello script si ripristina com\'era', async () => {
  const { gs } = caricaScript();
  const eventi = [
    { id: 'rt1', tipo: 'partita', competizione: 'Serie A', round: '9', sport: 'Calcio', data: '2026-10-18', titolo: 'Roma-Lazio', orario: '20:45', convocazione: '',
      convocazioneCalcolata: '16:30', fine: '23:15', fineCalcolata: '23:15', operatoreId: 'luca', stato: 'confermato', gettone: 'maggiorato', note: 'A&B «é» _x000D_', inviata: true },
    { id: 'rt2', tipo: 'support', competizione: 'Remote Support', data: '2026-10-17', titolo: 'Remote Support', orario: '', convocazione: '12:00',
      convocazioneCalcolata: '12:00', fineCalcolata: '18:00', operatoreId: '', stato: 'da-assegnare', inviata: false },
    { id: 'rt3', tipo: 'partita', competizione: 'Serie A', round: '9', sport: 'Calcio', data: '2026-10-19', titolo: 'Lecce-Genoa', orario: '18:30', convocazione: '13:00',
      convocazioneCalcolata: '13:00', fineCalcolata: '20:30', operatoreId: 'luca', stato: 'rifiutato', risposta: 'Malato', daSostituire: true, inviata: true },
  ];
  const regole = { competizioni: [{ nome: 'Serie A', sport: 'Calcio', compenso: 'diurno', prima: 4, dopo: 2 }], sport: ['Calcio'] };
  const operatori = [{ id: 'luca', nome: 'Luca Bianchi', ruolo: 'TL', contratto: 'P.IVA', email: 'luca@x.it', attivo: true }];
  const r = gs.righeBackup({ eventi, onsite: [], compensi: {}, operatori, regole }, new Date('2026-10-16T16:04:00Z'));
  const file = gs.fileBackup([{ nome: 'Convocazioni', righe: r.convocazioni }, { nome: 'On-site', righe: r.onsite },
    { nome: 'Operatori', righe: r.operatori }, { nome: 'Impostazioni', righe: r.impostazioni }], 'b.xlsx');
  const { p } = await importaFogli(fogliDaXlsx(file.getBytes()));
  const campi = ['id', 'tipo', 'competizione', 'data', 'orario', 'convocazione', 'convocazioneCalcolata', 'fine', 'fineCalcolata', 'operatoreId', 'stato', 'gettone', 'note', 'daSostituire', 'inviata', 'risposta'];
  const scegli = (e) => Object.fromEntries(campi.map((k) => [k, e[k] === undefined ? (k === 'daSostituire' || k === 'inviata' ? false : '') : e[k]]));
  assert.deepEqual(p.eventi.map(scegli).sort((x, y) => x.id.localeCompare(y.id)), eventi.map((e) => scegli(Object.assign({ gettone: '', note: '', fine: '', risposta: '', round: '' }, e))));
});

test('il file della stagione non entra in modalità backup', async () => {
  const p = await importa([['Serie A', '9', 'Calcio', giorno('2026-10-24'), 'Roma-Lazio', '20:45', '', '', '', '', '']]);
  assert.equal(p.eventi[0].id, 'xls-2026-10-24-roma-lazio-2045-serie-a');
  assert.ok(!elemento('imp-anteprima').innerHTML.includes('Backup del'));
});

test('ripristino: operatori riconosciuti per ID, reperibilità e giorni di blocco', async () => {
  const operatoriPrima = DO.admin.operatori;
  DO.admin.operatori = [{ id: 'op7', nome: 'Mario Nuovo', ruolo: 'OP', contratto: 'P.IVA', attivo: true }];
  operativoSalvato = null;
  const intestazioni = INTESTAZIONI.concat(['ID operatore']);
  const riga = (titolo, nome, idOp, id) => ['Serie A', '9', 'Calcio', giorno('2026-10-18'), titolo, '20:45', '16:45', nome, '22:45', '', '', 'Da inviare', '', '', 'Partita', id, '', '', '', '', idOp];
  const { p, anteprima } = await importaFogli({
    Convocazioni: [[TITOLO], intestazioni, riga('Roma-Lazio', 'Mario Vecchio', 'op7', 'ev1'), riga('Inter-Monza', 'Ex Operatore', 'op9', 'ev2')],
    Operatori: [['Nome', 'Mansione', 'Ruolo', 'Contratto', 'Email', 'Telefono', 'On-site', 'Attivo', 'ID'],
      ['Mario Vecchio', '', 'Remote OP', 'P.IVA', '', '', '', 'SI', 'op7'], ['Ex Operatore', '', 'Remote OP', 'Coop', '', '', '', 'SI', 'op9']],
    Impostazioni: [['Voce', 'Valore'], ['Telefono di reperibilità', '+39 333 111'], ['Giorni di blocco', 2]],
  });
  // rinominato dopo il backup: riconosciuto per ID, nessun doppione; uno che non c'è più torna con il suo ID
  assert.deepEqual(p.eventi.map((e) => [e.id, e.operatoreId]), [['ev1', 'op7'], ['ev2', 'op9']]);
  assert.deepEqual(p.operatori.map((o) => [o.id, o.nome]), [['op9', 'Ex Operatore']]);
  assert.deepEqual(p.operativo, { telefono: '+39 333 111', giorniBlocco: 2 });
  assert.ok(anteprima.includes('Regole per gli operatori: telefono di reperibilità +39 333 111, giorni di blocco 2'), anteprima);
  assert.deepEqual(operativoSalvato, { telefono: '+39 333 111', giorniBlocco: 2 });
  DO.admin.operatori = operatoriPrima;
});


test('ripristino: un telefono di reperibilità vuoto nel backup non cancella quello attuale', async () => {
  DO.admin.operativo = { telefono: '+39 02 999', giorniBlocco: 3 };
  try {
    const { p, anteprima } = await importaFogli({
      Convocazioni: [[TITOLO], INTESTAZIONI.concat(['ID operatore']), ['Serie A', '9', 'Calcio', giorno('2026-10-18'), 'Roma-Lazio', '20:45', '16:45', '', '22:45', '', '', 'Da assegnare', '', '', 'Partita', 'ev1']],
      Impostazioni: [['Voce', 'Valore'], ['Telefono di reperibilità', null], ['Giorni di blocco', 2]],
    });
    assert.deepEqual(p.operativo, { telefono: '+39 02 999', giorniBlocco: 2 });
    assert.ok(anteprima.includes('Regole per gli operatori: telefono di reperibilità +39 02 999, giorni di blocco 2'), anteprima);
  } finally { delete DO.admin.operativo; }
});

test('ripristino: due operatori con lo stesso nome tengono ciascuno i suoi dati', async () => {
  const operatoriPrima = DO.admin.operatori;
  DO.admin.operatori = [{ id: 'op1', nome: 'Mario Rossi', ruolo: 'OP', contratto: 'P.IVA', email: 'vecchia1@x.it', attivo: true },
    { id: 'op2', nome: 'Mario Rossi', ruolo: 'OP', contratto: 'P.IVA', email: 'vecchia2@x.it', attivo: true }];
  try {
    const riga = (idOp, id) => ['Serie A', '9', 'Calcio', giorno('2026-10-18'), 'Partita ' + id, '20:45', '16:45', 'Mario Rossi', '22:45', '', '', 'Da inviare', '', '', 'Partita', id, '', '', '', '', idOp];
    const { p } = await importaFogli({
      Convocazioni: [[TITOLO], INTESTAZIONI.concat(['ID operatore']), riga('op1', 'ev1'), riga('op2', 'ev2'), riga('op3', 'ev3')],
      Operatori: [['Nome', 'Mansione', 'Ruolo', 'Contratto', 'Email', 'Telefono', 'On-site', 'Attivo', 'ID'],
        ['Mario Rossi', '', 'Remote OP', 'P.IVA', 'nuova1@x.it', '', '', 'SI', 'op1'], ['Mario Rossi', '', 'Remote OP', 'P.IVA', 'nuova2@x.it', '', '', 'SI', 'op2'],
        ['Mario Rossi', '', 'Remote OP', 'Coop', 'terzo@x.it', '', '', 'SI', 'op3']],
      Impostazioni: [['Voce', 'Valore']],
    });
    assert.deepEqual(p.esistenti, { op1: { email: 'nuova1@x.it' }, op2: { email: 'nuova2@x.it' } });
    // il terzo (tolto dalla piattaforma) non finisce su uno degli altri due: torna con il suo ID
    assert.deepEqual(p.operatori.map((o) => [o.id, o.email]), [['op3', 'terzo@x.it']]);
    assert.deepEqual(p.eventi.map((e) => [e.id, e.operatoreId]), [['ev1', 'op1'], ['ev2', 'op2'], ['ev3', 'op3']]);
  } finally { DO.admin.operatori = operatoriPrima; }
});

// ---------------------------------------------------------------- blocco 9: disponibilità e on-site
const INTESTAZIONI_ONSITE = ['Luogo', 'Sport', 'Titolo', 'Dal', 'Al', 'Giorno', 'Attività', 'Partita', 'Posti TL', 'Posti OP', 'On-site TL', 'On-site OP', 'Stato', 'Compenso',
  'ID deployment', 'Note', 'Destinatari', 'Accettati TL', 'Accettati OP', 'Hanno rifiutato', 'Esclusi', 'Creato'];
const convocazioniMinime = () => [[TITOLO], INTESTAZIONI.concat(['ID operatore'])];

test('ripristino delle disponibilità: per ID, per nome, operatore ricreato, righe saltate', async () => {
  const operatoriPrima = DO.admin.operatori;
  DO.admin.operatori = [{ id: 'luca', nome: 'Luca Bianchi', ruolo: 'OP', attivo: true }, { id: 'anna', nome: 'Anna Neri', ruolo: 'TL', attivo: true }];
  try {
    const { p, anteprima } = await importaFogli({
      Convocazioni: convocazioniMinime(), Impostazioni: [['Voce', 'Valore']],
      Operatori: [['Nome', 'Mansione', 'Ruolo', 'Contratto', 'Email', 'Telefono', 'On-site', 'Attivo', 'ID'], ['Nuovo Op', '', 'Remote OP', 'Coop', '', '', '', 'SI', 'op5']],
      'Disponibilità': [['Operatore', 'Data', 'Stato', 'Nota', 'ID operatore'],
        ['Luca Bianchi', giorno('2026-10-18'), 'Disponibile', '', 'luca'],
        ['Anna Neri', giorno('2026-10-19'), 'Parziale', 'dalle 18', null],
        ['Nuovo Op', giorno('2026-10-20'), 'Non disponibile', '', 'op5'],
        ['Sparito', giorno('2026-10-21'), 'Disponibile', '', 'op99'],
        ['Luca Bianchi', 'domani', 'Disponibile', '', 'luca'],
        ['Luca Bianchi', giorno('2026-10-22'), '', 'forse', 'luca'],
        ['Luca Bianchi', giorno('2026-10-23'), 'Boh', '', 'luca'],
        [null, null, null, null, null]],
    });
    assert.deepEqual(p.disponibilitaBackup.slice().sort((a, b) => a.id.localeCompare(b.id)), [
      { id: 'anna', giorni: { '2026-10-19': { s: 'P', n: 'dalle 18' } } },
      { id: 'luca', giorni: { '2026-10-18': { s: 'D', n: '' }, '2026-10-22': { s: '', n: 'forse' } } },
      { id: 'op5', giorni: { '2026-10-20': { s: 'A', n: '' } } },
    ]);
    assert.ok(anteprima.includes('Disponibilità: 4 giorni di 3 operatori tornano come nel backup'), anteprima);
    assert.ok(anteprima.includes('3 righe saltate'), anteprima);
  } finally { DO.admin.operatori = operatoriPrima; }
});

test('ripristino degli on-site: presenti e mancanti, liste di ID controllate, compenso, gruppi saltati', async () => {
  DO.admin.onsite = [{ id: 'd1', luogo: 'Vecchio' }];
  try {
    const riga = (id, luogo, data, attivita, partita, extra) => Object.assign([luogo, 'Rugby', 'Sei Nazioni', giorno('2026-11-12'), giorno('2026-11-13'), giorno(data), attivita, partita,
      1, 2, 'Anna', 'Bruno', 'Chiusa', 300, id, 'Hotel', ' a , ,b/x, c', 'a', 'c', 'x', '', '2026-10-01T10:00:00.000Z'], extra || {});
    const { p, anteprima } = await importaFogli({
      Convocazioni: convocazioniMinime(), Impostazioni: [['Voce', 'Valore']],
      'On-site': [INTESTAZIONI_ONSITE,
        riga('d1', 'Roma', '2026-11-13', 'MD', 'Italia-Francia'), riga('d1', 'Roma', '2026-11-12', 'Travel Day', ''),
        riga('d2', 'Milano', '2026-12-01', 'MD', '', { 12: 'Annullata', 13: 'boh', 8: 0, 9: 1 }),
        riga('d3', '', '2026-12-05', 'MD', '')],
    });
    assert.deepEqual(p.onsite.map((x) => x.id), ['d1', 'd2']);
    const d1 = p.onsite[0];
    assert.deepEqual(d1, { id: 'd1', luogo: 'Roma', sport: 'Rugby', titolo: 'Sei Nazioni', note: 'Hotel',
      giorni: [{ data: '2026-11-12', attivita: 'Travel Day', partita: '' }, { data: '2026-11-13', attivita: 'MD', partita: 'Italia-Francia' }], da: '2026-11-12', a: '2026-11-13',
      posti: { TL: 1, OP: 2 }, destinatari: ['a', 'c'], accettatiTL: ['a'], accettatiOP: ['c'], rifiuti: ['x'], esclusi: [], stato: 'chiusa',
      creato: '2026-10-01T10:00:00.000Z', compenso: 300 });
    assert.deepEqual([p.onsite[1].stato, p.onsite[1].compenso, p.onsite[1].posti], ['annullata', 0, { TL: 0, OP: 1 }]);
    assert.ok(anteprima.includes('On-site: 1 deployment torna come nel backup, 1 da ricreare · 1 saltato'), anteprima);
  } finally { delete DO.admin.onsite; }
});

test('backup di una versione precedente: on-site non reimportati, disponibilità assenti', async () => {
  const { p, anteprima } = await importaFogli({
    Convocazioni: convocazioniMinime(), Impostazioni: [['Voce', 'Valore']],
    'On-site': [INTESTAZIONI_ONSITE.slice(0, 14), ['Roma', 'Rugby', '', giorno('2026-11-12'), giorno('2026-11-12'), giorno('2026-11-12'), 'MD', '', 1, 0, '', '', 'Aperta', 0]],
  });
  assert.deepEqual([p.onsite, p.disponibilitaBackup], [[], []]);
  assert.ok(anteprima.includes('I deployment on-site di questo backup non si reimportano (versione precedente)'), anteprima);
  assert.ok(!anteprima.includes('Disponibilità:'));
});

test('andata e ritorno: disponibilità e on-site dal backup dello script', async () => {
  const { gs } = caricaScript();
  const operatori = [{ id: 'luca', nome: 'Luca Bianchi', ruolo: 'TL', contratto: 'P.IVA', attivo: true }];
  const onsite = [{ id: 'd7', luogo: 'Torino', sport: 'Calcio', titolo: 'Finale', note: 'A&B', da: '2026-11-20', a: '2026-11-21', stato: 'aperta', posti: { TL: 1, OP: 0 },
    giorni: [{ data: '2026-11-20', attivita: 'MD-1', partita: '' }, { data: '2026-11-21', attivita: 'MD', partita: 'Juve-Toro' }],
    destinatari: ['luca'], accettatiTL: ['luca'], accettatiOP: [], rifiuti: [], esclusi: [], creato: '2026-10-02T09:00:00.000Z' }];
  const disponibilita = [{ id: 'luca', giorni: { '2026-10-18': { s: 'P', n: 'dalle 18 «é»' }, '2026-10-19': { s: 'A', n: '' } } }];
  const r = gs.righeBackup({ eventi: [], onsite, compensi: { d7: 250 }, operatori, regole: {}, disponibilita }, new Date('2026-10-16T16:04:00Z'));
  const file = gs.fileBackup([{ nome: 'Convocazioni', righe: r.convocazioni }, { nome: 'On-site', righe: r.onsite }, { nome: 'Operatori', righe: r.operatori },
    { nome: 'Impostazioni', righe: r.impostazioni }, { nome: 'Disponibilità', righe: r.disponibilita }], 'b.xlsx');
  const { p } = await importaFogli(fogliDaXlsx(file.getBytes()));
  assert.deepEqual(p.disponibilitaBackup, disponibilita);
  assert.deepEqual(p.onsite, [Object.assign({}, onsite[0], { compenso: 250 })]);
});
