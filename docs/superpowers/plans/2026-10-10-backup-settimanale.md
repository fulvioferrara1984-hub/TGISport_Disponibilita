# Blocco 8 — Backup settimanale in Excel: piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:subagent-driven-development (consigliata) oppure superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** ogni venerdì alle 18 lo script delle email manda ai supervisori un `.xlsx` con gli eventi della stagione, on-site, operatori e impostazioni; l'importazione della dashboard lo riconosce e ripristina gli eventi senza duplicati.

**Architettura:** tutto il lavoro del backup in `backend/Codice.gs`: righe dei fogli (funzione pura), file `.xlsx` scritto a mano (parti XML + `Utilities.zip`), invio con allegato, attivatore del venerdì, impostazioni nelle proprietà dello script; provato con `node --test` nel contesto `vm` di `test/gs.js` (che riceve uno `Utilities.zip` vero). Dashboard: riga di stato pura in `app/regole.js`, casella e tasto in Impostazioni, importazione in modalità backup in `app/impostazioni.js` (provata con l'impianto di `test/importazione.test.js`).

**Tecnologie:** Google Apps Script V8, JavaScript nel browser, Node 26 (`node:test`, `node:vm`, `node:zlib`).

**Spec:** `docs/superpowers/specs/2026-10-10-backup-settimanale-design.md`

## Vincoli globali

- Stagione dal `aaaa-08-01` (agosto dell'anno in corso o del precedente); giorno di Excel = giorni dal 1899-12-30.
- Nome del file `Backup_TGI_Sport_<aaaa-mm-gg>.xlsx` (data italiana dell'invio); tipo `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Fogli e colonne come la spec §1 (Convocazioni A–R, On-site, Operatori, Impostazioni A/B, D/E, G, I–M). Stati: `da-assegnare` «Da assegnare», `assegnato` «Da inviare», `convocato` «In attesa di risposta», `confermato` «Confermato», `rifiutato` «Rifiutato», `annullato` «Annullato». Tipi: «Partita», «Remote TL», «Remote Support».
- Proprietà dello script: `BACKUP_ATTIVO` (`SI`/`NO`, messo a `SI` da `attivaPromemoria` se mancante), `ULTIMO_BACKUP` (JSON `{ quando, eventi, annullati, deployment, destinatari, errore }`). Attivatore `inviaBackup`: venerdì, ore 18, `Europe/Rome`.
- Testi: oggetto «Backup eventi TGI Sport · <giorno lungo>»; «Per ripristinare: dashboard → Impostazioni → Importa dal file Excel → scegli questo file.»; «Nessun indirizzo dei supervisori in Impostazioni → Notifiche email.»; righe di stato e tasto della spec §1; esito «Backup inviato a N indirizzi.»; anteprima «Backup del <giorno>: N eventi da aggiornare, M da ricreare».
- Prove: `node --test test/*.test.js`. Pubblicazione: `?v=25` → `?v=26`. Il controllo `pre-commit` deve passare.

## Punti da sorvegliare in revisione

1. **Evento con caratteri speciali** (`&`, `<`, apostrofi, accenti, emoji nelle note) nel foglio: XML valido e testo intatto — prova nel Task 2.
2. **Venerdì con la lettura di Firebase che fallisce o senza indirizzi**: nessun invio, motivo in «Ultimo backup non riuscito: …», nessuna email a vuoto — prova nel Task 2.
3. **Reimport dello stesso backup due volte, o di un backup in una piattaforma che ha già quegli eventi**: nessun duplicato, eventi in più non toccati — prova nel Task 3.
4. **Evento con ritrovo scritto a mano e regole cambiate dopo**: al ripristino il ritrovo resta scritto a mano; un ritrovo automatico resta automatico e segue le regole — prova nel Task 3.
5. **File della stagione** (senza «ID evento"): importazione identica a prima — la prova esistente `test/importazione.test.js` deve restare verde, più un controllo che non entri in modalità backup (Task 3).

---

### Task 1: Righe del backup (`backend/Codice.gs`)

**File:**
- Modifica: `backend/Codice.gs`
- Crea: `test/backup.test.js`

**Interfacce:**
- Produce nello script: `stagioneDa(oggi) → 'aaaa-08-01'`; `giornoExcel(iso) → number`; `righeBackup(d, adesso) → { titolo, convocazioni, onsite, operatori, impostazioni, conteggi: { eventi, annullati, deployment } }` con `d = { eventi, onsite, compensi, operatori, regole }` (oggetti come `daFirestore`); celle data come `{ data: 'aaaa-mm-gg' }`, numeri come numeri, il resto testo. Ritrovo G = `convocazione || convocazioneCalcolata`; fine I = `fine || fineCalcolata`; Q/R = `convocazione` / `fine` scritti. Righe mansione (Remote TL, Remote Support) sempre presenti in Impostazioni (dalle regole o con i valori iniziali: Diurno, 0 prima, durata 6 o la vecchia durata della supervisione). Ore vuote delle competizioni = valori generali (4 / 2).
- [ ] **Passo 1: scrivere le prove** in `test/backup.test.js` (con `carica()` di `test/gs.js`): `stagione e giorni di Excel` (`'2026-10-16'` → `'2026-08-01'`, `'2027-03-02'` → `'2026-08-01'`, `'2026-07-31'` → `'2025-08-01'`; `giornoExcel('2026-10-18') === 46313`); `foglio Convocazioni` (intestazioni A–R alla riga 2; una partita confermata maggiorata con nota, un turno Remote TL vecchio con «Serie A», un Remote Support da assegnare, un annullato, una rifiutata da sostituire: valori di ogni colonna, ordine per data e ritrovo, `conteggi`); `foglio On-site` (un deployment di 2 giorni con posti, accettati per nome, stato e compenso); `foglio Operatori` (ruoli con i nomi nuovi, attivo SI/NO, on-site); `foglio Impostazioni` (tariffe con le etichette dell'importazione, notturno, tariffa on-site, operatori in D/E, sport in G, competizioni e mansioni in I–M con ore completate).
- [ ] **Passo 2: eseguire** `node --test test/backup.test.js` → atteso FAIL.
- [ ] **Passo 3: implementare** in `Codice.gs`.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: commit** `git add backend/Codice.gs test/backup.test.js && git commit -m "Backup: righe dei fogli Convocazioni, On-site, Operatori, Impostazioni"`.

### Task 2: File, invio, attivatore, impostazioni dello script

**File:**
- Modifica: `backend/Codice.gs`, `test/gs.js` (`Utilities.newBlob(dati, tipo, nome)` completo, `Utilities.zip` che scrive uno zip vero senza compressione con `zlib.crc32`, `ScriptApp.WeekDay`, `onWeekDay` nella catena degli attivatori), `test/backup.test.js`

**Interfacce:**
- Consuma: Task 1.
- Produce: `fileBackup(fogli, nome) → Blob`; `leggiDatiBackup(oggi) → d`; `giroBackup(adesso, opzioni) → { inviato, eventi, deployment, destinatari } | { saltato: 'spento' }` (opzioni `{ forza }`; errore → `ULTIMO_BACKUP` con `errore` e rilancio); `inviaBackup()` (attivatore); azione `inviaBackupOra` in `doPost` (solo supervisori, `forza: true`); `leggiImpostazioni()` con `backupAttivo`, `ultimoBackup`; `impostazioniDashboard()` con `backupProgrammato`; `salvaImpostazioni` con `backupAttivo`; `attivaPromemoria` che crea anche l'attivatore del venerdì.
- [ ] **Passo 1: scrivere le prove** in `test/backup.test.js`: `file xlsx` (parti dello zip: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml` con 4 fogli nell'ordine, `xl/styles.xml`, `xl/worksheets/sheet1.xml` con le intestazioni e una data con lo stile data; nome e tipo del blob; testo `A&B <x> l'«é» 🙂` reso con le entità e intatto); `invio del venerdì` (Firebase finto come in `promemoria.test.js`: email ai supervisori con oggetto, testo e allegato; `ULTIMO_BACKUP` con i conteggi); `backup spento e invio forzato`; `lettura negata o nessun indirizzo` (nessuna email, `ULTIMO_BACKUP.errore` con il messaggio); `attivatore del venerdì` (dopo due `attivaPromemoria` un solo `inviaBackup` con `onWeekDay FRIDAY`, `atHour 18`, `Europe/Rome`, e `BACKUP_ATTIVO` a `SI`); `invia un backup adesso solo ai supervisori`; `impostazioni del backup` (lettura, salvataggio, `backupProgrammato`).
- [ ] **Passo 2: eseguire** `node --test test/backup.test.js` → atteso FAIL.
- [ ] **Passo 3: implementare** in `Codice.gs` e `test/gs.js`.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: commit** `git add backend/Codice.gs test/gs.js test/backup.test.js && git commit -m "Backup: file xlsx, invio del venerdì, invio immediato e impostazioni dello script"`.

### Task 3: Dashboard, ripristino, istruzioni

**File:**
- Modifica: `app/regole.js` (`statoBackup`), `test/regole.test.js`, `admin.html` (in Notifiche email: `#imp-backup`, nota, `#imp-backup-stato`, `#imp-backup-ora`), `app/admin.js`, `app/dati-firebase.js` e `app/demo.js` (`inviaBackupOra`, impostazioni del backup nella demo), `app/impostazioni.js` (modalità backup), `test/importazione.test.js`, `README.md`, `index.html` e `admin.html` (`?v=26`)

**Interfacce:**
- Consuma: Task 2 (campi delle impostazioni, azione `inviaBackupOra`).
- Produce: `DO.regole.statoBackup(imp) → testo`; `DO.dati.inviaBackupOra() → { destinatari, eventi }`.
- [ ] **Passo 1: scrivere le prove**: `riga dell'ultimo backup` in `test/regole.test.js` (script vecchio, invio non attivo, nessun backup, riuscito con data e conteggi, non riuscito con motivo); in `test/importazione.test.js` `ripristino da un backup` (righe con ID, stati, tipi, «SI» di maggiorato e da sostituire, ritrovo scritto solo in Q; foglio Operatori; foglio Impostazioni con J–M: eventi con gli id del file, `stato`, `tipo`, `gettone`, `daSostituire`, `convocazione` solo dove Q è pieno, `convocazioneCalcolata` ricalcolata, `inviata`, operatori nuovi con ruolo e contatti, competizione con compenso e ore dal file; due importazioni consecutive → stessi id) e `il file della stagione non entra in modalità backup`.
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso FAIL sulle prove nuove.
- [ ] **Passo 3: implementare** `statoBackup`, la parte di Impostazioni (casella salvata con `salvaImpostazioni` solo se lo script la conosce, riga di stato, tasto con esito), `inviaBackupOra` in Firebase (`email('inviaBackupOra')`) e demo, la modalità backup dell'importazione con l'anteprima, il README (Uso quotidiano, Ripristino, Messa in linea: sito → script → `attivaPromemoria`), `?v=26`.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS; `node --check` su `app/*.js`.
- [ ] **Passo 5: provare nel browser in demo**: casella, riga e tasto in Impostazioni; un file `.xlsx` generato con `fileBackup` dal contesto di prova (salvato fuori dal repository) si apre nella demo con l'importazione: anteprima «Backup del …», nessun duplicato al secondo import; console senza errori.
- [ ] **Passo 6: commit** `git add app/ admin.html index.html test/ README.md && git commit -m "Backup: impostazioni nella dashboard, ripristino dall'importazione, istruzioni"`.
