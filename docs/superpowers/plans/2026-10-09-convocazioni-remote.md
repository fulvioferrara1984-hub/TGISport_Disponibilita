# Blocco 1 — Convocazioni remote: piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:subagent-driven-development (consigliata) oppure superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** blocco delle modifiche degli operatori negli ultimi N giorni, "Contatta il supervisore" al telefono, orari di ritrovo e fine turno per competizione con avviso di sovrapposizione, esportazione Excel mensile delle presenze.

**Architettura:** sito statico (GitHub Pages) con script classici nel namespace `window.DO`; dati su Firestore con regole di sicurezza; email da Google Apps Script. I calcoli puri stanno in `app/regole.js` (solo dashboard) e `app/comune.js` (entrambe le pagine) e si provano con `node --test`; le schermate si provano nel browser in modalità demo (`app/demo.js`, attiva con `FIREBASE: null`).

**Tecnologie:** JavaScript nel browser senza framework, Firebase JS SDK 12.3.0 (gstatic), SheetJS 0.18.5 (cdnjs), Firestore Security Rules v2, Google Apps Script V8, Node 26 (`node:test`) solo per le prove.

**Spec:** `docs/superpowers/specs/2026-10-09-convocazioni-remote-design.md`

## Vincoli globali

- Vale solo per gli eventi remoti (`eventi` con `tipo` `partita` o `supervisione`); niente on-site in questo blocco.
- Default: `giorniBlocco` = 3, `fineOre` = 2, `anticipoOre` resta 4; notturno resta sul ritrovo (22:00–06:00).
- Giorno bloccato ⇔ `giorni(dataEvento − oggi) ≤ giorniBlocco` (giorni di calendario, ora locale). Esempio: N = 3, evento lunedì → bloccato da venerdì.
- Agli operatori non arrivano mai tariffe, gettoni o note interne: `impostazioni/regole` resta solo supervisori; il nuovo `impostazioni/operativo` contiene solo `telefono` e `giorniBlocco`.
- Testi in italiano, nello stile delle pagine esistenti. Etichette fissate dalla spec: "📞 Contatta il supervisore", "Bloccato: contatta il supervisore", "⚠ Doppio turno: anche …", "⛔ Turni sovrapposti con …", "⛔ sovrapposto", "⏰ a ridosso", "Esporta mese".
- Ogni pubblicazione alza il numero di versione `?v=` in `index.html` e `admin.html` (oggi `v=11`). Il controllo `pre-commit` locale (pagine non vuote, sintassi JS) deve passare.

## Punti da sorvegliare in revisione

