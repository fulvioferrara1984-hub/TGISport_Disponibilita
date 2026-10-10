// Prove della finestra di blocco (app/comune.js): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
const DO = window.DO;

test('lunedì bloccato da venerdì (N = 3)', () => {
  assert.equal(DO.bloccato('2026-10-12', '2026-10-09', 3), true);
  assert.equal(DO.bloccato('2026-10-13', '2026-10-09', 3), false);
  assert.equal(DO.bloccato('2026-10-12', '2026-10-08', 3), false);
});

test('oggi e i giorni passati sono bloccati', () => {
  assert.equal(DO.bloccato('2026-10-09', '2026-10-09', 3), true);
  assert.equal(DO.bloccato('2026-10-01', '2026-10-09', 3), true);
});

test('N = 0 blocca solo oggi', () => {
  assert.equal(DO.bloccato('2026-10-09', '2026-10-09', 0), true);
  assert.equal(DO.bloccato('2026-10-10', '2026-10-09', 0), false);
});

test('il cambio dell\'ora legale non sposta il conteggio', () => {
  assert.equal(DO.giorniA('2026-10-26', '2026-10-24'), 2);
  assert.equal(DO.giorniA('2026-10-01', '2026-10-09'), -8);
});

test('regole operative predefinite', () => {
  assert.deepEqual(DO.OPERATIVO_PREDEFINITO, { telefono: '', giorniBlocco: 3 });
});

test('tasti della convocazione secondo stato e finestra di blocco (spec §2)', () => {
  const az = (stato, bloccato) => DO.azioniConvocazione(stato, bloccato);
  assert.deepEqual(az('convocato', false), { azioni: ['rifiuta', 'conferma'], spiegazione: false });
  assert.deepEqual(az('convocato', true), { azioni: ['telefona', 'conferma'], spiegazione: true });
  assert.deepEqual(az('confermato', false), { azioni: ['telefona'], spiegazione: false });
  assert.deepEqual(az('confermato', true), { azioni: ['telefona'], spiegazione: false });
  assert.deepEqual(az('rifiutato', false), { azioni: ['riconferma'], spiegazione: false });
  assert.deepEqual(az('rifiutato', true), { azioni: [], spiegazione: false });
  assert.deepEqual(az('annullato', false), { azioni: [], spiegazione: false });
});

test('inizio settimana martedì (scheda Convocazioni)', () => {
  assert.equal(DO.martedi('2026-10-12'), '2026-10-06');   // lunedì → martedì prima
  assert.equal(DO.martedi('2026-10-13'), '2026-10-13');   // martedì → sé stesso
  assert.equal(DO.martedi('2026-10-11'), '2026-10-06');   // domenica
  assert.equal(DO.martedi('2027-01-04'), '2026-12-29');   // a cavallo d'anno
  assert.equal(DO.martedi('2026-10-26'), '2026-10-20');   // dopo il cambio d'ora
});

test('griglia del mese: settimane da lunedì a domenica', () => {
  const ottobre = DO.grigliaMese('2026-10');
  assert.equal(ottobre.length, 5);
  assert.ok(ottobre.every((s) => s.length === 7));
  assert.deepEqual(ottobre[0][0], { data: '2026-09-28', delMese: false });
  assert.deepEqual(ottobre[0][3], { data: '2026-10-01', delMese: true });
  assert.deepEqual(ottobre[4][6], { data: '2026-11-01', delMese: false });
  const marzo = DO.grigliaMese('2026-03');
  assert.deepEqual([marzo.length, marzo[0][0].data, marzo[5][6].data], [6, '2026-02-23', '2026-04-05']);
  const febbraio = DO.grigliaMese('2027-02');
  assert.deepEqual([febbraio.length, febbraio[0][0].data, febbraio[3][6].data], [4, '2027-02-01', '2027-02-28']);
  assert.ok(febbraio.flat().every((g) => g.delMese));
});

test('giorno di riferimento del calendario: oggi se è nella settimana mostrata', () => {
  assert.equal(DO.giornoDiRiferimento('2026-09-29', '2026-10-02'), '2026-10-02');
  assert.equal(DO.giornoDiRiferimento('2026-10-06', '2026-10-02'), '2026-10-06');
  assert.equal(DO.giornoDiRiferimento('2026-09-22', '2026-10-02'), '2026-09-22');
});

