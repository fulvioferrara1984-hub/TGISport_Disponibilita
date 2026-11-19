# Ritrovo del giorno prima — piano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** le partite notturne (es. sabato 21/11 alle 02:00) hanno il ritrovo la sera prima (venerdì 20 alle 22:00), e la piattaforma lo mostra, lo ordina e lo controlla con il suo giorno vero.

**Architecture:** una sola regola in `app/comune.js` (letto da tutte e due le pagine) dice quando il ritrovo è del giorno prima e come scriverlo. Prende il posto delle due copie in `app/agenda.js` e `app/regole.js`. I controlli dei turni sovrapposti confrontano momenti veri (giorno più ora). I dati salvati non cambiano.

**Tech Stack:** JavaScript senza librerie (IIFE su `window.DO`), prove con `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-19-ritrovo-notturno-design.md`

## Global Constraints

- I dati salvati non cambiano: il ritrovo resta «hh:mm» con il giorno della partita (`data`). Niente da toccare in Firebase, nelle regole o nello script.
- La regola: il ritrovo è del giorno prima quando ci sono sia l'orario della partita sia il ritrovo, il ritrovo in minuti viene dopo l'orario, e tra il ritrovo e l'orario della partita del giorno dopo ci sono al massimo 12 ore (720 minuti, il massimo di «ore prima» in Impostazioni). Il confronto si fa in minuti, così «2:00» vale come «02:00».
- Come si scrive: «ven 20 alle 22:00», cioè giorno breve in minuscolo, numero del giorno, «alle» e l'ora com'è scritta. Se il ritrovo è dello stesso giorno, resta solo l'ora, come oggi.
- La convocazione resta sotto il giorno della partita (elenchi, settimana, mese, Riepilogo, esportazioni).
- «Doppio turno» vale solo tra impegni dello stesso giorno della partita che non si toccano; «sovrapposto» vale anche tra giorni vicini.
- Versione 42 su ogni `?v=` di `index.html` e `admin.html`.
- Testi in italiano; ogni commit finisce con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Prove: `node --test test/*.test.js` (361 verdi all'inizio del ramo).

## Review Focus

1. Mese e anno che cambiano: una partita del 1/12 all'01:00 ha il ritrovo il 30/11; una del 1/1 alle 00:30 il 31/12 dell'anno prima (prova nel Task 1).
2. Orario scritto senza zero («2:00»): la sera prima vale lo stesso, anche nel calendario del telefono e nel controllo «già iniziato» (prove nel Task 1).
3. Ritrovo scritto a mano per errore pochi minuti dopo il calcio d'inizio (partita 20:45, ritrovo 21:00): non diventa «la sera prima» (prova nel Task 1).
4. Turno Remote TL che passa la mezzanotte (venerdì 23:00–05:00) e partita notturna di sabato con ritrovo venerdì alle 22:00: sono sovrapposti (prova nel Task 2).
5. L'avviso di sovrapposizione con un turno di un altro giorno dice quel giorno, altrimenti il supervisore legge orari che non tornano (prova nel Task 3).

---

### Task 1: la regola del ritrovo, il calendario del telefono e «già iniziato»

**Files:**
- Modify: `app/comune.js` (accanto a `orariSovrapposti`, e in `Object.assign(DO, …)`)
- Modify: `app/agenda.js` (`daConvocazione`)
- Modify: `app/regole.js` (`giaIniziato`)
- Test: `test/comune.test.js`, `test/agenda.test.js`, `test/regole.test.js`

**Interfaces:**
- Produces:
  - `DO.ritrovoDelGiornoPrima(orario: string, ritrovo: string) -> boolean`
  - `DO.giornoRitrovo(data: 'aaaa-mm-gg', orario: string, ritrovo: string) -> 'aaaa-mm-gg'`
  - `DO.ritrovoConGiorno(data, orario, ritrovo) -> string`: `''` senza ritrovo, l'ora se è dello stesso giorno, altrimenti `'ven 20 alle 22:00'`
  - `DO.momentoRitrovo(data, orario, ritrovo) -> string`: `'aaaa-mm-ggThh:mm'` (ore a due cifre) per ordinare; `data` se il ritrovo manca o non è un orario
  - `DO.orariSovrapposti(a, b)` con `a`, `b` = `{ data, inizio, fine }`, dove `data` è il giorno in cui il turno inizia: ora confronta anche turni di giorni diversi

- [ ] **Step 1: Scrivi le prove che falliscono**

In `test/comune.test.js`:

```js
test('ritrovo del giorno prima: partite notturne', () => {
  assert.equal(DO.ritrovoDelGiornoPrima('02:00', '22:00'), true);
  assert.equal(DO.ritrovoDelGiornoPrima('2:00', '22:00'), true);
  assert.equal(DO.ritrovoDelGiornoPrima('20:45', '16:45'), false);
  assert.equal(DO.ritrovoDelGiornoPrima('02:00', '02:00'), false);
  assert.equal(DO.ritrovoDelGiornoPrima('', '22:00'), false);      // turno remoto: nessun orario della partita
  assert.equal(DO.ritrovoDelGiornoPrima('02:00', ''), false);
  assert.equal(DO.ritrovoDelGiornoPrima('20:45', '21:00'), false); // scritto per errore dopo il calcio d'inizio
  assert.equal(DO.ritrovoDelGiornoPrima('06:00', '18:00'), true);  // 12 ore prima: ancora la sera prima
  assert.equal(DO.ritrovoDelGiornoPrima('06:00', '17:59'), false);
  assert.equal(DO.giornoRitrovo('2026-11-21', '02:00', '22:00'), '2026-11-20');
  assert.equal(DO.giornoRitrovo('2026-11-21', '20:45', '16:45'), '2026-11-21');
  assert.equal(DO.giornoRitrovo('2026-12-01', '01:00', '21:00'), '2026-11-30');
  assert.equal(DO.giornoRitrovo('2027-01-01', '00:30', '20:30'), '2026-12-31');
});

test('ritrovo scritto con il suo giorno', () => {
  assert.equal(DO.ritrovoConGiorno('2026-11-21', '02:00', '22:00'), 'ven 20 alle 22:00');
  assert.equal(DO.ritrovoConGiorno('2026-11-21', '20:45', '16:45'), '16:45');
  assert.equal(DO.ritrovoConGiorno('2026-11-21', '', '10:00'), '10:00');
  assert.equal(DO.ritrovoConGiorno('2026-11-21', '02:00', ''), '');
});

test('momento del ritrovo, per ordinare', () => {
  assert.equal(DO.momentoRitrovo('2026-11-21', '02:00', '22:00'), '2026-11-20T22:00');
  assert.equal(DO.momentoRitrovo('2026-11-21', '20:45', '9:30'), '2026-11-21T09:30');
  assert.equal(DO.momentoRitrovo('2026-11-21', '', ''), '2026-11-21');
  assert.ok(DO.momentoRitrovo('2026-11-21', '02:00', '22:00') < DO.momentoRitrovo('2026-11-21', '18:00', '14:00'));
});

test('turni sovrapposti a cavallo della mezzanotte, tra giorni diversi', () => {
  const t = (data, inizio, fine) => ({ data, inizio, fine });
  const notte = t('2026-11-20', '22:00', '04:00');                 // partita di sabato alle 02:00
  assert.equal(DO.orariSovrapposti(notte, t('2026-11-20', '21:00', '23:30')), true);
  assert.equal(DO.orariSovrapposti(notte, t('2026-11-21', '22:00', '23:00')), false);
  assert.equal(DO.orariSovrapposti(notte, t('2026-11-21', '03:00', '05:00')), true);
  assert.equal(DO.orariSovrapposti(t('2026-11-21', '03:00', '05:00'), notte), true);
});
```

In `test/agenda.test.js`, con l'aiuto `partita(campi)` del file:

```js
test('partita notturna con l\'orario senza zero: il turno parte la sera prima', () => {
  const ev = A.daConvocazione(partita({ data: '2026-11-21', orario: '2:00', convocazione: '22:00', fine: '04:00' }), SITO);
  assert.equal(ev.da, '2026-11-20T22:00');
  assert.equal(ev.a, '2026-11-21T04:00');
  assert.match(ev.descrizione, /Ritrovo ven 20 alle 22:00 – fine turno 04:00/);
});
```

In `test/regole.test.js`:

```js
test('evento già iniziato: orario senza zero, ritrovo la sera prima', () => {
  const reg = R.complete({ competizioni: [{ nome: 'NBA', prima: 4, dopo: 2 }] });
  const ev = { tipo: 'partita', competizione: 'NBA', data: '2026-11-21', orario: '2:00' };   // ritrovo 22:00 del 20
  assert.equal(R.giaIniziato(ev, reg, '2026-11-20', '21:59'), false);
  assert.equal(R.giaIniziato(ev, reg, '2026-11-20', '22:00'), true);
});
```

- [ ] **Step 2: Fai girare le prove e guardale fallire**

Run: `node --test test/comune.test.js test/agenda.test.js test/regole.test.js`
Expected: le quattro prove nuove di `comune` falliscono (`DO.ritrovoDelGiornoPrima is not a function` e simili, la sovrapposizione tra giorni diversi dà `false`); quella di `agenda` fallisce su `ev.da` (`2026-11-21T22:00`); quella di `regole` fallisce sulle 22:00 (`false`). Le altre restano verdi.

- [ ] **Step 3: Scrivi la regola in `app/comune.js`**

`ritrovoDelGiornoPrima`: minuti di orario e ritrovo; vero se tutti e due ci sono, `r > o` e `o + 1440 - r <= 720`. `giornoRitrovo` usa `aggiungi(data, -1)`. `ritrovoConGiorno` usa `giorno(...)`: `breve.toLowerCase() + ' ' + num + ' alle ' + ritrovo`. In `orariSovrapposti` togli il controllo `a.data !== b.data` e confronta intervalli in minuti assoluti: i giorni di distanza da `a.data` per 1440, più i minuti dell'ora; una fine non dopo l'inizio passa al giorno dopo; senza fine conta il solo inizio, come oggi. Aggiungi le quattro funzioni a `Object.assign(DO, …)`.

- [ ] **Step 4: Usa la regola nel calendario del telefono e in «già iniziato»**

In `app/agenda.js` (`daConvocazione`): `giorno = DO.giornoRitrovo(c.data, c.orario, inizio)` al posto di `c.orario && inizio > c.orario ? …`; nella descrizione `'Ritrovo ' + DO.ritrovoConGiorno(c.data, c.orario, r)`. In `app/regole.js` (`giaIniziato`): il giorno del ritrovo da `DO.giornoRitrovo(e.data, e.orario, ritrovo)`; il confronto con `ora` resta in minuti o con l'ora a due cifre, così «2:00» non sbaglia.

- [ ] **Step 5: Fai girare tutte le prove**

Run: `node --test test/*.test.js`
Expected: tutto verde (361 + 6).

- [ ] **Step 6: Commit**

```bash
git add app/comune.js app/agenda.js app/regole.js test/comune.test.js test/agenda.test.js test/regole.test.js
git commit -m "Ritrovo notturno: una regola sola per il ritrovo del giorno prima"
```

### Task 2: turni sovrapposti per i supervisori

**Files:**
- Modify: `app/regole.js` (`intervallo`, `sovrapposti`, `conflitto`; nuova `altriImpegni`)
- Modify: `app/convocazioni.js:29` (`altriImpegni`)
- Test: `test/regole.test.js`

**Interfaces:**
- Consumes: `DO.giornoRitrovo` dal Task 1.
- Produces:
  - `R.altriImpegni(e, eventi, idOp) -> evento[]`: impegni dell'operatore `idOp`, escluso `e` e gli annullati, il giorno della partita di `e` e quelli subito prima e subito dopo
  - `R.sovrapposti(a, b, regole) -> boolean` anche tra giorni diversi
  - `R.conflitto(e, altri, regole) -> { livello: '' | 'doppio' | 'sovrapposto', con: evento[] }`: `con` sono gli impegni dello stesso giorno della partita più quelli dei giorni vicini che si sovrappongono

- [ ] **Step 1: Scrivi le prove che falliscono**

```js
test('conflitto a cavallo della mezzanotte', () => {
  const notte = { id: 'n', tipo: 'partita', data: '2026-11-21', orario: '02:00', convocazione: '22:00', fine: '04:00' };
  const venerdi = { id: 'v', tipo: 'partita', data: '2026-11-20', orario: '23:00', convocazione: '21:00', fine: '23:30' };
  const sabatoSera = { id: 's', tipo: 'partita', data: '2026-11-21', orario: '23:00', convocazione: '22:00', fine: '23:30' };
  const tlNotte = { id: 't', tipo: 'supervisione', data: '2026-11-20', orario: '', convocazione: '23:00', fine: '05:00' };
  const giovedi = { id: 'g', tipo: 'partita', data: '2026-11-19', orario: '20:45', convocazione: '18:45', fine: '22:45' };
  assert.equal(R.sovrapposti(notte, venerdi, regole), true);
  assert.equal(R.sovrapposti(venerdi, notte, regole), true);
  assert.equal(R.sovrapposti(notte, sabatoSera, regole), false);
  assert.equal(R.sovrapposti(notte, tlNotte, regole), true);
  assert.deepEqual(R.conflitto(notte, [venerdi], regole), { livello: 'sovrapposto', con: [venerdi] });
  assert.deepEqual(R.conflitto(venerdi, [notte], regole), { livello: 'sovrapposto', con: [notte] });
  assert.deepEqual(R.conflitto(notte, [sabatoSera], regole), { livello: 'doppio', con: [sabatoSera] });
  assert.deepEqual(R.conflitto(notte, [giovedi], regole), { livello: '', con: [] });
});

test('altri impegni: lo stesso giorno della partita e quelli vicini', () => {
  const e = { id: 'n', operatoreId: 'op', data: '2026-11-21' };
  const ev = [e, { id: 'a', operatoreId: 'op', data: '2026-11-20' }, { id: 'b', operatoreId: 'op', data: '2026-11-21' },
    { id: 'c', operatoreId: 'op', data: '2026-11-22' }, { id: 'd', operatoreId: 'op', data: '2026-11-23' },
    { id: 'f', operatoreId: 'altro', data: '2026-11-21' }, { id: 'g', operatoreId: 'op', data: '2026-11-21', stato: 'annullato' }];
  assert.deepEqual(R.altriImpegni(e, ev, 'op').map((x) => x.id), ['a', 'b', 'c']);
});
```

- [ ] **Step 2: Fai girare le prove e guardale fallire**

Run: `node --test test/regole.test.js`
Expected: `conflitto a cavallo della mezzanotte` fallisce (`sovrapposti(notte, venerdi)` dà `false`); `altri impegni` fallisce con `R.altriImpegni is not a function`. Le prove esistenti di `sovrapposti` e `conflitto` restano verdi.

- [ ] **Step 3: Scrivi il codice in `app/regole.js`**

`intervallo(e, regole)` dà minuti dalla mezzanotte del giorno della partita: il ritrovo della sera prima è negativo (−1440 più i suoi minuti), una fine non dopo l'inizio passa al giorno dopo. Senza ritrovo l'inizio è la mezzanotte; senza fine si arriva a fine giornata del giorno in cui il turno inizia, come oggi. `sovrapposti` sposta l'intervallo di `b` dei giorni di distanza tra le due `data` (per 1440). `conflitto`: gli impegni non rifiutati né annullati dello stesso giorno della partita entrano in `con` sempre, quelli dei giorni vicini solo se si sovrappongono; `livello` è `'sovrapposto'` se almeno uno di `con` si sovrappone, `'doppio'` se `con` ha solo impegni dello stesso giorno che non si toccano, `''` se `con` è vuoto. Esporta `altriImpegni` in `DO.regole`.

- [ ] **Step 4: Usa `R.altriImpegni` in `app/convocazioni.js`**

`const altriImpegni = (e, idOp) => R.altriImpegni(e, A.eventi, idOp);`

- [ ] **Step 5: Fai girare tutte le prove**

Run: `node --test test/*.test.js`
Expected: tutto verde.

- [ ] **Step 6: Commit**

```bash
git add app/regole.js app/convocazioni.js test/regole.test.js
git commit -m "Ritrovo notturno: turni sovrapposti anche tra giorni vicini"
```

### Task 3: le pagine scrivono e ordinano il ritrovo con il suo giorno; versione 42

**Files:**
- Modify: `app/operatore.js` (righe «Convocato · ritrovo» della settimana e del pannello del giorno, `disegnaConvocazioni`, `rigaConvocazione`, `turno(x)` e `orari(x)` del controllo prima di confermare, `disegnaRichiesteEvento`)
- Modify: `app/convocazioni.js` (`ordina`, `orariTurno`, `elencoTurni`, la riga dell'elenco con `conv`, `rigaInvio`, `ritrovoAuto`)
- Modify: `app/calendario.js` (dettagli dell'evento: «Ritrovo …»)
- Modify: `app/admin.js:264` (popup della griglia)
- Modify: `index.html`, `admin.html` (`?v=41` → `?v=42`), `README.md` (riga «Ritrovo» della tabella delle regole)
- Create: `test/ritrovo-pagine.test.js`

**Interfaces:**
- Consumes: `DO.ritrovoConGiorno`, `DO.momentoRitrovo`, `DO.giornoRitrovo` (Task 1); `R.conflitto` con `con` anche di giorni vicini (Task 2).

- [ ] **Step 1: Scrivi la prova che fallisce**

`test/ritrovo-pagine.test.js` legge i file come testo:

```js
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
  assert.ok((conv.match(/DO\.ritrovoConGiorno\(/g) || []).length >= 3, 'riga dell\'elenco, orari del turno, riga dell\'invio');
  assert.match(conv, /DO\.momentoRitrovo\(/);
  assert.match(conv, /DO\.ritrovoDelGiornoPrima\(/);   // «(automatico 22:00 del giorno prima)»
  assert.match(leggi('app/calendario.js'), /DO\.ritrovoConGiorno\(/);
  assert.match(leggi('app/admin.js'), /DO\.ritrovoConGiorno\(/);
});

test('supervisori: l\'avviso di sovrapposizione dice il giorno degli impegni di un altro giorno', () => {
  const conv = leggi('app/convocazioni.js');
  assert.match(conv, /const elencoTurni = \(lista, e\) =>/);
  assert.equal((conv.match(/elencoTurni\(c\.con, e\)/g) || []).length, 4, 'due avvisi nella riga, due nella scelta dell\'operatore');
});

test('versione 42 su tutte e due le pagine', () => {
  for (const f of ['index.html', 'admin.html']) {
    assert.doesNotMatch(leggi(f), /\?v=41/);
    assert.match(leggi(f), /\?v=42/);
  }
});
```

- [ ] **Step 2: Fai girare la prova e guardala fallire**

Run: `node --test test/ritrovo-pagine.test.js`
Expected: le quattro prove falliscono (nessun uso delle nuove funzioni, `elencoTurni` senza `e`, `?v=41`).

- [ ] **Step 3: Scrivi il ritrovo con il suo giorno nelle pagine**

Ovunque si mostra il ritrovo di una partita: `DO.ritrovoConGiorno(data, orario, ritrovo)` al posto del solo orario (i turni remoti non hanno orario e restano uguali). Per ordinare: `DO.momentoRitrovo(...)`; in `ordina` le voci senza ritrovo restano in fondo (`'99'`). Nel controllo dell'operatore prima di confermare `turno(x)` usa `data: DO.giornoRitrovo(x.data, x.orario, ritrovo(x))`. `orariTurno(x)` scrive il ritrovo con il giorno; `elencoTurni(lista, e)` mette il giorno breve davanti agli impegni con `data` diversa da `e.data` («ven 20 Feyenoord-Como 21:00–23:30»), e i due avvisi di `avvisiOperatore` e della scelta dell'operatore passano `e`. `ritrovoAuto`: «(automatico 22:00 del giorno prima)» quando `DO.ritrovoDelGiornoPrima(orario, auto)`.

- [ ] **Step 4: Versione e README**

`?v=41` → `?v=42` in `index.html` e `admin.html`. Nel README, alla riga «Ritrovo», aggiungi: «se cade la sera prima (partite notturne, es. alle 02:00 con ritrovo alle 22:00) si scrive con il suo giorno: *ven 20 alle 22:00*».

- [ ] **Step 5: Fai girare tutte le prove**

Run: `node --test test/*.test.js`
Expected: tutto verde.

- [ ] **Step 6: Prova nella demo**

Prepara la demo dal ramo, aggiungi una partita di sabato alle 02:00 assegnata all'operatore della demo, inviala e confermala come operatore. Expected:
- elenco dei supervisori: «02:00» e sotto «ritrovo ven NN alle 22:00», in cima al sabato;
- scheda dell'operatore: «Evento alle 02:00 · Ritrovo ven NN alle 22:00 – fine turno 04:00», prima delle partite di sabato pomeriggio;
- settimana dell'operatore: «Convocato · ritrovo ven NN alle 22:00» sotto il sabato;
- pannello del calendario del telefono: «Venerdì NN … · 22:00 – 04:00 di sabato»;
- nessun errore nella console, nei due temi a 1280 e 375 px.

- [ ] **Step 7: Commit**

```bash
git add app/operatore.js app/convocazioni.js app/calendario.js app/admin.js index.html admin.html README.md test/ritrovo-pagine.test.js
git commit -m "Ritrovo notturno: le pagine lo scrivono con il suo giorno; versione 42"
```
