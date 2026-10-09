# Blocco 6 — Richiesta di disponibilità per evento: piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:subagent-driven-development (consigliata) oppure superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** dal menu di un evento remoto chiedere ad alcuni operatori Sì/No per quella partita; risposte dalla pagina operatore; chi dice sì sale in cima al menu di assegnazione; richiesta sempre allineata all'evento.

**Architettura:** archivio `richiesteEvento/{idEvento}` con copia dei dati della partita e mappa delle risposte. Calcoli puri in un nuovo `app/richieste-evento.js` (`DO.richiesteEvento`, entrambe le pagine, demo); stesse funzioni in `dati-firebase.js` e `demo.js`; regole Firestore che lasciano all'operatore solo la propria risposta; allineamento eseguito da ogni dashboard aperta; email nello script.

**Tecnologie:** JavaScript nel browser senza framework, Firebase JS SDK 12.3.0 (`serverTimestamp`, `FieldPath`), Firestore Security Rules v2, Google Apps Script V8, Node 26 (`node:test`, `node:vm`).

**Spec:** `docs/superpowers/specs/2026-10-09-richiesta-evento-design.md`

## Vincoli globali

- Eventi interessati: `tipo` `partita` o `supervisione`, non `annullato`, `data ≥ oggi`; per la supervisione solo operatori `ruolo: 'TL'`.
- `aperta` desiderata = evento esistente ∧ non annullato ∧ `data ≥ oggi` ∧ (`!operatoreId` ∨ `stato === 'rifiutato'` ∨ `daSostituire`); `assegnato` = operatore dell'evento quando chiusa con operatore, altrimenti `''`.
- Risposta dell'operatore: solo la propria voce `{ r: 'si' | 'no', il }` (`il` = istante del server), solo con richiesta aperta, destinatario, prima della fine del giorno `evento.data`; anche dentro la finestra di blocco.
- Testi fissati dalla spec: «Chiedi disponibilità», «Chiedi a N operatori», «Ti chiediamo se sei disponibile», «Sì, sono disponibile», «No», «Hai risposto: sì» / «Hai risposto: no», «Posto già coperto, grazie», «✓ ha detto sì», «(prima della modifica)», «Sì: … · No: … · In attesa: N», «<nome> è disponibile per <titolo> (<giorno>)», «<nome> non è disponibile per <titolo> (<giorno>)», «Sei disponibile? <titolo> · <giorno lungo>», «Rispondi sulla piattaforma», «Pubblica le nuove regole di Firestore (vedi README).». Testi neutri.
- Prove: `node --test test/*.test.js`. Pubblicazione: `?v=21` → `?v=22`; nuovo script `app/richieste-evento.js` in entrambe le pagine dopo `app/onsite.js`. Il controllo `pre-commit` deve passare.

## Punti da sorvegliare in revisione

1. **Operatore che cambia risposta** (sì → no → sì): resta una sola voce aggiornata, l'Aggiornamento riflette l'ultima — prova nel Task 2.
2. **Evento rifiutato o «da sostituire» dopo l'assegnazione**: la richiesta si riapre e chi aveva detto sì ricompare in cima — prova nel Task 1.
3. **Dashboard e regole che scrivono la stessa correzione due volte** (due supervisori collegati): nessun ciclo di scritture, la seconda non cambia nulla — prova nel Task 1 (allineamento già allineato → `null`).
4. **Orario dell'evento cambiato dopo un Sì**: la pagina operatore mostra i dati nuovi, la dashboard segna «(prima della modifica)» — prova nel Task 1.
5. **Richiesta per un evento fuori dalla stagione caricata o eliminato**: si chiude, niente errori — prova nel Task 1.

---

### Task 1: Calcoli (`app/richieste-evento.js`)

**File:**
- Crea: `app/richieste-evento.js`, `test/richieste-evento.test.js`

