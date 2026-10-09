# Blocco 5 — Operatori e compensi: piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:subagent-driven-development (consigliata) oppure superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** tipo di compenso per competizione (Diurno, Notturno, Maggiorato, Dimezzato) al posto di «UEFA ½», ruoli mostrati come «Remote TL/OP», tasto «Invia mail» che apre l'app di posta con il messaggio del codice.

**Architettura:** calcoli e testi puri in `app/regole.js` (dashboard) e `app/comune.js` (indirizzo `mailto:`), provati con `node --test`; schermate in `admin.html`, `app/admin.js`, `app/impostazioni.js`, `app/convocazioni.js`, `app/riepilogo.js`, provate in demo.

**Tecnologie:** JavaScript nel browser senza framework, Node 26 (`node:test`).

**Spec:** `docs/superpowers/specs/2026-10-09-operatori-compensi-design.md`

## Vincoli globali

- Tipi di compenso: `'diurno' | 'notturno' | 'maggiorato' | 'dimezzato'`; etichette «Diurno», «Notturno», «Maggiorato», «Dimezzato (½ diurno)»; cartellino «Dimezzato», colonna «Dimezzati».
- Ordine del gettone: Maggiorato sull'evento → competizione maggiorato → dimezzato (½ diurno) → notturno → diurno (notturno se il ritrovo è nelle ore notturne).
- Migrazione: competizione senza `compenso` → `uefa: true` ? `'dimezzato'` : `'diurno'`; `compenso` non valido → `'diurno'`; `uefa` non si scrive più.
- Ruoli mostrati: `TL` → «Remote TL», `OP` → «Remote OP»; dati invariati; righe on-site restano «On-site TL/OP».
- Email: oggetto «TGI Sport · il tuo codice per le disponibilità»; testo «Ciao <nome>, da ora puoi indicare le tue disponibilità settimanali per TGI Sport qui:\n<link>\n\nIl tuo codice personale è <codice>: non condividerlo.»; senza email: «Nessuna email registrata: scrivi tu il destinatario.»; link «Copia il testo».
- Prove: `node --test test/*.test.js`. Pubblicazione: `?v=20` → `?v=21`. Il controllo `pre-commit` deve passare.

## Punti da sorvegliare in revisione

1. **Competizione con `uefa: true` ma `compenso` già scelto a mano** (es. Diurno): vale il `compenso`, la migrazione non lo sovrascrive — prova nel Task 1.
2. **Ritrovo notturno in una competizione Dimezzata**: metà del diurno, non notturno — prova nel Task 1.
3. **Valore di `compenso` sconosciuto** (dati scritti a mano o vecchi): Diurno, nessun errore — prova nel Task 1.
4. **Nome dell'operatore con accenti, apostrofi o «&»** nell'email: testo intatto in Outlook — prova nel Task 3.
5. **Riepilogo e Excel dopo il cambio da `uefa` a `dimezzato`**: conteggi della colonna «Dimezzati» corretti, nessun «undefined» — verifica nel browser del Task 1.

---

### Task 1: Tipo di compenso per competizione

**File:**
- Modifica: `app/regole.js` (`PREDEFINITE.competizioni` con `compenso`, `TIPI`, `complete`, `gettone`, nuova `compensoCompetizione`, esportazione), `app/impostazioni.js` (menu Compenso; importazione dal file), `app/convocazioni.js` e `app/riepilogo.js` (cartellino e colonne), `admin.html` (intestazione «Compenso», nota delle tariffe)
- Modifica: `test/regole.test.js`

**Interfacce:**
- Produce: `DO.regole.TIPI = { diurno, notturno, maggiorato, dimezzato }`; `DO.regole.compensoCompetizione(nome, regole) → tipo`; `gettone(e, operatore, regole)` restituisce `tipo` fra i quattro; `DO.regole.uefa` non esiste più (chi lo usava passa a `compensoCompetizione(…) === 'dimezzato'`).

- [ ] **Passo 1: scrivere le prove** in `test/regole.test.js` (regole con Serie A `diurno`, Champions `dimezzato`, Coppa `notturno`, Finale `maggiorato`; operatore P.IVA: diurno 140, notturno 210, maggiorato 210):
  - `compenso per tipo di competizione`: Serie A ore 20:45 (ritrovo 16:45) → `diurno` 140; Serie A ore 02:00 (ritrovo 22:00) → `notturno` 210; Champions ore 02:00 → `dimezzato` 70; Coppa ore 15:00 → `notturno` 210; Finale ore 15:00 → `maggiorato` 210; Champions con evento `gettone: 'maggiorato'` → `maggiorato`; Coppa con evento maggiorato → `maggiorato`; competizione sconosciuta ore 15:00 → `diurno`.
  - `migrazione da UEFA ½`: `complete({ competizioni: [{ nome: 'A', uefa: true }, { nome: 'B' }, { nome: 'C', uefa: true, compenso: 'diurno' }, { nome: 'D', compenso: 'boh' }] })` → `compenso` `['dimezzato', 'diurno', 'diurno', 'diurno']`; `TIPI.dimezzato === 'Dimezzato (½ diurno)'`; `R.uefa === undefined`.
  - aggiornare le prove esistenti che usano `uefa: true` per Champions solo se necessario (devono restare verdi per via della migrazione).
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso FAIL sulle nuove prove.
- [ ] **Passo 3: implementare** in `regole.js`; poi sostituire gli usi di `R.uefa` (cartellino «UEFA ½» → «Dimezzato» in `convocazioni.js` e `riepilogo.js`), il tipo `uefa` → `dimezzato` in `riepilogo.js` (colonne e Excel «Dimezzati»), il menu Compenso al posto della casella in `impostazioni.js` (salvataggio di `compenso` senza `uefa`; nuova competizione `diurno`; importazione: nomi Champions/Europa/Conference → `dimezzato`), intestazione e nota in `admin.html`.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: provare nel browser in demo**: menu Compenso con Champions su Dimezzato, cambio salvato e ricaricato; cartellino «Dimezzato» su un evento Champions; Riepilogo con colonna «Dimezzati» e conteggi corretti; console senza errori.
- [ ] **Passo 6: commit** `git add app/ admin.html test/regole.test.js && git commit -m "Compensi: tipo di compenso per competizione al posto di UEFA ½"`.