test('indirizzo mailto con oggetto e testo', () => {
  assert.equal(DO.mailto('m@x.it', 'Oggetto è', "Ciao Nicolò, l'invito & co\nRiga 2"),
    "mailto:m@x.it?subject=Oggetto%20%C3%A8&body=Ciao%20Nicol%C3%B2%2C%20l'invito%20%26%20co%0D%0ARiga%202");
  assert.equal(DO.mailto('', 'X', 'Y'), 'mailto:?subject=X&body=Y');
});

test('nuova versione del sito pubblicata', () => {
  assert.equal(DO.versioneDa('<script src="app/comune.js?v=23"></script>'), '23');
  assert.equal(DO.versioneDa('<html></html>'), '');
  assert.equal(DO.nuovaVersione('22', '<script src="app/comune.js?v=23"></script>'), true);
  assert.equal(DO.nuovaVersione('22', '<script src="app/comune.js?v=22"></script>'), false);
  assert.equal(DO.nuovaVersione('', '<script src="app/comune.js?v=23"></script>'), false);   // versione attuale sconosciuta
  assert.equal(DO.nuovaVersione('22', 'Errore 404'), false);                                  // pagina non letta bene
});

test('foto di Firestore con soli metadati cambiati', () => {
  const foto = (cambi, daCache) => ({ metadata: { fromCache: daCache }, docChanges: () => new Array(cambi) });
  assert.equal(DO.soloMetadati(foto(0, false), true), true);    // scrittura confermata dal server: niente di nuovo
  assert.equal(DO.soloMetadati(foto(2, false), true), false);   // documenti cambiati
  assert.equal(DO.soloMetadati(foto(0, false), false), false);  // dalla copia sul computer al server
  assert.equal(DO.soloMetadati(foto(0, true), true), false);    // rete persa: di nuovo la copia sul computer
});

test('nomi dei turni remoti', () => {
  assert.deepEqual(['supervisione', 'support', 'partita', undefined].map(DO.mansione), ['Remote TL', 'Remote Support', '', '']);
  assert.deepEqual(['supervisione', 'support', 'partita'].map(DO.turnoRemoto), [true, true, false]);
  assert.deepEqual(['supervisione', 'support', 'partita'].map(DO.nomeTurno), ['Turno Remote TL', 'Turno Remote Support', '']);
  assert.deepEqual(DO.RUOLI, { OP: 'Remote OP', SUP: 'Remote Support', TL: 'Remote TL' });
});

test('tipo di evento valido', () => {
  assert.deepEqual(['partita', 'supervisione', 'support', 'boh', undefined, 'constructor'].map(DO.tipoEvento),
    ['partita', 'supervisione', 'support', 'partita', 'partita', 'partita']);
});


// ---------------------------------------------------------------- accessi in sola visualizzazione
const SUP = ['fferrara@tgisport.com', 'ssolera@tgisport.com'];

test('chi entra nella dashboard', () => {
  const t = (campi) => DO.tipoAccesso(Object.assign({ email: 'x@y.it', verificata: true, supervisori: SUP, inElenco: false }, campi));
  assert.equal(t({ email: 'fferrara@tgisport.com' }), 'supervisore');
  assert.equal(t({ email: 'FFerrara@TGIsport.com ' }), 'supervisore');
  assert.equal(t({ inElenco: true }), 'sola');
  assert.equal(t({ email: 'ssolera@tgisport.com', inElenco: true }), 'supervisore');
  assert.equal(t({ email: 'fferrara@tgisport.com', verificata: false }), 'nessuno');
  assert.equal(t({ inElenco: true, verificata: false }), 'nessuno');
  assert.equal(t({}), 'nessuno');
});

