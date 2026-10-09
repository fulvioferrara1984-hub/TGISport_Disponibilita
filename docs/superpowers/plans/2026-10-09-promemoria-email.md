# Blocco 2 — Promemoria email automatici: piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:subagent-driven-development (consigliata) oppure superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** ogni mattina lo script delle email legge gli eventi remoti dei prossimi X giorni e manda un promemoria agli operatori con convocazioni da confermare e un riepilogo ai supervisori di tutto ciò che non è coperto.

**Architettura:** tutto il lavoro automatico sta in `backend/Codice.gs` (Google Apps Script V8): funzioni pure per selezione ed email, una lettura di Firestore via REST con il gettone dell'account proprietario, un giro giornaliero con attivatore. La dashboard (`admin.html`, `app/admin.js`) aggiunge interruttore, giorni e riga di stato nelle impostazioni email; la demo (`app/demo.js`) simula gli stessi campi. Le prove girano con `node --test` caricando `Codice.gs` in un contesto `vm` con le funzioni di Google simulate.

**Tecnologie:** Google Apps Script V8 (UrlFetchApp, MailApp, PropertiesService, ScriptApp, Utilities), API REST di Firestore v1, JavaScript nel browser senza framework, Node 26 (`node:test`, `node:vm`) solo per le prove.

**Spec:** `docs/superpowers/specs/2026-10-09-promemoria-email-design.md`

## Vincoli globali

- Solo eventi remoti: `tipo` `partita` o `supervisione` (senza `tipo` = partita), esclusi `stato` `annullato`.
- Finestra: eventi con `data` da oggi a oggi + X, estremi inclusi; «oggi» nel fuso `Europe/Rome`.
- X intero da 1 a 7, predefinito 3. Proprietà dello script: `PROMEMORIA_ATTIVI` (`SI`/`NO`, assente = spenti finché `attivaPromemoria` non la imposta), `PROMEMORIA_GIORNI`, `ULTIMO_PROMEMORIA` (JSON `{ giorno, quando, riepilogo, operatori }`).
- Gruppi, in quest'ordine e un solo gruppo per evento: `sostituire` (rifiutato o `daSostituire`), `senzaOperatore`, `daInviare` (`assegnato`), `inAttesa` (`convocato`).
- Firestore solo in lettura, con `ScriptApp.getOAuthToken()` e intestazione `x-goog-user-project: tgi-availability`. Nessuna modifica a `firebase/firestore.rules`.
- Nuovi permessi nel manifesto: `https://www.googleapis.com/auth/datastore`, `https://www.googleapis.com/auth/script.scriptapp`.
- Attivatore giornaliero tra le 8 e le 9, `Europe/Rome`, funzione `inviaPromemoria`.
- Testi fissati dalla spec: «Promemoria: conferma la convocazione di …», «Promemoria: N convocazioni da confermare», «Conferma sulla piattaforma», «Se non puoi partecipare, chiama il supervisore al …», «Per entrare usa il tuo codice personale.», «Promemoria convocazioni · prossimi N giorni: …», «Apri le convocazioni», «Promemoria automatici ogni mattina», «Giorni prima dell'evento», «(senza email)», «(disattivato)». Linguaggio neutro (niente «convocato/a»).
- Prove: `node --test test/*.test.js`. Ogni pubblicazione alza `?v=` in `index.html` e `admin.html` (oggi `v=16`); il controllo `pre-commit` deve passare.

## Punti da sorvegliare in revisione

