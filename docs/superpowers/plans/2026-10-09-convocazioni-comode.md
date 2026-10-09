# Blocco 4 — Convocazioni più comode: piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:subagent-driven-development (consigliata) oppure superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** settimana martedì–lunedì nelle Convocazioni, colori per competizione (automatici e modificabili, on-site viola), invio di una selezione di convocazioni, calendario mensile a schermo intero con colori di stato.

**Architettura:** i calcoli puri vanno nei file esistenti (`app/comune.js` date, `app/regole.js` colori e stato degli eventi, `app/onsite.js` stato dell'on-site) e si provano con `node --test`; le schermate stanno in `app/convocazioni.js`, `app/impostazioni.js` e nel nuovo `app/calendario.js` (livello a schermo intero, solo dashboard), provate nel browser in modalità demo.

**Tecnologie:** JavaScript nel browser senza framework, Node 26 (`node:test`) per le prove.

**Spec:** `docs/superpowers/specs/2026-10-09-convocazioni-comode-design.md`

## Vincoli globali

- Settimana **martedì → lunedì** solo nella scheda Convocazioni; griglia disponibilità, pagina operatori ed esportazioni invariate.
- Tavolozza di 12 colori: `#2563eb`, `#0d9488`, `#c2410c`, `#be185d`, `#4d7c0f`, `#0369a1`, `#a16207`, `#7c2d12`, `#b91c1c`, `#15803d`, `#475569`, `#0891b2`. On-site sempre `#5b34c9` (fuori tavolozza). Supervisione senza competizione: `#94a3b8`.
- Colori di stato del calendario: verde confermato, blu operatore scelto non confermato, rosso/arancione senza operatore (rifiutati e da sostituire compresi) dentro/fuori la finestra di blocco (`A.operativo.giorniBlocco`), annullati nascosti.
- Calendario: righe **lunedì → domenica**; dati solo da `DO.admin` (nessuna lettura in più).
- Testi fissati dalla spec: «Calendario», «Oggi», «Schermo intero», «Chiudi», «ON-SITE», «+N altri», «Invia N convocazioni», «Automatico».
- Prove: `node --test test/*.test.js`. Pubblicazione: `?v=19` → `?v=20`; nuovo script `app/calendario.js` in `admin.html` dopo `app/onsite-admin.js`. Il controllo `pre-commit` deve passare.

## Punti da sorvegliare in revisione

1. **Settimane a cavallo d'anno e del cambio d'ora** (martedì 29 dicembre → lunedì 4 gennaio; fine marzo/fine ottobre): inizio settimana sempre martedì — prova nel Task 1.
2. **Mesi che iniziano di lunedì o di domenica** (4 o 6 righe, es. febbraio 2027 e marzo 2026): griglia completa, nessun giorno perso — prova nel Task 1.
3. **Competizioni salvate prima di questo blocco** (senza `colore`) o con un colore non valido: colore automatico, nessun errore — prova nel Task 1.
4. **Evento confermato ma «da sostituire»**: rosso/arancione, mai verde — prova nel Task 1.
5. **Invio con zero convocazioni spuntate o con un operatore deselezionato**: tasto disattivato con zero; le non spuntate restano «Da inviare» — verifica nel browser del Task 3.

---

### Task 1: Calcoli (date, colori, stato)

**File:**
- Modifica: `app/comune.js`, `app/regole.js`, `app/onsite.js`
- Modifica: `test/comune.test.js`, `test/regole.test.js`, `test/onsite.test.js`

**Interfacce:**
- Produce:
  - `DO.martedi(iso) → iso`: martedì uguale o precedente.
  - `DO.grigliaMese('aaaa-mm') → Array<Array<{ data, delMese }>>`: settimane lunedì → domenica che coprono il mese (4–6), `delMese` vero per i giorni del mese.
  - `DO.regole.PALETTE` (i 12 colori dei vincoli globali), `DO.regole.coloreCompetizione(nome, regole) → '#rrggbb'`: colore scelto della competizione se valido, altrimenti `PALETTE[hash(nome) % 12]` con hash stabile sul testo (somma dei codici carattere pesata, senza `Math.random`); nome vuoto → `#94a3b8`.
  - `complete()` normalizza `competizioni[].colore` a `'#rrggbb'` minuscolo oppure `''`.
  - `DO.regole.statoCalendario(e, oggi, giorniBlocco) → 'verde' | 'blu' | 'rosso' | 'arancione' | ''`: annullato → `''`; confermato e non `daSostituire` → `verde`; con operatore, stato `assegnato`/`convocato`, non `daSostituire` → `blu`; altrimenti `DO.bloccato(e.data, oggi, giorniBlocco)` ? `rosso` : `arancione`.
  - `DO.onsite.statoCalendarioOnsite(d, oggi, giorniBlocco)` con gli stessi valori: annullata → `''`; nessun posto libero → `verde`; almeno un accettato → `blu`; altrimenti rosso/arancione sul giorno `da`.
  - `DO.onsite.COLORE = '#5b34c9'`.

- [ ] **Passo 1: scrivere le prove**:
  - `comune.test.js` `inizio settimana martedì`: `martedi('2026-10-12')` (lun) → `'2026-10-06'`; `('2026-10-13')` (mar) → `'2026-10-13'`; `('2026-10-11')` (dom) → `'2026-10-06'`; `('2027-01-04')` (lun) → `'2026-12-29'`; `('2026-10-26')` (lun dopo il cambio d'ora) → `'2026-10-20'`.
  - `comune.test.js` `griglia del mese`: `grigliaMese('2026-10')` → 5 settimane, primo giorno `{ data: '2026-09-28', delMese: false }`, ultimo `'2026-11-01'`, `'2026-10-01'` con `delMese: true`; `'2026-03'` → 6 settimane da `'2026-02-23'` a `'2026-04-05'`; `'2027-02'` → 4 settimane da `'2027-02-01'` a `'2027-02-28'`, tutte `delMese`.
  - `regole.test.js` `colore delle competizioni`: stesso nome due volte → stesso colore, compreso in `PALETTE`; `R.complete({ competizioni: [{ nome: 'Serie A', colore: '#FF0000' }] })` → colore `'#ff0000'` e `coloreCompetizione('Serie A', …)` → `'#ff0000'`; colore `'rosso'` o assente → `''` e colore automatico; competizione sconosciuta → colore in `PALETTE`; nome vuoto → `'#94a3b8'`.
  - `regole.test.js` `stato nel calendario` (oggi `'2026-10-09'`, N = 3): confermato → `verde`; confermato + `daSostituire` 10/10 → `rosso`; `assegnato` con operatore → `blu`; `convocato` → `blu`; `da-assegnare` 12/10 → `rosso`; `da-assegnare` 13/10 → `arancione`; `rifiutato` 20/10 → `arancione`; `annullato` → `''`; `da-assegnare` 01/10 (passato) → `rosso`.
  - `onsite.test.js` `stato dell'on-site nel calendario`: posti TL 1 OP 1 tutti presi → `verde`; uno preso → `blu`; nessuno con `da` 12/10 → `rosso`, con `da` 20/10 → `arancione`; `annullata` → `''`.
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso FAIL sulle nuove prove (`DO.martedi is not a function`, …).
- [ ] **Passo 3: implementare** le funzioni dell'interfaccia (esportarle negli oggetti esistenti).
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: commit** `git add app/comune.js app/regole.js app/onsite.js test/ && git commit -m "Convocazioni: calcoli per settimana martedì–lunedì, colori e stato nel calendario"`.

### Task 2: Settimana martedì–lunedì, fasce colorate, colori nelle impostazioni

**File:**
- Modifica: `app/convocazioni.js` (variabile della settimana e navigazione; fascia `--comp` sulle righe; righe on-site viola; `vaiA`)
- Modifica: `app/impostazioni.js`, `admin.html` (colonna colore in Competizioni e sport), `app/stile.css`

**Interfacce:**
- Consuma: `DO.martedi`, `DO.regole.coloreCompetizione`, `DO.onsite.COLORE` (Task 1).

- [ ] **Passo 1: implementare**:
  - in `convocazioni.js` la settimana parte da `DO.martedi(…)` ovunque oggi si usa `DO.lunedi` (inizializzazione, «Oggi», `vaiA`); il resto (frecce ±7, `DO.settimana(inizio)`, `DO.etichettaSettimana(inizio)`) resta com'è;
  - ogni `.ev-riga` evento riceve `style="--comp: <coloreCompetizione(e.competizione)>"` e una fascia sinistra di 4 px in CSS (`box-shadow: inset 4px 0 0 var(--comp)`); le righe on-site usano `DO.onsite.COLORE`;
  - in Competizioni e sport una colonna con `<input type="color" data-campo="colore">` che parte dal colore in uso e un tasto «Automatico» (riporta al colore automatico e segna la scelta come vuota); il salvataggio scrive `colore: ''` se automatico, altrimenti il valore; intestazione e griglia CSS della riga aggiornate (anche su telefono).
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 3: provare nel browser in demo**: oggi venerdì 9/10 la settimana mostrata è «6 – 12 ottobre»; frecce e «Oggi»; fasce di colori diversi per Serie A e Champions League, viola per un on-site; colore della Serie A cambiato in impostazioni → fascia aggiornata e colore ancora presente dopo il ricaricamento; «Automatico» lo riporta; console senza errori.
- [ ] **Passo 4: commit** `git add app/convocazioni.js app/impostazioni.js admin.html app/stile.css && git commit -m "Convocazioni: settimana da martedì a lunedì e colori per competizione"`.

### Task 3: Invio di una selezione

**File:**
- Modifica: `app/convocazioni.js` (apertura e invio di `#dlg-invia`), `admin.html` (`#evi-elenco` resta il contenitore), `app/stile.css`

- [ ] **Passo 1: implementare**: elenco per operatore con casella di gruppo (`data-gruppo="<idOperatore>"`, stato indeterminato se in parte) e casella per convocazione (`data-evento="<id>"`), tutte spuntate; riga «sab 10 ott · Roma-Lazio · Serie A · ritrovo 16:45»; note «(senza email)» e «(senza codice…)» come oggi; tasto «Invia N convocazioni» aggiornato a ogni clic e disattivato con zero; all'invio solo gli eventi spuntati (email comprese).
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 3: provare nel browser in demo**: tre convocazioni da inviare di due operatori; deselezionarne una → «Invia 2 convocazioni» e dopo l'invio quella resta «Da inviare»; deselezionare un intero operatore con la casella di gruppo; zero spuntate → tasto disattivato.
- [ ] **Passo 4: commit** `git add app/convocazioni.js admin.html app/stile.css && git commit -m "Convocazioni: invio di una selezione"`.

### Task 4: Calendario mensile a schermo intero

**File:**
- Crea: `app/calendario.js`
- Modifica: `admin.html` (tasto `#ev-calendario` «Calendario» nella barra delle Convocazioni; livello `#calendario` con barra `#cal-prec`, `#cal-titolo`, `#cal-succ`, `#cal-oggi`, legenda, `#cal-schermo`, `#cal-chiudi`, griglia `#cal-griglia`, riquadro `#cal-dettagli`; script `app/calendario.js?v=20`; `?v=19` → `?v=20` anche in `index.html`)
- Modifica: `app/convocazioni.js` (apertura con il giorno di riferimento della settimana; espone `vaiA` già esistente), `app/stile.css`, `README.md` (uso quotidiano)

**Interfacce:**
- Consuma: `DO.grigliaMese`, `DO.regole.statoCalendario`, `DO.regole.coloreCompetizione`, `DO.onsite.statoCalendarioOnsite`, `DO.onsite.COLORE`, `DO.onsite.etichettaPosti` (Task 1 e blocco 3); `DO.admin` (`eventi`, `onsite`, `operatori`, `regole`, `operativo`, `mostra`); `DO.onsiteAdmin.apri`.
- Produce: `DO.calendario = { apri(dataRiferimento) }`.

- [ ] **Passo 1: implementare** `app/calendario.js`:
  - livello a tutta finestra (fisso, sopra la dashboard), apertura sul mese di `dataRiferimento`, frecce di mese, «Oggi», legenda (verde confermato, blu in attesa di conferma, arancione senza operatore, rosso senza operatore a ridosso), «Schermo intero» con `requestFullscreen` (nascosto se non disponibile), «Chiudi» ed Esc;
  - celle da `DO.grigliaMese`; in ogni giorno gli eventi non annullati e i giorni on-site, ordinati per orario (partita: `orario`; supervisione: ritrovo; on-site prima degli altri), al massimo 4 voci poi «+N altri»; testo delle voci come la spec §4 («20:45 Roma-Lazio», «10:00 Supervisione Serie A», «ON-SITE · Italia-Francia» / «ON-SITE · Travel Day · Roma»); classe di stato (`cal-verde`…) e `--comp` per il bordino;
  - riquadro dei dettagli al passaggio del mouse (al tocco sul telefono) con i campi della spec §4;
  - clic su evento → chiude e apre la settimana del giorno (`DO.admin.mostra('convocazioni')` e `vaiA`); su on-site → `DO.onsiteAdmin.apri(id)`; su «+N altri» → settimana del giorno;
  - si ridisegna quando la dashboard riceve aggiornamenti (`DO.admin.registra({ aggiorna })`) se è aperto.
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` e `node --check app/calendario.js` → atteso PASS.
- [ ] **Passo 3: provare nel browser in demo**: apertura dal tasto, mese corrente con righe lunedì–domenica, colori di stato attesi su eventi confermati, assegnati, scoperti vicini e lontani, voce ON-SITE viola, «+N altri» con molti eventi in un giorno, riquadro dei dettagli, clic su evento e su on-site, Esc, navigazione dei mesi, formato telefono (375 px) senza scorrimento orizzontale, console senza errori.
- [ ] **Passo 4: commit** `git add app/calendario.js admin.html index.html app/convocazioni.js app/stile.css README.md && git commit -m "Convocazioni: calendario mensile a schermo intero"`.
