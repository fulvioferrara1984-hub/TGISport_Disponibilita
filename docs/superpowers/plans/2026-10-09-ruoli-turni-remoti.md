# Ruoli e turni remoti (Remote TL, Remote Support): piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:subagent-driven-development (consigliata) oppure superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** il turno di supervisione diventa «Remote TL», nasce il turno «Remote Support» con il ruolo omonimo, entrambi gestiti come mansioni in Competizioni e sport; via le ore generali da Tariffe e regole.

**Architettura:** nomi di turni e ruoli in `app/comune.js` (servono anche alla pagina operatori, che non carica `regole.js`); regole di calcolo (mansione dell'evento, chi può fare cosa, righe mansione, ore, compensi, esportazioni) in `app/regole.js`, provate con `node --test`; schermate in `admin.html`, `app/impostazioni.js`, `app/convocazioni.js`, `app/calendario.js`, `app/admin.js`, `app/riepilogo.js`, `app/operatore.js`, `app/richieste-evento.js`; testi delle email in `backend/Codice.gs`.

**Tecnologie:** JavaScript nel browser senza framework, Google Apps Script V8, Node 26 (`node:test`, `node:vm`).

**Spec:** `docs/superpowers/specs/2026-10-09-ruoli-turni-remoti-design.md`

## Vincoli globali

- Ruoli `operatori.ruolo`: `'OP'` «Remote OP», `'SUP'` «Remote Support», `'TL'` «Remote TL»; valore sconosciuto = `'OP'`.
- Tipi `eventi.tipo`: `'partita'`, `'supervisione'` (turno Remote TL, valore invariato nei dati), `'support'` (turno Remote Support). Mansioni: `supervisione → 'Remote TL'`, `support → 'Remote Support'`.
- Chi può fare cosa: partita → OP, SUP, TL; support → SUP, TL; supervisione → TL.
- Per un turno la competizione che conta è sempre la mansione (anche se `competizione` dice «Serie A»).
- Testi: «+ Remote TL», «+ Remote Support», «Turno Remote TL», «Turno Remote Support», «Turni Remote TL», «Turni Remote Support», «— Scegli un Remote TL —», «— Scegli un Remote Support o Remote TL —», «Si possono assegnare solo operatori con ruolo Remote TL.», «Si possono assegnare operatori con ruolo Remote Support o Remote TL.», «Competizione / mansione», «di cui Remote TL», «di cui Remote Support», «Remote TL confermati», «Remote Support confermati». «Supervisori» (utenti della dashboard) non cambia.
- Righe mansione: `{ nome, mansione: true, sport: '', prima: 0, dopo, compenso, colore }`; `dopo` iniziale 6 (Remote TL: il vecchio `durataSupervisioneOre` se valido); `dopo` valido da 0.5 a 16, altrimenti il predefinito.
- Prove: `node --test test/*.test.js`. Pubblicazione: `?v=22` → `?v=23`. Il controllo `pre-commit` deve passare.

## Punti da sorvegliare in revisione

1. **Turno di supervisione vecchio con `competizione: 'Serie A'`**: colore, compenso, fine turno, filtro e riepiloghi da «Remote TL» — prova nel Task 1 (`competizioneDi`, `gettone`, `fine`).
2. **Regole salvate senza righe mansione e con `durataSupervisioneOre: 8`**: Remote TL dura 8 ore, Remote Support 6 — prova nel Task 1.
3. **Operatore assegnato a un turno e poi cambiato di ruolo** (TL → OP): resta nel menu del suo turno come oggi — prova nel Task 1 (`assegnabili`).
4. **Competizione con ore vuote o nuova**: 4 e 2 visibili e salvati; righe mansione non rinominabili né eliminabili e con `prima` sempre 0 anche se i dati dicono altro — prova nel Task 1 (`complete`), verifica nel browser nel Task 2.
5. **Riga «Supporto» del file della stagione con solo l'orario**: ritrovo = orario − 4 ore come oggi (non 0) — prova nel Task 1 (`convocazione`), importazione nel browser nel Task 4.

---

### Task 1: Nomi, ruoli e calcoli

**File:**
- Modifica: `app/comune.js` (nomi), `app/regole.js`, `test/regole.test.js`, `test/comune.test.js`

**Interfacce:**
- Produce in `comune.js` (`DO`): `RUOLI = { OP: 'Remote OP', SUP: 'Remote Support', TL: 'Remote TL' }`; `mansione(tipo) → 'Remote TL' | 'Remote Support' | ''`; `turnoRemoto(tipo) → boolean`; `nomeTurno(tipo) → 'Turno Remote TL' | 'Turno Remote Support' | ''`.
- Produce in `regole.js` (`DO.regole`):
  - `nomeRuolo(ruolo)` con le tre voci; `puoFare(ruolo, tipo) → boolean`; `sceltaOperatore(tipo) → testo dell'opzione vuota`;
  - `competizioneDi(e) → DO.mansione(e.tipo) || e.competizione || ''`; `nomeTipo(tipo) → 'Partita' | 'Remote TL' | 'Remote Support'`;
  - `assegnabili(operatori, e) → operatori` attivi che `puoFare(o.ruolo, e.tipo)`, più l'operatore già assegnato all'evento;
  - `complete(r)`: righe mansione in cima (aggiunte se mancano, `nome` e `mansione` fissi, `prima: 0`, `dopo` valido o predefinito, `sport: ''`); competizioni normali con `prima`/`dopo` vuoti completati con `anticipoOre`/`fineOre`;
  - `convocazione(e)`: turno con `convocazione` scritta → quella; turno con solo `orario` → orario − `anticipoOre` (come oggi per le importate); partita come oggi;
  - `fine(e)`: turno = ritrovo + `dopo` della riga mansione; `gettone`: compenso di `competizioneDi(e)`; `ricalcoloInvio`: «turno» al posto di `tipo === 'supervisione'`;
  - `righeMese`: Tipo ed Evento `nomeTipo`, Competizione `competizioneDi`; Presenze `['Operatore', 'Partite confermate', 'Remote TL confermati', 'Remote Support confermati', 'In attesa', 'Giorni on-site']`.

- [ ] **Passo 1: scrivere le prove** in `test/regole.test.js` (regole con Serie A diurno, Champions dimezzato):
  - `ruoli e chi può fare cosa`: `nomeRuolo('SUP') === 'Remote Support'`, `nomeRuolo('x') === 'Remote OP'`; tabella `puoFare` 3×3 (partita: OP/SUP/TL sì; support: SUP/TL sì, OP no; supervisione: solo TL); `sceltaOperatore('supervisione') === '— Scegli un Remote TL —'`, `('support') === '— Scegli un Remote Support o Remote TL —'`, `('partita') === '— Scegli operatore —'`.
  - `mansione dell'evento`: `{ tipo: 'supervisione', competizione: 'Champions League', convocazione: '10:00' }` → `competizioneDi` `'Remote TL'`, `gettone` per un P.IVA `diurno` 140 (non dimezzato), `fine` `'16:00'`; `{ tipo: 'support', convocazione: '12:00' }` → `'Remote Support'`, fine `'18:00'`; partita Serie A → `'Serie A'`; `nomeTipo` per i tre tipi.
  - `righe mansione nelle regole`: `complete({ competizioni: [{ nome: 'Serie A' }] })` → prime due righe `Remote TL` e `Remote Support` con `mansione: true, prima: 0, dopo: 6, compenso: 'diurno'`, Serie A con `prima: 4, dopo: 2`; `complete({ durataSupervisioneOre: 8 })` → Remote TL `dopo: 8`, Remote Support `dopo: 6`; riga salvata `{ nome: 'Remote TL', mansione: true, prima: 3, dopo: 0, compenso: 'notturno', colore: '#123456' }` → `prima: 0`, `dopo: 6`, compenso e colore tenuti; una riga mansione presente una sola volta.
  - `assegnabili`: operatori a (TL), b (SUP), c (OP), d (OP, non attivo): turno Remote TL → [a]; Remote TL assegnato a c → [a, c]; Remote Support → [a, b]; partita → [a, b, c].
  - aggiornare `esportazione mensile…` (Tipo/Evento `'Remote TL'`, presenze a 6 colonne) e lasciare verde `supervisione importata: ritrovo dall'anticipo generale…`.
  - in `test/comune.test.js`: `nomi dei turni remoti` (`DO.mansione('supervisione') === 'Remote TL'`, `DO.mansione('support') === 'Remote Support'`, `DO.mansione('partita') === ''`, `DO.turnoRemoto('support') === true`, `DO.nomeTurno('supervisione') === 'Turno Remote TL'`).
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso FAIL sulle nuove prove.
- [ ] **Passo 3: implementare** in `comune.js` e `regole.js`.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: commit** `git add app/comune.js app/regole.js test/ && git commit -m "Turni remoti: ruoli, mansioni e calcoli"`.

### Task 2: Impostazioni

**File:**
- Modifica: `admin.html` (via i tre campi ore e la loro nota; intestazione «Competizione / mansione»), `app/impostazioni.js`, `app/stile.css`

**Interfacce:**
- Consuma: `complete` (Task 1).

- [ ] **Passo 1: implementare**: `form-regole` salva tariffe, notturno e tariffa on-site lasciando invariati `anticipoOre`, `fineOre`, `durataSupervisioneOre`; editor delle competizioni: righe mansione con nome in sola lettura, niente sport né «Togli», «ore prima» disabilitato a 0, «ore dopo» = durata (0.5–16), titolo «Durata del turno (ore dal ritrovo)»; nuova competizione `{ prima: 4, dopo: 2, compenso: 'diurno' }`; salvataggio con `mansione: true` sulle righe mansione e ore sempre numeriche (vuoto → avviso «Indica le ore di ogni competizione (da 0 a 12; durata dei turni da 0,5 a 16).»).
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 3: provare nel browser in demo**: Tariffe e regole senza le ore; Competizioni con Remote TL e Remote Support in cima (non rinominabili, senza ✕), Serie A con 4 e 2; durata Remote Support a 4 salvata e ricaricata; console senza errori.
- [ ] **Passo 4: commit** `git add admin.html app/impostazioni.js app/stile.css && git commit -m "Impostazioni: ore solo per competizione, righe Remote TL e Remote Support"`.

### Task 3: Convocazioni, calendario, «Chiedi disponibilità»

**File:**
- Modifica: `admin.html` (tasti «+ Remote TL» `#ev-nuovo-tl`, «+ Remote Support» `#ev-nuovo-support`; finestra dei nuovi turni senza competizione, con `#evs-titolo`, `#evs-nota`, `#evs-op`), `app/convocazioni.js`, `app/calendario.js`

**Interfacce:**
- Consuma: `DO.mansione`, `DO.turnoRemoto`, `DO.nomeTurno`, `R.nomeTipo`, `R.competizioneDi`, `R.assegnabili`, `R.sceltaOperatore`, `R.puoFare` (Task 1).

- [ ] **Passo 1: implementare**:
  - righe dei giorni con «+ Remote TL», «+ Remote Support», «+ partite»; la finestra dei nuovi turni riceve il tipo: titolo «Turni Remote TL» / «Turni Remote Support», nota secondo il tipo, operatore facoltativo da `assegnabili`; crea `{ tipo, competizione: mansione, titolo: mansione, sport: '', orario: '' … }`;
  - riga evento: cartellino «Remote TL» / «Remote Support», colore e «Dimezzato» da `competizioneDi`, titolo da `nomeTipo` per i turni, nessuna riga competizione per i turni; turni prima delle partite;
  - menu operatore e «Chiedi disponibilità» con `assegnabili` / `puoFare` e `sceltaOperatore`;
  - finestra dell'evento: per i turni titolo `nomeTurno`, nascosti competizione, round, partita, orario e sport; al salvataggio `competizione` = mansione;
  - filtro per competizione con `competizioneDi`; i menu delle competizioni delle partite (`riempiElenchi`) senza righe mansione;
  - elenco «Invia convocazioni» e dati inviati allo script: titolo da `titolo(e)`, `competizione` vuota per i turni;
  - calendario: testo, colore e dettagli con `nomeTipo` / `competizioneDi`.
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 3: provare nel browser in demo**: creare turni Remote TL e Remote Support; menu operatori (Remote TL: solo TL; Remote Support: SUP e TL; un OP già assegnato resta visibile); vecchio turno «Supervisione Serie A» mostrato come Remote TL; calendario; «Chiedi disponibilità» su un turno Remote Support con solo SUP e TL; console senza errori.
- [ ] **Passo 4: commit** `git add admin.html app/convocazioni.js app/calendario.js && git commit -m "Convocazioni: turni Remote TL e Remote Support"`.

### Task 4: Operatori, Riepilogo, importazione

**File:**
- Modifica: `admin.html` (menu Ruolo a tre voci), `app/admin.js` (cartellino del ruolo), `app/dati-firebase.js` e `app/demo.js` (`ruolo` fra `OP`/`SUP`/`TL`), `app/riepilogo.js`, `app/impostazioni.js` (importazione), `app/stile.css` (`.etichetta.ruolo-SUP`), `test/demo.test.js`

**Interfacce:**
- Consuma: Task 1.

- [ ] **Passo 1: scrivere la prova** `ruolo Remote Support salvato` in `test/demo.test.js`: `salvaOperatore` con `ruolo: 'SUP'` → l'operatore ha `ruolo: 'SUP'`; `ruolo: 'boh'` → `'OP'`.
- [ ] **Passo 2: eseguire** `node --test test/demo.test.js` → atteso FAIL.
- [ ] **Passo 3: implementare**: menu Ruolo «Remote OP – partite», «Remote Support – partite e turni Remote Support», «Remote TL – partite e tutti i turni»; whitelist del ruolo in Firebase e demo; Riepilogo con gruppi per `competizioneDi`, colonne «di cui Remote TL» e «di cui Remote Support» al posto di «di cui supervisione» (a schermo, riquadri e Excel), tolta la colonna per competizione; importazione: titoli «Supporto…» / «Remote TL…» → `supervisione`, «Remote Support…» → `support` (ritrovo da `R.convocazione` con l'orario, poi `orario: ''`), ruolo `TL` da Remote TL, `SUP` da Remote Support solo per chi è `OP`; anteprima con i conteggi «turni Remote TL» e «turni Remote Support».
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: provare nel browser in demo**: operatore con ruolo Remote Support salvato e mostrato; Riepilogo del mese con le colonne nuove; importazione di un file prova (generato per la prova, non salvato nel repository) con righe «Supporto», «Remote TL», «Remote Support»; console senza errori.
- [ ] **Passo 6: commit** `git add admin.html app/ test/demo.test.js && git commit -m "Operatori Remote Support, Riepilogo e importazione dei turni remoti"`.

### Task 5: Pagina operatore, richieste per evento, email, pubblicazione

**File:**
- Modifica: `app/operatore.js`, `app/richieste-evento.js`, `backend/Codice.gs`, `test/richieste-evento.test.js`, `test/email-evento.test.js`, `test/promemoria.test.js`, `README.md`, `app/demo.js` (evento di prova «Remote TL»), `index.html` e `admin.html` (`?v=23`)

**Interfacce:**
- Consuma: `DO.turnoRemoto`, `DO.nomeTurno`, `DO.mansione` (Task 1).
- `copiaEvento(e)`: per i turni `titolo` = mansione, `competizione` vuota.
- Script: `selezionaPromemoria` include `support`; per i turni «inizio turno» / «dalle», titolo = mansione e nessuna competizione nella riga; `nomeEvento(e)` → «Turno Remote TL» / «Turno Remote Support».

- [ ] **Passo 1: scrivere / aggiornare le prove**: `copia dell'evento` (turno Remote TL → `titolo: 'Remote TL', competizione: ''`; turno support → `'Remote Support'`); `email di richiesta per evento` (oggetto `'Sei disponibile? Turno Remote TL · domenica 11 ottobre'`, e per un support `'Sei disponibile? Turno Remote Support · …'`); `promemoria`: un evento `support` in attesa entra nei gruppi; email operatore e supervisori con «Remote Support», «inizio turno» / «dalle» e senza la competizione vecchia del turno.
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso FAIL sulle prove nuove.
- [ ] **Passo 3: implementare**: pagina operatore con `nomeTurno` e orari da turno («Turno 10:00 – 16:00») per entrambi i tipi; richieste per evento e script come sopra; README (Regole, Uso quotidiano, Importare, Messa in linea: sito → script); demo con turno «Remote TL»; `?v=23`.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS; `node --check` su `app/*.js`.
- [ ] **Passo 5: provare nel browser in demo**: pagina operatore con convocazione «Turno Remote Support» e richiesta per un turno Remote TL; formato telefono; console senza errori.
- [ ] **Passo 6: commit** `git add app/ backend/ test/ README.md index.html admin.html && git commit -m "Turni remoti: pagina operatore, richieste per evento, email e istruzioni"`.