1. **Dashboard vecchia in cache** (l'HTML resta fino a 10 minuti) che salva le impostazioni email senza i campi dei promemoria: non deve spegnerli né cambiare i giorni — prova nel Task 3.
2. **L'attivatore passa un oggetto evento** come primo argomento di `inviaPromemoria`: non va scambiato per la data — prova nel Task 3.
3. **Convocazione di un operatore eliminato** (`operatoreId` che non esiste più): conta come «senza operatore», nessun errore — prova nel Task 1.
4. **Esecuzione a cavallo della mezzanotte** (manuale alle 00:30 di Roma = 22:30 UTC del giorno prima): «oggi» è quello di Roma — prova nel Task 3.
5. **Titoli o note con caratteri HTML** (`<`, `&`, `"`) nelle email: sempre resi come testo — prova nel Task 2.

---

### Task 1: Selezione degli eventi (`backend/Codice.gs`, funzioni pure)

**File:**
- Modifica: `backend/Codice.gs` (nuova sezione «promemoria»)
- Crea: `test/promemoria.test.js`

**Interfacce:**
- Produce:
  - `aggiungiGiorni(iso: string, n: number) → string` (`aaaa-mm-gg`, aritmetica in UTC a mezzogiorno).
  - `daFirestore(doc) → object`: `{ id, ...campi }` dal documento REST (`stringValue`, `booleanValue`, `integerValue`→Number, `doubleValue`, `nullValue`→null, `timestampValue`→stringa, `mapValue`→oggetto, `arrayValue`→array, anche senza `values`); `id` = ultimo pezzo di `name`.
  - `selezionaPromemoria(eventi, operatori, oggi, giorni) → { gruppi: { sostituire, senzaOperatore, daInviare, inAttesa }, operatori: [{ id, nome, email, eventi }] }`. Ogni gruppo è un array di `{ evento, operatore: object|null, nota: ''|'(senza email)'|'(disattivato)' }`, ordinato per `data` poi orario (`orario` o ritrovo). `operatori[]` contiene solo chi è attivo (`attivo !== false`) con email valida (`/^[^@\s]+@[^@\s]+\.[^@\s]+$/`) e ha eventi `inAttesa`, con i suoi eventi ordinati.
- Nota per il caricamento in Node: le dichiarazioni `function` di `Codice.gs` diventano proprietà del contesto `vm`; le `const` no.

- [ ] **Passo 1: scrivere le prove** in `test/promemoria.test.js`. Funzione `carica(stub = {})` che legge `backend/Codice.gs`, crea un contesto `vm` con `console` e le simulazioni di `PropertiesService`, `MailApp`, `UrlFetchApp`, `ScriptApp`, `Utilities` (`formatDate(data, fuso, formato)` reale per `yyyy-MM-dd` e `HH:mm` tramite `Intl.DateTimeFormat`), `CacheService`, `ContentService`, e restituisce il contesto. Dati di prova: `oggi = '2026-10-09'`, `giorni = 3`, operatori `a` (Anna, `anna@x.it`), `b` (Bruno, senza email), `c` (Carla, `carla@x.it`, `attivo: false`).
  - `finestra: oggi e oggi + X inclusi, dopo e passati esclusi`: eventi `convocato` di `a` in `2026-10-08`, `2026-10-09`, `2026-10-12`, `2026-10-13` → in `inAttesa` solo `09` e `12`.
  - `solo remoti e non annullati`: `tipo: 'onsite'` escluso, senza `tipo` incluso, `stato: 'annullato'` escluso.
  - `un solo gruppo per evento`: `confermato` + `daSostituire` → `sostituire`; `rifiutato` → `sostituire`; `da-assegnare` → `senzaOperatore`; `assegnato` → `daInviare`; `convocato` → `inAttesa`; `confermato` → nessun gruppo.
  - `operatore eliminato conta come senza operatore`: `convocato` con `operatoreId: 'zzz'` → in `senzaOperatore`, `operatori` vuoto.
  - `una sola email per operatore, eventi in ordine`: due `convocato` di `a` (`10-11 18:00`, `10-10 20:45`) → `operatori` = `[{ id: 'a', eventi: [10-10, 10-11] }]`.
  - `senza email o disattivati: segnalati e non avvisati`: `convocato` di `b` → nota `'(senza email)'`; di `c` → `'(disattivato)'`; email `'x@'` → `'(senza email)'`; nessuno dei due in `operatori`.
  - `daFirestore`: documento con tutti i tipi elencati nell'interfaccia → oggetto atteso; `arrayValue: {}` → `[]`.
  - `aggiungiGiorni`: `('2026-10-30', 3)` → `'2026-11-02'`; `('2026-03-28', 2)` → `'2026-03-30'` (cambio d'ora).
- [ ] **Passo 2: eseguire** `node --test test/promemoria.test.js` → atteso FAIL (`selezionaPromemoria is not a function`).
- [ ] **Passo 3: implementare** le tre funzioni dell'interfaccia in `backend/Codice.gs`.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS di tutte le prove.
- [ ] **Passo 5: commit** `git add backend/Codice.gs test/promemoria.test.js && git commit -m "Promemoria: selezione degli eventi da ricordare"`.

### Task 2: Testo delle email (`backend/Codice.gs`, funzioni pure)

**File:**
- Modifica: `backend/Codice.gs`
- Modifica: `test/promemoria.test.js`

**Interfacce:**
- Consuma: risultato di `selezionaPromemoria` (Task 1); `esc`, `giornoLungo` esistenti.
- Produce:
  - `indirizzi(urlAdmin: string) → { convocazioni: string, sito: string }`: dashboard senza `#…` + `#convocazioni`; sito = `urlAdmin` con `admin.html…` sostituito dalla cartella (`…/TGISport_Disponibilita/`); `''` per entrambi se `urlAdmin` non inizia con `https://`.
  - `emailOperatore(op, eventi, ctx) → { to, subject, htmlBody }`, `ctx = { oggi, telefono, sito }`.
  - `emailSupervisori(gruppi, ctx) → { to, subject, htmlBody }`, `ctx = { oggi, giorni, a: string, convocazioni: string }`.
  - Righe: giorno con `giornoLungo` più « (oggi)» / « (domani)»; titolo; competizione e `round`; partita = «evento HH:MM · ritrovo X – fine Y»; supervisione = «inizio turno X – fine Y». Ritrovo = `convocazione || convocazioneCalcolata`, fine = `fine || fineCalcolata` (parti assenti omesse).

- [ ] **Passo 1: scrivere le prove** in `test/promemoria.test.js`:
  - `oggetto operatore al singolare e al plurale`: un evento `2026-10-11` → `'Promemoria: conferma la convocazione di sabato 11 ottobre'`; due → `'Promemoria: 2 convocazioni da confermare'`.
  - `email operatore`: `op = { nome: 'Marco Rossi', email: 'm@x.it' }`, evento partita `2026-10-10` Sassuolo-Lazio, Serie A, round `9`, orario `18:30`, `convocazioneCalcolata: '14:30'`, `fineCalcolata: '20:30'`, `ctx.oggi = '2026-10-09'` → `htmlBody` contiene `'Ciao Marco'`, `'queste convocazioni aspettano ancora la tua conferma'`, `'(domani)'`, `'ritrovo <b>14:30</b>'`, `'fine <b>20:30</b>'`, `'Conferma sulla piattaforma'`, `href="https://x.github.io/sito/"`, `'chiama il supervisore al <b>+39 333</b>'`, `'Per entrare usa il tuo codice personale.'`; con `telefono: ''` nessun «chiama»; con `sito: ''` nessun tasto.
  - `supervisione nell'email operatore`: `tipo: 'supervisione'`, `convocazione: '10:00'`, nessuna `fine` → `'inizio turno <b>10:00</b>'` e nessun «fine».
  - `caratteri HTML resi come testo`: titolo `'<b>A&B</b>'` → `'&lt;b&gt;A&amp;B&lt;/b&gt;'` nell'email operatore e in quella supervisori.
  - `oggetto supervisori`: 2 `senzaOperatore`, 3 `inAttesa`, `giorni: 3` → `'Promemoria convocazioni · prossimi 3 giorni: 2 senza operatore, 3 in attesa'`; tutti e quattro i gruppi → `'… 1 da sostituire, 1 senza operatore, 1 da inviare, 1 in attesa'`; `giorni: 1` → `'Promemoria convocazioni · oggi e domani: …'`.
  - `riepilogo supervisori`: solo i titoli dei gruppi non vuoti, nell'ordine «Rifiutate o da sostituire», «Senza operatore», «Assegnate ma non inviate», «In attesa di risposta», ciascuno con il numero; la nota `'(senza email)'` compare; tasto `'Apri le convocazioni'` con `href` = `ctx.convocazioni`; `to` = `ctx.a`.
  - `indirizzi`: `'https://x.github.io/TGISport_Disponibilita/admin.html#aggiornamenti'` → `{ convocazioni: 'https://x.github.io/TGISport_Disponibilita/admin.html#convocazioni', sito: 'https://x.github.io/TGISport_Disponibilita/' }`; `''` → `{ convocazioni: '', sito: '' }`.
- [ ] **Passo 2: eseguire** `node --test test/promemoria.test.js` → atteso FAIL (`emailOperatore is not a function`).
- [ ] **Passo 3: implementare** le funzioni dell'interfaccia, con lo stesso stile HTML in linea di `emailConvocazioni` (Arial 14px, tasto blu `#1740f0`).
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: commit** `git add backend/Codice.gs test/promemoria.test.js && git commit -m "Promemoria: email agli operatori e riepilogo ai supervisori"`.

### Task 3: Giro giornaliero, lettura di Firestore, impostazioni e attivazione (`backend/`)

**File:**
- Modifica: `backend/Codice.gs` (lettura Firestore con l'account proprietario, giro, impostazioni, `doPost`, commento iniziale)
- Modifica: `backend/appsscript.json` (permessi)
- Modifica: `test/promemoria.test.js`
- Modifica: `README.md` (messa in linea del blocco 2, con i passi per Firebase)

**Interfacce:**
- Consuma: Task 1 e Task 2.
- Produce:
  - `leggiImpostazioni() → { emailSupervisori, emailAttive, urlAdmin, promemoriaAttivi: boolean, promemoriaGiorni: number, ultimoPromemoria: object|null }` (giorni non validi → 3; `ULTIMO_PROMEMORIA` illeggibile → `null`).
  - `impostazioniDashboard() → leggiImpostazioni() + { promemoriaProgrammato: boolean }` (esiste un attivatore con funzione `inviaPromemoria`). In `doPost`, `leggiImpostazioni` e `salvaImpostazioni` (solo supervisori) restituiscono questo.
  - `salvaImpostazioni(r)`: come oggi, più `promemoriaAttivi` e `promemoriaGiorni` **solo se presenti** in `r`; giorni non interi o fuori 1–7 → `Error('I giorni del promemoria vanno da 1 a 7.')`.
  - `firestoreAdmin(metodo, percorso, corpo) → { codice, dati }` (gettone `ScriptApp.getOAuthToken()`, intestazione `x-goog-user-project`).
  - `leggiDatiPromemoria(oggi, fine) → { eventi, operatori, telefono }`: `runQuery` su `eventi` con `data >= oggi` e `data <= fine` (voci senza `document` ignorate), elenco `operatori` seguendo `nextPageToken`, `impostazioni/operativo` (404 → `telefono: ''`). Codice 403 → `Error("L'account dello script non può leggere Firebase: aggiungilo come Editor del progetto (vedi README).")`; altri errori → `Error('Lettura di Firebase non riuscita (' + codice + ').')`.
  - `giroPromemoria(adesso: Date, opzioni = { anteprima: false }) → { saltato?: 'spenti'|'già fatto', oggi, riepilogo: boolean, operatori: number, destinatari: string[] }`: spenti o già fatto oggi → esce prima di leggere (in anteprima non controlla né l'uno né l'altro); in anteprima non spedisce e non salva; altrimenti spedisce (un errore su un'email non ferma le altre) e salva `ULTIMO_PROMEMORIA = { giorno: oggi, quando: adesso.toISOString(), riepilogo, operatori }` anche se non c'era niente da mandare. Una lettura fallita propaga l'errore senza salvare.
  - `inviaPromemoria()`: funzione dell'attivatore, ignora gli argomenti e chiama `giroPromemoria(new Date())`.
  - `attivaPromemoria()`: da eseguire dall'editor; prova `leggiDatiPromemoria`, scrive nel registro esito e anteprima (`giroPromemoria(new Date(), { anteprima: true })`), toglie gli attivatori `inviaPromemoria` esistenti, crea `ScriptApp.newTrigger('inviaPromemoria').timeBased().everyDays(1).atHour(8).inTimezone('Europe/Rome').create()`, imposta `PROMEMORIA_ATTIVI = 'SI'` e `PROMEMORIA_GIORNI = '3'` solo se assenti.

- [ ] **Passo 1: scrivere le prove** in `test/promemoria.test.js`. Simulazione di `UrlFetchApp.fetch(url, opzioni)` che risponde secondo l'indirizzo (`:runQuery`, `/operatori`, `/impostazioni/operativo`) e registra le chiamate; `MailApp.sendEmail` registra le email; proprietà in una `Map`.
  - `spenti: nessuna lettura e nessuna email`: `PROMEMORIA_ATTIVI` assente → `{ saltato: 'spenti' }`, zero chiamate.
  - `giro completo`: attivi, 3 giorni, `EMAIL_SUPERVISORI` impostato, un `convocato` di Anna e un `da-assegnare` → 2 email (Anna e supervisori), `ULTIMO_PROMEMORIA.giorno === '2026-10-09'`, `riepilogo: true`, `operatori: 1`; la richiesta `runQuery` porta `Authorization: Bearer <gettone>`, `x-goog-user-project: tgi-availability` e l'intervallo `2026-10-09`…`2026-10-12`.
  - `niente in sospeso: nessuna email, giro registrato`.
  - `secondo giro nello stesso giorno non spedisce`: `{ saltato: 'già fatto' }`, nessuna nuova email.
  - `senza indirizzi supervisori: solo agli operatori`.
  - `un'email che non parte non ferma le altre`: `MailApp.sendEmail` lancia un errore per Anna → partono comunque Bruno (con email in questa prova) e il riepilogo, `operatori: 1`.
  - `lettura negata: niente email né registrazione`: `runQuery` → 403 → errore con «aggiungilo come Editor», `ULTIMO_PROMEMORIA` assente.
  - `anteprima: niente email né registrazione, anche se già fatto oggi`.
  - `il giorno è quello di Roma`: `adesso = new Date('2026-10-09T22:30:00Z')` → intervallo da `2026-10-10`.
  - `l'attivatore non scambia l'evento per la data`: `inviaPromemoria({ triggerUid: '1' })` senza errori, con intervallo che parte dalla data di Roma di oggi.
  - `risposta runQuery con voci senza documento`: `[{ readTime: '…' }]` → nessun errore, nessuna email.
  - `impostazioni: valori predefiniti`: proprietà vuote → `promemoriaAttivi: false`, `promemoriaGiorni: 3`, `ultimoPromemoria: null`; `impostazioniDashboard().promemoriaProgrammato` `false`, `true` con un attivatore `inviaPromemoria`.
  - `salvataggio da dashboard vecchia non tocca i promemoria`: con `SI`/`5` salvati, `salvaImpostazioni({ emailSupervisori: 's@x.it', emailAttive: true, urlAdmin: '' })` → restano `true`/`5`.
  - `giorni fuori limite rifiutati`: `0`, `8`, `2.5`, `''` → errore «I giorni del promemoria vanno da 1 a 7.»; `7` accettato.
  - `attivazione senza doppioni`: con un attivatore `inviaPromemoria` già presente → un `deleteTrigger` e un `newTrigger`; proprietà già `NO`/`5` restano tali; assenti → `SI`/`3`.
- [ ] **Passo 2: eseguire** `node --test test/promemoria.test.js` → atteso FAIL (`giroPromemoria is not a function`).
- [ ] **Passo 3: implementare** le funzioni dell'interfaccia; in `doPost` collegare le due azioni a `impostazioniDashboard`; aggiungere i due permessi in `appsscript.json`; aggiornare il commento iniziale di `Codice.gs` (ora legge Firebase anche da solo, per i promemoria).
- [ ] **Passo 4: scrivere in `README.md`** la messa in linea del blocco 2 nell'ordine della spec §6, con i passi Firebase (console Firebase → ⚙️ Impostazioni progetto → Utenti e autorizzazioni → Aggiungi membro → email dell'account dello script → ruolo **Editor** → Aggiungi membro) e cosa deve comparire nel registro dopo `attivaPromemoria`.
- [ ] **Passo 5: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 6: commit** `git add backend/ test/promemoria.test.js README.md && git commit -m "Promemoria: giro giornaliero, lettura di Firebase e attivazione"`.

### Task 4: Impostazioni nella dashboard e demo

**File:**
- Modifica: `admin.html` (riquadro *Notifiche email*; `?v=16` → `?v=17` anche in `index.html`)
- Modifica: `app/admin.js` (`caricaImpostazioni`, invio di `form-email`)
- Modifica: `app/regole.js` (`statoPromemoria`)
- Modifica: `app/demo.js` (`impostazioni`, `salvaImpostazioni`)
- Modifica: `test/regole.test.js`, `test/demo.test.js`

**Interfacce:**
- Consuma: i campi di `impostazioniDashboard` (Task 3).
- Produce:
  - `DO.regole.statoPromemoria(imp) → string`, nell'ordine: campo `promemoriaAttivi` assente → `'Script delle email da aggiornare: i promemoria non sono ancora disponibili.'`; `promemoriaProgrammato` falso → `'Invio giornaliero non attivo: esegui attivaPromemoria nello script delle email.'`; `ultimoPromemoria` nullo → `'Nessun promemoria ancora inviato.'`; altrimenti `'Ultimo promemoria: ven 10 ottobre alle 8:14 · '` + `'riepilogo ai supervisori + 3 operatori'` / `'riepilogo ai supervisori'` / `'1 operatore'` / `'niente in sospeso, nessuna email'` (giorno e ora con `toLocaleString('it-IT', { timeZone: 'Europe/Rome', … })`).
  - Nuovi elementi in `admin.html`, dentro `form-email` prima di «Salva»: `<input type="checkbox" id="imp-promemoria">` con «Promemoria automatici ogni mattina»; `<input type="number" id="imp-promemoria-giorni" min="1" max="7" step="1">` con «Giorni prima dell'evento»; `<p class="nota" id="imp-promemoria-stato">`.

- [ ] **Passo 1: scrivere le prove**:
  - in `test/regole.test.js`, `stato dei promemoria`: le quattro varianti con `quando: '2026-10-10T06:14:00Z'` → `'Ultimo promemoria: ven 10 ottobre alle 8:14 · riepilogo ai supervisori + 3 operatori'`; `{ riepilogo: false, operatori: 1 }` → `'… · 1 operatore'`; `{ riepilogo: false, operatori: 0 }` → `'… · niente in sospeso, nessuna email'`.
  - in `test/demo.test.js`, `impostazioni dei promemoria nella demo`: `leggiImpostazioni()` ha `promemoriaAttivi: true`, `promemoriaGiorni: 3`, `promemoriaProgrammato: true`; `salvaImpostazioni` con giorni `8` → errore «I giorni del promemoria vanno da 1 a 7.»; con `{ emailSupervisori, emailAttive }` soli → giorni e interruttore invariati; con `promemoriaGiorni: 5` → `5`.
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso FAIL sulle due nuove prove.
- [ ] **Passo 3: implementare** `statoPromemoria`, i campi demo (stesse regole di `salvaImpostazioni` del Task 3) e il riquadro: `caricaImpostazioni` compila casella, giorni e stato (casella e giorni disabilitati se lo script è da aggiornare); all'invio i giorni passano da `DO.regole.numero(valore, { min: 1, max: 7, intero: true })`, `null` → avviso «I giorni del promemoria vanno da 1 a 7.» e niente salvataggio; dopo il salvataggio si ridisegna lo stato con la risposta.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: provare nel browser in demo** (`preview_start` «sito» dopo aver copiato i file nella cartella di prova): Impostazioni → Notifiche email mostra casella, giorni `3` e «Nessun promemoria ancora inviato.»; giorni `9` → avviso e nessun salvataggio; giorni `5` → «Impostazioni salvate.» e `5` dopo il ricaricamento; anche in formato telefono; console senza errori.
- [ ] **Passo 6: commit** `git add admin.html index.html app/admin.js app/regole.js app/demo.js test/ && git commit -m "Promemoria: interruttore, giorni e stato nelle impostazioni"`.
