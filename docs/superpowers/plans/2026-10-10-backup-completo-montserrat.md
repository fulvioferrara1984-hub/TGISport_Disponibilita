# Blocco 9 — Backup completo e Montserrat: piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** disponibilità e on-site ripristinabili dal backup, copia su Drive, niente più `uefa`, Montserrat con scala unica.

**Architettura:** lo script (`backend/Codice.gs`) scrive i nuovi fogli e salva la copia su Drive con le API REST (`UrlFetchApp` + gettone del proprietario, autorizzazione `drive.file`); la dashboard (`app/impostazioni.js`) legge i nuovi fogli in modalità backup e li passa a `DO.dati.importa`, che scrive con unione (disponibilità) e documenti interi (on-site); demo allineata; foglio di stile riscritto sulla scala unica.

**Tecnologie:** Google Apps Script V8, JavaScript nel browser, Node 26 (`node:test`, `node:vm`).

**Spec:** `docs/superpowers/specs/2026-10-10-backup-completo-montserrat-design.md`

## Vincoli globali

- Stagione dal `aaaa-08-01`; date nei fogli come date di Excel; testi neutri, senza scuse.
- Fogli nell'ordine: Convocazioni, On-site, Operatori, Impostazioni, Disponibilità. Stati disponibilità: `D` Disponibile, `P` Parziale, `A` Non disponibile.
- Cartella Drive «Backup Disponibilità Ops», proprietà `BACKUP_CARTELLA`, 52 file tenuti; `ULTIMO_BACKUP.drive`: `'salvato'` oppure `'errore: <motivo>'`.
- `?v=27` → `?v=28`; `node --test test/*.test.js` verde; `pre-commit` verde.

## Punti da sorvegliare in revisione

1. Backup di versioni precedenti (senza Disponibilità, senza colonna O di On-site): importazione invariata, messaggio chiaro sugli on-site.
2. Disponibilità di un operatore che non c'è più nella piattaforma né nel foglio Operatori: riga saltata e contata, nessun documento orfano.
3. Drive con errore a metà (cartella cancellata, 401, 500): il backup per email resta riuscito e la dashboard mostra il motivo.
4. Liste di ID nelle celle (spazi, virgole doppie, ID non validi): filtrate con le stesse regole di `idValido`.
5. Montserrat è più largo di Archivo: colonne a larghezza fissa (orari, stato, competizioni) e schede di navigazione senza testo che esce.

---

### Task 1: Fogli Disponibilità e On-site completo (`backend/Codice.gs`)

**Interfacce — produce:** `righeBackup(d, adesso)` con `d.disponibilita = [{ id, giorni }]` → in più `disponibilita` (righe A–E con intestazione) e `conteggi.operatoriDisponibilita`; `onsite` con colonne O–V; `leggiDatiBackup` legge `elencoAdmin('disponibilita')`; `giroBackup` scrive cinque fogli; testo dell'email con «e le disponibilità di M operatori».

- [ ] Prove in `test/backup.test.js`: `foglio Disponibilità` (due operatori, giorni prima del 1° agosto esclusi, stato e nota, ordine nome/data, ID in E, operatore senza nome → nome vuoto ma ID presente); `foglio On-site con gli ID` (colonne O–V con liste di ID unite da `, `, note, creato); `file con cinque fogli` (ordine nel `workbook.xml`); email con le disponibilità.
- [ ] Eseguire → FAIL; implementare; `node --test test/*.test.js` → PASS; commit.

### Task 2: Copia su Drive e riga dell'ultimo backup

**Interfacce — produce:** `salvaSuDrive(blob, nome) → { id }` (crea/ritrova la cartella, cestina lo stesso nome e i più vecchi oltre 52); `autorizzaDrive()` da eseguire nell'editor (crea la cartella, scrive nel registro); `giroBackup` registra `drive`; manifesto con `https://www.googleapis.com/auth/drive.file`; `DO.regole.statoBackup` aggiunge «· copia su Drive» / «· copia su Drive non riuscita: …».

- [ ] Prove in `test/backup.test.js` con `risposte` finte per `https://www.googleapis.com/drive/v3/files…` e `https://www.googleapis.com/upload/drive/v3/files…`: `copia su Drive: cartella creata e salvata in BACKUP_CARTELLA`; `copia su Drive: cartella ritrovata, stesso nome nel cestino, oltre 52 nel cestino`; `copia su Drive non riuscita: backup riuscito con il motivo`; `autorizzaDrive`. In `test/regole.test.js`: `riga dell'ultimo backup con la copia su Drive`.
- [ ] FAIL → implementare (in `test/gs.js` le risposte finte accettano anche `PATCH`/`DELETE` e corpi binari se serve) → PASS; commit.

### Task 3: Ripristino di disponibilità e on-site (dashboard, archivio, demo)

**Interfacce — consuma:** fogli dei Task 1. **Produce:** il pacchetto dell'importazione ha in più `disponibilitaBackup: [{ id, giorni }]` e `onsite: [{ id, …documento, compenso }]` (vuoti se il file non li ha); `DO.dati.importa` scrive `disponibilita/{id}` con `{ giorni }` e `merge: true`, `onsite/{id}` per intero e `onsiteRiservato/{id}` `{ compenso }`; demo uguale.

- [ ] Prove in `test/importazione.test.js`: `ripristino delle disponibilità` (per ID, per nome, operatore ricreato dal foglio Operatori, righe saltate contate, anteprima); `ripristino degli on-site` (presente e mancante, liste di ID filtrate, stato, compenso, gruppo senza luogo saltato, anteprima); `backup di una versione precedente: on-site non reimportati, messaggio`; andata e ritorno estesa (disponibilità e on-site dallo script). In `test/firebase.test.js`: `importazione: disponibilità unite e on-site con il compenso` (scritture `set` con `{ merge: true }` e documenti interi). In `test/demo.test.js` se esiste un'importazione: unione dei giorni.
- [ ] FAIL → implementare → PASS; prova nel browser in demo con un file generato da `fileBackup`; commit.

### Task 4: Campo «uefa»

- [ ] Prove in `test/regole.test.js`: `uefa non si scrive più` (nessuna competizione completata ha `uefa`) e `uefa vecchio senza compenso resta Dimezzato`; la prova di compatibilità con la versione 21 si sostituisce.
- [ ] FAIL → togliere `uefa` da `regole.js`, `impostazioni.js` (editor, importazione della stagione e del backup) → PASS; commit.

### Task 5: Montserrat, scala unica, pubblicazione

- [ ] `app/font/montserrat-latin.woff2` + `OFL.txt` di Montserrat; tolti i file di Archivo; `@font-face` e `preload` aggiornati.
- [ ] `app/stile.css`: variabili `--t-12 … --t-28`; ogni `font-size` del foglio portato a una delle cinque grandezze (comprese le regole per il telefono), niente `font-stretch`; titoli e orari 700 con `tabular-nums`; campi a 16 px sotto i 760 px.
- [ ] Foto (computer 1440, telefono 390) di accesso, pagina operatori, Convocazioni, calendario, Disponibilità, Aggiornamenti, Riepilogo, Operatori, Impostazioni, una finestra; correzioni dove il testo esce.
- [ ] README (backup: Disponibilità, On-site, Drive, `autorizzaDrive`; File: Montserrat), `?v=28`; `node --test test/*.test.js` verde; commit.