**Interfacce:**
- Produce `DO.richiesteEvento`:
  - `ms(x) → number`: istante in millisecondi da `Date`, stringa ISO o oggetto con `toMillis()`; altrimenti 0.
  - `copiaEvento(e, regole) → { titolo, tipo, competizione, round, data, orario, ritrovo, fine }` con `titolo = e.titolo` (per i turni senza titolo: `'Supervisione'`), `ritrovo = DO.regole.convocazione(e, regole)`, `fine = DO.regole.fine(e, regole)`, campi mancanti come `''`.
  - `allineamento(richiesta, evento, copia, oggi) → null | { aperta, assegnato, evento?, aggiornata? }`: `null` se tutto torna; altrimenti i campi da scrivere (`aperta`, `assegnato` sempre insieme; `evento` e `aggiornata: true` solo se la copia è diversa nei campi della partita — chi scrive mette l'istante). `evento` assente (eliminato o fuori stagione) → chiusa, `assegnato: ''`, copia invariata.
  - `statoPerOperatore(richiesta, idOp, oggi) → 'da-rispondere' | 'risposto-si' | 'risposto-no' | 'coperto' | 'nascosta'`: data passata → nascosta; aperta → da-rispondere / risposto-…; chiusa con `assegnato` diverso da `idOp` e propria risposta `si` → coperto; altrimenti nascosta.
  - `primaDellaModifica(richiesta, idOp) → boolean`: risposta presente e `ms(il) < ms(aggiornata)`.
  - `riassunto(richiesta) → { si: [id], no: [id], attesa: number }` (attesa = destinatari senza risposta).
  - `preselezione({ disponibilita, impegnato, onsite, giaChiesto }) → boolean`: vero solo con disponibilità `D` o `P`, nessun altro turno, non on-site, non già chiesto.

- [ ] **Passo 1: scrivere le prove** in `test/richieste-evento.test.js` (caricare `comune.js`, `regole.js`, `richieste-evento.js`; oggi `'2026-10-09'`):
  - `copia dell'evento`: partita Serie A 2026-10-18 20:45 → `{ titolo: 'Roma-Lazio', tipo: 'partita', competizione: 'Serie A', round: '9', data: '2026-10-18', orario: '20:45', ritrovo: '16:45', fine: '22:45' }`; `{ tipo: 'supervisione', competizione: 'Serie A', data: '2026-10-18', titolo: 'Supervisione', convocazione: '10:00' }` → `{ titolo: 'Supervisione', tipo: 'supervisione', competizione: 'Serie A', round: '', data: '2026-10-18', orario: '', ritrovo: '10:00', fine: '16:00' }`.
  - `allineamento`: aperta con evento senza operatore → `null`; evento assegnato a `'a'` → `{ aperta: false, assegnato: 'a' }`; poi `rifiutato` → `{ aperta: true, assegnato: '' }`; `daSostituire` confermato → `{ aperta: true, assegnato: '' }`; annullato → `{ aperta: false, assegnato: '' }`; data passata → chiusa; evento assente → `{ aperta: false, assegnato: '' }`; orario cambiato → contiene `evento` con il nuovo orario e `aggiornata: true`; già allineata dopo la correzione → `null`.
  - `stato per l'operatore`: aperta senza risposta → `da-rispondere`; con `si` → `risposto-si`; con `no` → `risposto-no`; chiusa, `assegnato: 'b'`, propria risposta `si` → `coperto`; chiusa assegnata a sé → `nascosta`; chiusa con risposta `no` → `nascosta`; data `'2026-10-08'` → `nascosta`.
  - `prima della modifica`: `il` 10:00 e `aggiornata` 11:00 → `true`; `il` 12:00 → `false`; senza risposta → `false`; funziona con stringhe ISO e con `{ toMillis }`.
  - `riassunto`: destinatari a, b, c, d con risposte a: si, b: no, c: si → `{ si: ['a', 'c'], no: ['b'], attesa: 1 }`.
  - `preselezione`: D libero → vero; P libero → vero; A → falso; non indicata → falso; impegnato → falso; on-site → falso; già chiesto → falso.
- [ ] **Passo 2: eseguire** `node --test test/richieste-evento.test.js` → atteso FAIL (modulo mancante).
- [ ] **Passo 3: implementare** `app/richieste-evento.js` (IIFE su `window.DO`, come `onsite.js`).
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: commit** `git add app/richieste-evento.js test/richieste-evento.test.js && git commit -m "Richieste per evento: calcoli di allineamento, stati e riepilogo"`.

### Task 2: Archivio, regole e demo

**File:**
- Modifica: `app/dati-firebase.js`, `app/demo.js`, `firebase/firestore.rules`, `test/demo.test.js` (caricare anche `richieste-evento.js`)

**Interfacce:**
- Consuma: Task 1.
- Produce (stessa firma in Firebase e demo):
  - `ascolta(cb)`: lo stato passa anche `richiesteEvento` (lista con `id`); lettura negata → `[]` e avviso «Richieste per evento non disponibili: pubblica le nuove regole di Firestore (vedi README).».
  - `chiediPerEvento(evento, copia, destinatari, extra) → { senzaEmail, inviate }`: crea la scheda (`destinatari`, `messaggio`, `evento: copia`, `aggiornata`, `risposte: {}`, `aperta: true`, `assegnato: ''`, `creata`) oppure, se esiste, aggiunge i destinatari (senza doppioni), aggiorna messaggio se non vuoto, copia, `aperta: true`, `assegnato: ''`; destinatari vuoti → «Scegli almeno un operatore.»; permesso negato (regole non pubblicate) → «Pubblica le nuove regole di Firestore (vedi README).»; `extra = { messaggio, email, contatti: [{ nome, email }], urlSito }`; email con `emailRichiestaEvento`.
  - `allineaRichiestaEvento(id, campi)`: scrive i campi di `allineamento` (con `aggiornata` = istante attuale se `aggiornata: true`).
  - `mieRichiesteEvento() → lista` (operatore, `destinatari array-contains`; lettura negata → `[]`).
  - `rispondiRichiestaEvento(id, risposta)`: `'si' | 'no'`; scrive la propria voce (`FieldPath('risposte', id)`, `il: serverTimestamp()`) e una voce in `invii` `{ quando, operatoreId, nome, modifiche: [], letto: false, tipo: 'risposta-evento', evento: { id, titolo, data, risposta } }` (`modifiche` vuota perché la regola di `invii` la vuole lista); per `si` chiama in sottofondo `email('notificaRispostaEvento', { id })`. Errori: richiesta chiusa → «La richiesta è chiusa: il posto è già stato coperto.»; giorno passato → «La partita è già passata.»; non destinatario → «Richiesta non trovata.».
- Regole da aggiungere:

```
    // Richieste di disponibilità per un evento: l'operatore vede solo le sue e scrive solo la propria risposta.
    function rispostaEvento() {
      let io = mioOperatore();
      let p = resource.data.evento.data.split('-');
      return operatore() && resource.data.aperta == true && io in resource.data.destinatari
        && request.time < timestamp.date(int(p[0]), int(p[1]), int(p[2])) + duration.value(1, 'd')
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['risposte'])
        && request.resource.data.risposte.diff(resource.data.risposte).affectedKeys().hasOnly([io])
        && request.resource.data.risposte[io].keys().hasOnly(['r', 'il'])
        && request.resource.data.risposte[io].r in ['si', 'no']
        && request.resource.data.risposte[io].il == request.time;
    }
    match /richiesteEvento/{id} {
      allow read: if supervisore() || (operatore() && mioOperatore() in resource.data.destinatari);
      allow create, delete: if supervisore();
      allow update: if supervisore() || rispostaEvento();
    }
```

- [ ] **Passo 1: scrivere le prove** in `test/demo.test.js`: `richiesta per evento: creazione e nuovi destinatari` (seconda richiesta aggiunge senza doppioni e riapre); `richiesta per evento: risposte` (destinatario risponde sì, poi no, poi sì → una sola voce `si`; tre voci in `invii` con la risposta); `richiesta per evento: condizioni` (non destinatario → «Richiesta non trovata.»; chiusa con `allineaRichiestaEvento(id, { aperta: false, assegnato: 'x' })` → «La richiesta è chiusa…»; data passata → «La partita è già passata.»); `richiesta per evento: l'operatore vede solo le sue` (`mieRichiesteEvento` di un non destinatario → lista vuota).
- [ ] **Passo 2: eseguire** `node --test test/demo.test.js` → atteso FAIL.
- [ ] **Passo 3: implementare** in `demo.js` (stesse condizioni delle regole) e `dati-firebase.js` (con permesso negato si ricontrolla lo stato e si mostra il motivo senza far uscire, come per l'on-site); aggiungere le regole.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: commit** `git add app/dati-firebase.js app/demo.js firebase/firestore.rules test/demo.test.js && git commit -m "Richieste per evento: archivio, regole di Firestore e demo"`.

### Task 3: Pagina operatore

**File:**
- Modifica: `index.html` (riquadro `#richieste-evento` sopra `#richieste-onsite`; script `app/richieste-evento.js`), `app/operatore.js`, `app/stile.css`

**Interfacce:**
- Consuma: `DO.dati.mieRichiesteEvento`, `rispondiRichiestaEvento` (Task 2); `DO.richiesteEvento.statoPerOperatore` (Task 1).

- [ ] **Passo 1: implementare**: `carica()` legge anche `mieRichiesteEvento()` (in parallelo; errore → lista vuota; salvate nella copia del dispositivo); riquadro «Ti chiediamo se sei disponibile» con le voci non `nascosta`, ordinate per data; testi e tasti della spec §4 (orari dalla copia `evento`); dopo una risposta si ricarica la lista e si ridisegna; avvisi con `DO.avviso`.
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 3: provare nel browser in demo**: richiesta creata dalla console della demo per un operatore; voce con orari; «Sì, sono disponibile» → «Hai risposto: sì», cambio in «No»; chiusa con un altro assegnato → «Posto già coperto, grazie»; 375 px senza scorrimento; console senza errori.
- [ ] **Passo 4: commit** `git add index.html app/operatore.js app/stile.css && git commit -m "Richieste per evento: risposta dalla pagina operatore"`.

### Task 4: Dashboard

**File:**
- Modifica: `admin.html` (tasto `#evd-chiedi` «Chiedi disponibilità» nella finestra dell'evento, riga `#evd-risposte`; finestra `#dlg-chiedi`; script `app/richieste-evento.js`), `app/admin.js` (getter `DO.admin.richiesteEvento`; voci di Aggiornamenti `risposta-evento`; allineamento automatico in `aggiorna`), `app/convocazioni.js` (tasto, finestra, riga delle risposte, «✓ ha detto sì» nel menu di assegnazione)

**Interfacce:**
- Consuma: Task 1 e 2.
- Produce: `DO.admin.richiesteEvento` (lista).

- [ ] **Passo 1: implementare**:
  - allineamento: a ogni `aggiorna`, per ogni richiesta `allineamento(richiesta, evento, copiaEvento(evento, regole), oggi)`; se non `null`, `DO.dati.allineaRichiestaEvento(id, campi)` (errori solo in console);
  - finestra «Chiedi disponibilità» (spec §3): elenco con segni di disponibilità, «ha già un turno» / «⛔ sovrapposto» / «⛔ on-site», «già chiesto» con risposta; preselezione con `preselezione`; messaggio; casella email; tasto «Chiedi a N operatori»; esito come «Richiedi disponibilità»; errore della scrittura mostrato con `DO.avviso` (con le regole non pubblicate: «Pubblica le nuove regole di Firestore (vedi README).»);
  - nella finestra dell'evento la riga `riassunto` con nomi e «(prima della modifica)»; il tasto si vede solo per eventi remoti non annullati con `data ≥ oggi`;
  - nel menu di assegnazione, chi ha risposto `si` (richiesta dell'evento) sale in cima con «✓ ha detto sì»;
  - Aggiornamenti: «<nome> è disponibile per …» / «… non è disponibile per …» con «Vedi evento».
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 3: provare nel browser in demo**: richiesta dalla finestra dell'evento con preselezione; risposta sì da un operatore → riga «Sì: …», «✓ ha detto sì» in cima al menu, voce in Aggiornamenti; assegnazione → richiesta chiusa; operatore tolto → riaperta; orario cambiato → «(prima della modifica)»; console senza errori.
- [ ] **Passo 4: commit** `git add admin.html app/admin.js app/convocazioni.js && git commit -m "Richieste per evento: richiesta dalla dashboard, risposte e allineamento"`.

### Task 5: Email dello script, documentazione, pubblicazione

**File:**
- Modifica: `backend/Codice.gs` (`testoEmailRichiestaEvento`, `emailRichiestaEvento`, `testoNotificaRispostaEvento`, `notificaRispostaEvento`, voci in `doPost`), `test/email-onsite.test.js` (o nuovo `test/email-evento.test.js` con `test/gs.js`), `README.md` (uso quotidiano, regole, messa in linea), `index.html` e `admin.html` (`?v=22`)

**Interfacce:**
- `emailRichiestaEvento(r)` (solo supervisori): `r = { destinatari: [{ nome, email }], evento: copia, messaggio, urlSito }` → `{ email, nonInviate, quotaRestante }`.
- `notificaRispostaEvento(r)` (operatore): legge `richiesteEvento/{r.id}` con il gettone dell'operatore, verifica `risposte[op.id].r === 'si'`, altrimenti `{ inviata: false }`; rispetta `emailAttive` ed `emailSupervisori`.

- [ ] **Passo 1: scrivere le prove**: `email di richiesta per evento` (oggetto `'Sei disponibile? Roma-Lazio · domenica 18 ottobre'`; testo con saluto, competizione, orari, messaggio, «Rispondi sulla piattaforma»; caratteri HTML resi come testo; chi non ha email in `nonInviate`); `notifica di risposta sì` (oggetto e testo «Marco Rossi è disponibile per Roma-Lazio (domenica 18 ottobre)», link alle Convocazioni; risposta `no` o assente → nessuna email; notifiche spente → `{ inviata: false }`).
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso FAIL sulle nuove prove.
- [ ] **Passo 3: implementare** le funzioni e le voci di `doPost`.
- [ ] **Passo 4: aggiornare `README.md`** (uso quotidiano «Chiedi disponibilità»; messa in linea sito → regole → script, ricarica delle dashboard) e alzare `?v=` a 22.
- [ ] **Passo 5: eseguire** `node --test test/*.test.js` → atteso PASS; `node --check` su `app/*.js`.
- [ ] **Passo 6: commit** `git add backend/ test/ README.md index.html admin.html && git commit -m "Richieste per evento: email di richiesta e di risposta, istruzioni di rilascio"`.
