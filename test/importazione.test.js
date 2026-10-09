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
DO.dati = { importa: async (p) => { importato = p; }, salvaOperatore: async () => {} };
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
  'Note', 'Stato', 'Gettone maggiorato', 'Da sostituire', 'Tipo', 'ID evento', 'Ritrovo scritto a mano', 'Fine scritta a mano'];
const BACKUP = {
  Convocazioni: [[TITOLO], INTESTAZIONI,
    ['Serie A', '9', 'Calcio', giorno('2026-10-18'), 'Roma-Lazio', '20:45', '16:45', 'Luca Bianchi', '22:45', 'SI', 'Regia & co', 'Confermato', 'SI', '', 'Partita', 'evA', '', ''],
    ['Remote TL', '', '', giorno('2026-10-18'), 'Remote TL', '', '10:00', 'Luca Bianchi', '16:00', '', '', 'In attesa di risposta', '', '', 'Remote TL', 'evB', '10:00', ''],
    ['Remote Support', '', '', giorno('2026-10-17'), 'Remote Support', '', '12:00', '', '18:00', '', '', 'Da assegnare', '', '', 'Remote Support', 'evC', '12:00', ''],
    ['Champions League', 'MD3', 'Calcio', giorno('2026-10-21'), 'Atalanta-PSG', '21:00', '20:00', '', '23:00', '', '', 'Annullato', '', '', 'Partita', 'evD', '', ''],
    ['Serie A', '9', 'Calcio', giorno('2026-10-18'), 'Inter-Monza', '15:00', '11:00', 'Nuovo Operatore', '18:30', '', '', 'Rifiutato', '', 'SI', 'Partita', 'evE', '', '18:30']],
  Operatori: [['Nome', 'Mansione', 'Ruolo', 'Contratto', 'Email', 'Telefono', 'On-site', 'Attivo'],
    ['Luca Bianchi', 'Regia', 'Remote TL', 'P.IVA', 'luca@x.it', '+39 1', 'TL', 'SI'],
    ['Nuovo Operatore', 'Audio', 'Remote Support', 'Coop', 'nuovo@x.it', '', '', 'SI']],
  Impostazioni: [['Voce', 'Valore', '', 'Operatore', 'Contratto', '', 'Sport', '', 'Competizione / mansione', 'Compenso', 'Ore prima', 'Ore dopo', 'Colore'],
    ['Netto P.IVA diurno', 150, '', 'Luca Bianchi', 'P.IVA', '', 'Calcio', '', 'Remote TL', 'Diurno', 0, 6, ''],
    ['Netto P.IVA notturno', 220, '', 'Nuovo Operatore', 'Coop', '', 'Rugby', '', 'Remote Support', 'Notturno', 0, 5, ''],
    ['Netto P.IVA maggiorato', 230, '', '', '', '', '', '', 'Serie A', 'Diurno', 4, 2, '#a16207'],
    ['Netto Coop diurno', 175, '', '', '', '', '', '', 'Champions League', 'Dimezzato', 1, 2, ''],
    ['Netto Coop notturno', 262.5], ['Netto Coop maggiorato', 262.5], ['Tariffa on-site (€ al giorno)', 160], ['Notturno dalle', '23:00'], ['Notturno alle', '06:00']],
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
  DO.admin.eventi = [{ id: 'evA', storico: [{ quando: '2026-10-01T10:00:00Z', testo: 'Creato' }] }];
  const { p, anteprima } = await importaFogli(BACKUP);
  assert.ok(anteprima.includes('Backup del venerdì 16 ottobre: 1 eventi da aggiornare, 4 da ricreare'));
  const ev = Object.fromEntries(p.eventi.map((e) => [e.id, e]));
  assert.deepEqual(Object.keys(ev).sort(), ['evA', 'evB', 'evC', 'evD', 'evE']);
  const a = ev.evA, b = ev.evB, c = ev.evC, d = ev.evD, e = ev.evE;
  assert.deepEqual([a.tipo, a.stato, a.gettone, a.daSostituire, a.convocazione, a.convocazioneCalcolata, a.fineCalcolata, a.inviata, a.operatoreId, a.note],
    ['partita', 'confermato', 'maggiorato', false, '', '16:45', '22:45', true, 'luca', 'Regia & co']);
  assert.deepEqual(a.storico.map((s) => s.testo), ['Creato', 'Ripristinato dal backup del venerdì 16 ottobre']);
  assert.deepEqual([b.tipo, b.competizione, b.titolo, b.orario, b.convocazione, b.fineCalcolata, b.stato, b.inviata], ['supervisione', 'Remote TL', 'Remote TL', '', '10:00', '16:00', 'convocato', true]);
  assert.deepEqual([c.tipo, c.competizione, c.stato, c.operatoreId, c.inviata, c.convocazione, c.fineCalcolata], ['support', 'Remote Support', 'da-assegnare', '', false, '12:00', '17:00']);   // durata 5 dal file
  assert.deepEqual([d.stato, d.inviata, d.competizione, d.convocazioneCalcolata], ['annullato', false, 'Champions League', '20:00']);   // 1 ora prima dal file
  assert.deepEqual([e.stato, e.daSostituire, e.fine, e.inviata, e.operatoreId], ['rifiutato', true, '18:30', true, 'xls-nuovo-operatore']);
  // operatori: il nuovo con i suoi dati, quello esistente aggiornato
  assert.deepEqual(p.operatori.map((o) => [o.id, o.nome, o.ruolo, o.contratto, o.email, o.mansione, o.attivo]), [['xls-nuovo-operatore', 'Nuovo Operatore', 'SUP', 'Coop', 'nuovo@x.it', 'Audio', true]]);
  assert.deepEqual(p.esistenti.luca, { mansione: 'Regia', ruolo: 'TL', contratto: 'P.IVA', email: 'luca@x.it', telefono: '+39 1', onsite: 'TL', attivo: true });
  // impostazioni dal file
  assert.deepEqual(p.regole.tariffe['P.IVA'], { diurno: 150, notturno: 220, maggiorato: 230 });
  assert.deepEqual([p.regole.tariffaOnsite, p.regole.notteDa], [160, '23:00']);
  const comp = (n) => p.regole.competizioni.find((x) => x.nome === n);
  assert.deepEqual([comp('Remote Support').compenso, comp('Remote Support').dopo, comp('Champions League').prima, comp('Serie A').colore], ['notturno', 5, 1, '#a16207']);
  assert.ok(p.regole.sport.includes('Rugby'));
  // reimportando lo stesso file non si duplica nulla
  DO.admin.eventi = p.eventi;
  const di_nuovo = await importaFogli(BACKUP);
  assert.deepEqual(di_nuovo.p.eventi.map((x) => x.id).sort(), ['evA', 'evB', 'evC', 'evD', 'evE']);
  assert.ok(di_nuovo.anteprima.includes('5 eventi da aggiornare, 0 da ricreare'));
  DO.admin.eventi = [];
});

test('il file della stagione non entra in modalità backup', async () => {
  const p = await importa([['Serie A', '9', 'Calcio', giorno('2026-10-24'), 'Roma-Lazio', '20:45', '', '', '', '', '']]);
  assert.equal(p.eventi[0].id, 'xls-2026-10-24-roma-lazio-2045-serie-a');
  assert.ok(!elemento('imp-anteprima').innerHTML.includes('Backup del'));
});