1. **Fine turno oltre la mezzanotte** (partita 22:45 Serie A → fine 00:45): per il confronto la fine diventa 23:59 dello stesso giorno, il turno non "scompare" — prova nel Task 1.
2. **Competizione con un solo campo compilato** (es. `prima` = 1, `dopo` vuoto): ogni campo ricade da solo sul valore generale — prova nel Task 1.
3. **Documento `impostazioni/operativo` mancante o illeggibile** (regole non ancora pubblicate, copia salvata vecchia): la pagina operatore usa N = 3 e nessun telefono, senza errori — prova nel Task 4.
4. **Convocazione in attesa ricevuta già dentro la finestra** (sostituzione dell'ultimo minuto): si può solo confermare o telefonare — prova nel Task 4.
5. **Modifiche non inviate su giorni diventati bloccati** (bozza salvata sul telefono): scartate all'apertura con avviso, non inviate — prova nel Task 4.

---

### Task 1: Orari di turno e sovrapposizioni (`app/regole.js`)

**File:**
- Modifica: `app/regole.js` (`PREDEFINITE`, `complete`, `convocazione`, nuove funzioni, esportazione in `DO.regole`)
- Crea: `test/regole.test.js`
- Modifica: `.gitignore` (aggiungere `!/test/`)

**Interfacce:**
- Produce:
  - `PREDEFINITE.fineOre = 2`; competizioni `{ nome, sport, uefa, prima: number|null, dopo: number|null }` (le esistenti senza `prima`/`dopo` valgono `null`).
  - `convocazione(e, regole) → 'HH:MM'|''`: ritrovo a mano (`e.convocazione`) → `e.orario − (competizione.prima ?? anticipoOre)` → `''`.
  - `fine(e, regole) → 'HH:MM'|''`: `e.fine` se valido → per `tipo === 'supervisione'` `''` → `e.orario + (competizione.dopo ?? fineOre)` → `''`.
  - `intervallo(e, regole) → { inizio: number, fine: number }` in minuti dalla mezzanotte; `fine` = 1439 se manca o se è ≤ `inizio`.
  - `sovrapposti(a, b, regole) → boolean`: stessa `data` e `a.inizio < b.fine && b.inizio < a.fine`.

- [ ] **Passo 1: scrivere le prove** in `test/regole.test.js` (`node:test` + `assert`; caricare con `global.window = {}; require('../app/regole.js'); const R = window.DO.regole;`). Regole di prova: `R.complete({ competizioni: [{ nome: 'Serie A', prima: 4, dopo: 2 }, { nome: 'Champions League', uefa: true, prima: 1, dopo: 2 }, { nome: 'Ligue 1', prima: 1, dopo: null }] })`.
  - `ritrovo e fine per competizione`: Serie A 20:45 → `convocazione` `'16:45'`, `fine` `'22:45'`; Champions 21:00 → `'20:00'` e `'23:00'`.
  - `un solo campo compilato`: Ligue 1 20:45 → ritrovo `'19:45'`, fine `'22:45'` (fineOre 2).
  - `competizione sconosciuta usa i valori generali`: `{ competizione: 'X', orario: '15:00' }` → `'11:00'` e `'17:00'`.
  - `valori a mano vincono`: `{ competizione: 'Serie A', orario: '20:45', convocazione: '18:00', fine: '23:30' }` → `'18:00'` e `'23:30'`.
  - `supervisione senza fine`: `{ tipo: 'supervisione', convocazione: '10:00' }` → `fine` `''`, `intervallo` `{ inizio: 600, fine: 1439 }`.
  - `fine oltre mezzanotte`: Serie A 22:45 → `fine` `'00:45'`, `intervallo.fine` 1439.
  - `sovrapposti`: stessa data, Serie A 15:00 (11:00–17:00) e Serie A 20:45 (16:45–22:45) → `true`; Serie A 12:30 (08:30–14:30) e Serie A 20:45 → `false`; date diverse → `false`.
  - `notturno resta sul ritrovo`: Serie A 02:00 (ritrovo 22:00) → `notturno` `true`.
- [ ] **Passo 2: eseguire** `node --test test/` → atteso FAIL (`R.fine is not a function`).
- [ ] **Passo 3: implementare** in `app/regole.js` le funzioni dell'interfaccia; `complete()` normalizza `prima`/`dopo` assenti a `null` e aggiunge `fineOre`; esportare `fine`, `intervallo`, `sovrapposti`.
- [ ] **Passo 4: eseguire** `node --test test/` → atteso PASS di tutte le prove.
- [ ] **Passo 5: commit** `git add .gitignore test/regole.test.js app/regole.js && git commit -m "Orari di turno per competizione e sovrapposizioni"`.

### Task 2: Finestra di blocco (`app/comune.js`)

**File:**
- Modifica: `app/comune.js` (nuove funzioni esportate in `Object.assign(DO, …)`)
- Crea: `test/comune.test.js`

**Interfacce:**
- Produce: `DO.giorniA(data, oggi) → number` (giorni di calendario, negativo se passato); `DO.bloccato(data, oggi, giorniBlocco) → boolean` = `giorniA(data, oggi) <= giorniBlocco`; `DO.OPERATIVO_PREDEFINITO = { telefono: '', giorniBlocco: 3 }`.

- [ ] **Passo 1: scrivere le prove** (`global.window = {}; require('../app/comune.js'); const DO = window.DO;`):
  - `lunedì bloccato da venerdì`: `bloccato('2026-10-12', '2026-10-09', 3)` → `true`; `bloccato('2026-10-13', '2026-10-09', 3)` → `false`; `bloccato('2026-10-12', '2026-10-08', 3)` → `false`.
  - `oggi e passato sono bloccati`: `bloccato('2026-10-09', '2026-10-09', 3)` → `true`; `bloccato('2026-10-01', '2026-10-09', 3)` → `true`.
  - `N = 0 blocca solo oggi`: `bloccato('2026-10-09', '2026-10-09', 0)` → `true`; `bloccato('2026-10-10', '2026-10-09', 0)` → `false`.
  - `cambio dell'ora non sposta il conteggio`: `giorniA('2026-10-26', '2026-10-24')` → `2`.
- [ ] **Passo 2: eseguire** `node --test test/` → FAIL.
- [ ] **Passo 3: implementare** con `daIso` esistente e `Math.round((b − a) / 864e5)`.
- [ ] **Passo 4: eseguire** `node --test test/` → PASS.
- [ ] **Passo 5: commit** `"Finestra di blocco degli ultimi giorni"`.

### Task 3: Impostazioni e dati (regole, operativo, eventi)

**File:**
- Modifica: `admin.html` (Tariffe e regole: campo `#reg-fine` "Fine turno: ore dopo"; nuovo riquadro "Regole per gli operatori" con `#form-operativo`, `#op-telefono-rep` tipo `tel`, `#op-giorni-blocco` numero 0–14; dialogo evento: campo `#evd-fine` "Fine turno" tipo `time` accanto al ritrovo)
- Modifica: `app/impostazioni.js` (righe competizione con due campi numerici `data-campo="prima"` e `data-campo="dopo"`, vuoto = `null`; salvataggio di `fineOre`; lettura/salvataggio del riquadro operativo)
- Modifica: `app/dati-firebase.js`, `app/demo.js` (stessa interfaccia)
- Modifica: `app/admin.js` (getter `DO.admin.operativo`)
- Modifica: `app/stile.css` (righe competizione con due colonne in più; riga compatta su telefono)

**Interfacce:**
- Consuma: `R.fine` (Task 1), `DO.OPERATIVO_PREDEFINITO` (Task 2).
- Produce:
  - `DO.dati.leggiOperativo() → Promise<{ telefono, giorniBlocco }>`: in caso di documento assente o `permission-denied` restituisce `DO.OPERATIVO_PREDEFINITO`.
  - `DO.dati.salvaOperativo({ telefono, giorniBlocco }) → Promise<void>` (supervisori; scrive `impostazioni/operativo`).
  - `ascolta(cb)`: lo stato passato a `cb` ha anche `operativo` (ascolto di `impostazioni/operativo`, con lo stesso trattamento "regole non ancora pubblicate" di `eventi`).
  - Eventi: `pulisciEvento` salva anche `fine` (`'HH:MM'|''`) e `fineCalcolata`; `creaEventi`, `aggiornaEvento` (chiamato dal dialogo), `importa` e `inviaConvocazioni` ricevono e salvano `fineCalcolata = R.fine(e, regole)` accanto a `convocazioneCalcolata`; `mieConvocazioni` restituisce anche `fine` e `fineCalcolata`.
  - `DO.admin.operativo → { telefono, giorniBlocco }`.

- [ ] **Passo 1:** aggiungere a `test/regole.test.js` la prova `competizioni salvate senza orari restano valide`: `R.complete({ competizioni: [{ nome: 'Serie A', sport: 'Calcio', uefa: false }] }).competizioni[0]` ha `prima === null`, `dopo === null`; `fineOre === 2`. Eseguire `node --test test/` → PASS (già coperto dal Task 1: la prova fissa il comportamento).
- [ ] **Passo 2:** implementare HTML, `impostazioni.js`, `dati-firebase.js`, `demo.js`, `admin.js`, CSS come da interfaccia.
- [ ] **Passo 3: verifica nel browser** (demo, larghezza 1271 e telefono): impostare Serie A 4/2 e Champions 1/2, salvare, ricaricare → valori presenti; salvare telefono `+39 333 1234567` e N = 3 → ricaricando restano; il dialogo evento mostra e salva la fine a mano. Nessun errore in console.
- [ ] **Passo 4: commit** `"Orari per competizione e regole per gli operatori nelle impostazioni"`.

### Task 4: Pagina operatore — blocco, telefono, orari

**File:**
- Modifica: `app/operatore.js`, `app/stile.css` (etichetta "bloccato", riga di spiegazione), `index.html` (versione)

**Interfacce:**
- Consuma: `DO.bloccato`, `DO.OPERATIVO_PREDEFINITO` (Task 2), `DO.dati.leggiOperativo`, campi `fine`/`fineCalcolata` delle convocazioni (Task 3).
- Produce: nessuna interfaccia nuova; la copia locale (`DO.salvaCopia`) include `operativo`.

- [ ] **Passo 1: implementare** in `operatore.js`:
  - `operativo` caricato in parallelo a disponibilità e convocazioni (fallisce → predefinito); `modificabile(d)` = `d >= oggi && d <= limite && !DO.bloccato(d, oggi, operativo.giorniBlocco)`; i giorni bloccati (non passati) mostrano l'etichetta "Bloccato: contatta il supervisore".
  - All'apertura, la bozza perde i giorni non modificabili; se ne ha persi per il blocco → `DO.avviso('Alcune modifiche non inviate riguardavano giorni ormai bloccati e sono state scartate.')`.
  - Convocazioni, per stato e finestra (`DO.bloccato(c.data, oggi, N)`), esattamente come la spec §2; "📞 Contatta il supervisore" = `<a class="bottone" href="tel:…">`; senza telefono = testo "Chiedi ai supervisori il numero di reperibilità".
  - Orari: "Ritrovo HH:MM – fine turno HH:MM" (fine = `c.fine || c.fineCalcolata`, omessa se vuota); supervisione "Turno HH:MM – HH:MM".
- [ ] **Passo 2: verifica nel browser** (demo, formato telefono), con oggi reale e N = 3. Preparare nella demo: convocazione *convocata* a oggi + 2 giorni, una *confermata* a oggi + 10, una *convocata* a oggi + 10; poi:
  - oggi + 2 *in attesa* → "Confermo" + "📞 Contatta il supervisore" + riga di spiegazione, niente "Non posso" (punto 4 di revisione);
  - oggi + 10 *confermata* → "Confermata" + "📞 Contatta il supervisore", niente "Non posso più";
  - oggi + 10 *in attesa* → "Confermo" + "Non posso";
  - disponibilità: i giorni fino a oggi + 3 in sola lettura con l'etichetta; "Tutta la settimana: Disponibile" non li cambia;
  - bozza salvata con un giorno a oggi + 1, ricarica → giorno scartato e avviso mostrato (punto 5);
  - eliminare `impostazioni/operativo` dalla demo (o forzare l'errore) → pagina funzionante con N = 3 e testo "Chiedi ai supervisori…" (punto 3).
- [ ] **Passo 3: commit** `"Operatori: blocco degli ultimi giorni e contatto telefonico"`.

### Task 5: Dashboard — righe con fine turno, sovrapposizioni, "a ridosso"

**File:**
- Modifica: `app/convocazioni.js` (`altriImpegni`, `selettore`, `avvisiOperatore`, `riga`, conferma all'assegnazione), `app/stile.css` (`.avviso-op.rosso` già esiste; etichetta `.tag-ridosso`)

**Interfacce:**
- Consuma: `R.fine`, `R.intervallo`, `R.sovrapposti` (Task 1), `DO.bloccato` (Task 2), `DO.admin.operativo` (Task 3).

- [ ] **Passo 1: implementare** come spec §3: riga "ritrovo HH:MM · fine HH:MM"; nel menu "⛔ sovrapposto" se `sovrapposti`, altrimenti "⚠ già impegnato"; avviso sulla riga giallo o rosso con i titoli e gli orari degli altri turni; conferma all'assegnazione con testo "TURNI SOVRAPPOSTI: …" oppure "DOPPIO TURNO: …"; etichetta "⏰ a ridosso" se `DO.bloccato(e.data, oggi, N)` e stato `da-assegnare` o `convocato`.
- [ ] **Passo 2: verifica nel browser** (demo): Luca Bianchi supervisione 10:00 senza fine + partita Serie A 20:45 → rosso (la supervisione senza fine arriva a fine giornata, come da spec); impostare la fine della supervisione a 16:00 → diventa giallo; due partite Serie A 15:00 e 20:45 → rosso; 12:30 e 20:45 → giallo; evento da assegnare fra 2 giorni → "⏰ a ridosso".
- [ ] **Passo 3: commit** `"Convocazioni: fine turno, turni sovrapposti, eventi a ridosso"`.

### Task 6: Esportazione mensile senza compensi

**File:**
- Modifica: `admin.html` (scheda Convocazioni, tra gli strumenti in alto: `<input type="month" id="ev-mese">` e pulsante `#ev-esporta` "Esporta mese"), `app/convocazioni.js`

**Interfacce:**
- Consuma: `DO.caricaXlsx()` (esistente in `app/riepilogo.js`), `R.convocazione`, `R.fine`.
- Produce: `esportaMese(mese: 'YYYY-MM') → Promise<void>` interna a `convocazioni.js`; file `Convocazioni_YYYY-MM.xlsx` con fogli `Convocazioni` e `Presenze`.

- [ ] **Passo 1: implementare**: foglio *Convocazioni* con le colonne della spec (data, tipo, competizione, round, sport, evento, orario, ritrovo, fine turno, operatore, ruolo, stato in italiano), ordinato per data e ritrovo; foglio *Presenze* con colonne Operatore, Partite confermate, Supervisioni confermate, In attesa (annullati esclusi). Nessuna colonna di gettone o importo. Mese predefinito: quello della settimana in vista.
- [ ] **Passo 2: verifica nel browser** (demo con eventi su ottobre): generare il file con `XLSX.write(…, { type: 'array' })` invece del download e rileggerlo con `XLSX.read`: nomi dei fogli `['Convocazioni', 'Presenze']`; intestazioni esatte; nessuna cella che contenga "€" o "Gettone"; un evento annullato presente nel primo foglio e non contato nel secondo. Poi un download vero da aprire a mano.
- [ ] **Passo 3: commit** `"Esportazione mensile delle convocazioni senza compensi"`.

### Task 7: Regole Firestore, email, documentazione e messa in linea

**File:**
- Modifica: `firebase/firestore.rules`, `backend/Codice.gs` (`emailConvocazioni`: "ritrovo X – fine Y"), `README.md` (regole del blocco, nuovi campi, ordine di pubblicazione), `index.html`/`admin.html` (`?v=12`)

- [ ] **Passo 1: regole** — in `match /impostazioni/{documento}`: `allow read: if supervisore() || (documento == 'operativo' && operatore())`; `allow write: if supervisore()`. In `match /eventi/{evento}`, ramo operatore dell'`update`, aggiungere: se `request.resource.data.stato == 'rifiutato'` allora `resource.data.stato == 'convocato' && request.time < dataEvento() - duration.value(giorniBlocco(), 'd')`, con funzioni `dataEvento()` (da `resource.data.data.split('-')` e `timestamp.date(int(…), int(…), int(…))`) e `giorniBlocco()` (`exists(…/impostazioni/operativo) ? get(…).data.get('giorniBlocco', 3) : 3`).
- [ ] **Passo 2: script email** — nella tabella di `emailConvocazioni` mostrare "ritrovo X – fine Y" quando `e.fine` c'è; in `convocazioni.js` aggiungere `fine: e.fineCalcolata` agli eventi inviati. Verifica: `node --check` su una copia `.js` di `Codice.gs`.
- [ ] **Passo 3: prove finali** — `node --test test/` PASS; tutti `node --check app/*.js` OK; pre-commit OK; giro completo nella demo (desktop e telefono) senza errori in console.
- [ ] **Passo 4: messa in linea**, nell'ordine della spec: (a) l'utente pubblica le regole in console; (b) commit e push del sito, attesa della pubblicazione su GitHub Pages, controllo che la pagina servita contenga `?v=12`; (c) l'utente ripubblica lo script ("Nuova versione"). Verifiche da fuori: lettura anonima di `impostazioni/operativo` → 403; `emailConvocazioni` con gettone finto → "Accesso non consentito.".
- [ ] **Passo 5: passi per l'utente** con l'utente di prova: convocazione fra 2 giorni → niente "Non posso", solo telefono; convocazione fra 10 giorni → "Non posso" funziona; dopo la conferma non si può più rifiutare.
- [ ] **Passo 6: commit** `"Regole, email e documentazione del blocco 1"`.