test('controlli dell\'elenco in sola visualizzazione', () => {
  const c = (email, elenco = ['anna@x.it']) => DO.controllaVisualizzatore(email, elenco, SUP);
  assert.deepEqual(c(' Mario.Rossi@TGIsport.com '), { email: 'mario.rossi@tgisport.com' });
  assert.deepEqual(c('mario'), { errore: 'Scrivi un\'email valida.' });
  assert.deepEqual(c(''), { errore: 'Scrivi un\'email valida.' });
  assert.deepEqual(c('SSolera@tgisport.com'), { errore: 'È già un supervisore.' });
  assert.deepEqual(c('Anna@X.it'), { errore: 'È già nell\'elenco.' });
  assert.equal(DO.normalizzaEmail(' A@B.IT '), 'a@b.it');
});

test('invito in sola visualizzazione', () => {
  const u = DO.invitoVisualizzatore('mario.rossi@tgisport.com', 'https://x.github.io/sito/admin.html');
  assert.ok(u.startsWith('mailto:mario.rossi@tgisport.com?subject='));
  const testo = decodeURIComponent(u);
  ['TGI Sport · accesso alla dashboard in sola visualizzazione', 'Convocazioni, Riepilogo, Operatori', 'https://x.github.io/sito/admin.html',
    '"Crea account" con questa email (mario.rossi@tgisport.com)', 'entra con la tua password'].forEach((x) => assert.ok(testo.includes(x), x));
});

// ---------------------------------------------------------------- piccoli miglioramenti
test('testo del blocco', () => {
  assert.equal(DO.testoBlocco(0), 'È il giorno dell\'evento: per rinunciare chiama il supervisore.');
  assert.equal(DO.testoBlocco(1), 'Manca 1 giorno o meno: per rinunciare chiama il supervisore.');
  assert.equal(DO.testoBlocco(3), 'Mancano 3 giorni o meno: per rinunciare chiama il supervisore.');
});

test('giorni da compilare in una richiesta: come la pagina operatori, senza i giorni bloccati', () => {
  // oggi venerdì 9, blocco 3: bloccati fino a lunedì 12 compreso
  assert.deepEqual(DO.giorniDaCompilare('2026-10-08', '2026-10-15', '2026-10-09', '2026-12-31', 3), ['2026-10-13', '2026-10-14', '2026-10-15']);
  assert.deepEqual(DO.giorniDaCompilare('2026-10-10', '2026-10-12', '2026-10-09', '2026-12-31', 3), []);
  assert.deepEqual(DO.giorniDaCompilare('2026-12-30', '2027-01-03', '2026-10-09', '2026-12-31', 3), ['2026-12-30', '2026-12-31']);
});

test('numero di reperibilità valido', () => {
  ['', '+39 333 000 0000', '02/1234567', '(06) 123-4567'].forEach((t) => assert.equal(DO.telefonoValido(t), true, t));
  ['ciao', '123', '+39 333 abc', '<script>'].forEach((t) => assert.equal(DO.telefonoValido(t), false, t));
});

test('email con la barra non è valida', () => {
  assert.deepEqual(DO.controllaVisualizzatore('mario/rossi@x.it', [], []), { errore: 'Scrivi un\'email valida.' });
});

test('martedì della settimana col cambio d\'ora di marzo', () => {
  // domenica 29 marzo 2026 si passa all'ora legale: la settimana resta da martedì 24 a lunedì 30
  ['2026-03-24', '2026-03-28', '2026-03-29', '2026-03-30'].forEach((d) => assert.equal(DO.martedi(d), '2026-03-24', d));
  assert.equal(DO.martedi('2026-03-31'), '2026-03-31');
});


test('script delle email non aggiornato: messaggio chiaro', async () => {
  const prima = global.fetch;
  DO.CONFIG.EMAIL_URL = 'https://script.example/exec';
  global.fetch = async () => ({ text: async () => JSON.stringify({ ok: false, errore: 'Operazione non consentita.' }) });
  try {
    await assert.rejects(DO.inviaEmail('azioneNuova', {}), /Script delle email da aggiornare \(vedi README\)\./);
    global.fetch = async () => ({ text: async () => JSON.stringify({ ok: false, errore: 'Accesso non consentito.' }) });
    await assert.rejects(DO.inviaEmail('emailRichiesta', {}), /^Error: Accesso non consentito\.$/);
  } finally { global.fetch = prima; delete DO.CONFIG.EMAIL_URL; }
});
