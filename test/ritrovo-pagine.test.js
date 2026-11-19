// Le pagine scrivono e ordinano il ritrovo con il suo giorno (app/comune.js): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const leggi = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('operatori: ritrovo con il giorno, ordine e sovrapposizioni dal momento vero', () => {
  const op = leggi('app/operatore.js');
  assert.ok((op.match(/DO\.ritrovoConGiorno\(/g) || []).length >= 4, 'settimana, pannello del giorno, scheda, richieste');
  assert.ok((op.match(/DO\.momentoRitrovo\(/g) || []).length >= 2, 'convocazioni e richieste');
  assert.match(op, /DO\.giornoRitrovo\(/);
  assert.doesNotMatch(op, /c\.data \+ ritrovo\(/);
  assert.doesNotMatch(op, /r\.evento\.data \+ \(r\.evento\.ritrovo/);
});

test('supervisori: elenco, invio, finestra, calendario e griglia', () => {
  const conv = leggi('app/convocazioni.js');
  assert.ok((conv.match(/DO\.ritrovoConGiorno\(/g) || []).length >= 2, 'riga dell\'elenco, riga dell\'invio');
  assert.match(conv, /DO\.momentoRitrovo\(/);
  assert.match(conv, /R\.notaRitrovo\(/);   // «(automatico 22:00 del giorno prima)», anche per quello scritto a mano
  assert.match(leggi('app/calendario.js'), /DO\.ritrovoConGiorno\(/);
  assert.match(leggi('app/admin.js'), /DO\.ritrovoConGiorno\(/);
});

test('supervisori: gli avvisi di sovrapposizione usano i testi delle regole (provati in regole.test.js)', () => {
  const conv = leggi('app/convocazioni.js');
  assert.match(conv, /const elencoTurni = \(lista, e\) => R\.elencoTurni\(lista, e, A\.regole\)/);
  assert.match(conv, /const orariTurno = \(x\) => R\.orariTurno\(x, A\.regole\)/);
  assert.equal((conv.match(/elencoTurni\(c\.con, e\)/g) || []).length, 2, 'i due avvisi della riga');
  assert.match(conv, /R\.avvisoConflitto\(o\.nome, e, c, A\.regole\)/);   // la scelta dell'operatore
});

test('chiedi disponibilità: la spunta guarda il giorno della partita e i turni sovrapposti, non tutti i giorni vicini', () => {
  const conv = leggi('app/convocazioni.js');
  assert.match(conv, /impegnato: R\.impegnato\(e, altriImpegni\(e, o\.id\), A\.regole\)/);
  assert.doesNotMatch(conv, /altriImpegni\(e, o\.id\)\.length/);
});

test('elenco sul telefono: il ritrovo con il giorno va a capo nella colonna stretta', () => {
  assert.match(leggi('app/convocazioni.js'), /class="ritrovo-giorno"/);
  const css = leggi('app/stile.css');
  const telefono = css.slice(css.indexOf('.ev-ora small { white-space: nowrap'));
  assert.match(telefono, /\.ev-ora small\.ritrovo-giorno\s*\{[^}]*white-space:\s*normal/);
});

test('versione 43 su tutte e due le pagine', () => {
  for (const f of ['index.html', 'admin.html']) {
    assert.doesNotMatch(leggi(f), /\?v=42/);
    assert.match(leggi(f), /\?v=43/);
  }
});