### Task 2: Ruoli «Remote TL» e «Remote OP»

**File:**
- Modifica: `app/regole.js` (`nomeRuolo`, `righeMese`), `app/admin.js` (tabella operatori), `admin.html` (menu ruolo, nota dei turni di supervisione), `app/riepilogo.js` (colonne Ruolo a schermo e in Excel), `app/convocazioni.js` (menu dei turni di supervisione, se mostra il ruolo)
- Modifica: `test/regole.test.js`

**Interfacce:**
- Produce: `DO.regole.nomeRuolo(ruolo) → 'Remote TL' | 'Remote OP'` (qualunque valore diverso da `'TL'` → «Remote OP»).

- [ ] **Passo 1: scrivere le prove**: `nome dei ruoli remoti` (`nomeRuolo('TL')` → `'Remote TL'`, `'OP'` → `'Remote OP'`, `''` → `'Remote OP'`); aggiornare `esportazione mensile…` (colonna Ruolo `'Remote OP'` / `'Remote TL'`), lasciando invariata la prova on-site (`'On-site TL'`).
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso FAIL.
- [ ] **Passo 3: implementare** `nomeRuolo` e usarlo in `righeMese` e nei punti della lista File; menu ruolo «Remote OP – operatore» / «Remote TL – team leader (anche supervisione)»; nota «Si possono assegnare solo operatori con ruolo Remote TL.»; cartellino della tabella con il nome completo.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: provare nel browser in demo**: tabella operatori, finestra operatore, Riepilogo con «Remote TL/OP».
- [ ] **Passo 6: commit** `git add app/ admin.html test/regole.test.js && git commit -m "Operatori: ruoli remoti chiamati Remote TL e Remote OP"`.

### Task 3: Tasto «Invia mail» e istruzioni per Outlook

**File:**
- Modifica: `app/comune.js` (`mailto`), `app/admin.js` (finestra del codice), `admin.html` (`#dlg-codice`: tasto `#cod-invia-mail` «Invia mail», link `#cod-copia-msg` «Copia il testo», nota `#cod-senza-email`), `README.md` (Outlook come app di posta predefinita su Mac e Windows), `index.html` e `admin.html` (`?v=21`)
- Modifica: `test/comune.test.js`

**Interfacce:**
- Produce: `DO.mailto(a, oggetto, testo) → string`: `'mailto:' + indirizzo + '?subject=' + … + '&body=' + …`, parti codificate con `encodeURIComponent` (con `@` lasciato in chiaro nell'indirizzo), a capo come `%0D%0A`; indirizzo vuoto → `'mailto:?subject=…'`.

- [ ] **Passo 1: scrivere la prova** `indirizzo mailto con oggetto e testo`: `DO.mailto('m@x.it', 'Oggetto è', "Ciao Nicolò, l'invito & co\nRiga 2")` → `"mailto:m@x.it?subject=Oggetto%20%C3%A8&body=Ciao%20Nicol%C3%B2%2C%20l'invito%20%26%20co%0D%0ARiga%202"`; `DO.mailto('', 'X', 'Y')` → `'mailto:?subject=X&body=Y'`.
- [ ] **Passo 2: eseguire** `node --test test/comune.test.js` → atteso FAIL (`DO.mailto is not a function`).
- [ ] **Passo 3: implementare** `mailto` e la finestra: «Invia mail» imposta `location.href = DO.mailto(email, oggetto, testo)` con i testi dei vincoli globali; nota senza email; «Copia il testo» copia lo stesso testo; README con i passi Mac (Outlook → Impostazioni → Generali → Imposta come predefinita; oppure Mail → Impostazioni → Generali → Lettore email predefinito) e Windows (11: Impostazioni → App → App predefinite → MAILTO → Outlook; 10: App predefinite → Posta elettronica → Outlook).
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: provare nel browser in demo**: «Crea codice»/«Nuovo codice» → finestra con «Invia mail» (l'indirizzo `mailto:` generato contiene destinatario, oggetto e testo; si controlla intercettando la navigazione), «Copia il testo», nota per un operatore senza email.
- [ ] **Passo 6: commit** `git add app/comune.js app/admin.js admin.html index.html README.md test/comune.test.js && git commit -m "Operatori: tasto Invia mail con il messaggio del codice"`.
