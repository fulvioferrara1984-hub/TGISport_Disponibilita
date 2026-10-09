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
