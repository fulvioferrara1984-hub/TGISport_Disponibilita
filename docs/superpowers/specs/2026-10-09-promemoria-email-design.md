# Blocco 2 — Promemoria email automatici

Data: 2026-10-09 · Stato: approvato nelle sezioni, in revisione come documento

## Obiettivo

Arrivare agli eventi remoti senza buchi: ogni mattina, per gli eventi dei prossimi giorni, gli operatori ricevono un promemoria delle convocazioni che non hanno ancora confermato e i supervisori un riepilogo di tutto ciò che non è ancora coperto. Funziona da solo, anche se nessuno apre il sito.

Secondo dei tre blocchi concordati: 1. convocazioni remote (fatto) → **2. promemoria automatici** (questo documento) → 3. deployment on-site. Vale **solo per gli eventi remoti**.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Frequenza | **Ogni mattina finché non si risolve** (opzione A): gli eventi da oggi a oggi + X giorni |
| Riepilogo supervisori | **Tutto ciò che non è coperto** (opzione A), in quattro gruppi |
| Lettura dei dati senza utente collegato | Lo script legge Firestore **con l'account Google che lo possiede**: niente chiavi |
| Account diversi (script ≠ Firebase) | L'account dello script viene aggiunto come **Editor** del progetto Firebase |
| Interruttore | I promemoria hanno un **interruttore proprio**; la casella esistente "Invia un'email a ogni invio degli operatori" resta solo per quelle notifiche |
| Giorni X | Impostabili da **1 a 7**, predefinito **3** |

## 1. Funzionamento

Ogni mattina **tra le 8 e le 9** (ora di Roma) un attivatore giornaliero dello script email esegue `inviaPromemoria`:

1. Se i promemoria sono spenti, o se oggi c'è già stato un giro riuscito, non fa nulla.
2. Legge da Firestore, solo in lettura:
   - gli eventi con `data` da oggi a oggi + X (una sola condizione di intervallo sul campo `data`: nessun indice da creare);
   - tutti gli operatori (nome, email, attivo);
   - `impostazioni/operativo` per il telefono di reperibilità.
3. Tiene solo gli **eventi remoti**: `tipo` `partita` o `supervisione` (eventi senza tipo = partita), esclusi gli `annullato`. Qualunque altro tipo, come quelli on-site del blocco 3, resta fuori.
4. Classifica ogni evento in **un solo** gruppo, in quest'ordine:
   1. **Rifiutate o da sostituire**: `stato` `rifiutato` oppure `daSostituire` vero (anche se confermato);
   2. **Senza operatore**: nessun `operatoreId` oppure `stato` `da-assegnare`;
   3. **Assegnate ma non inviate**: `stato` `assegnato`;
   4. **In attesa di risposta**: `stato` `convocato`.

   I `confermato` senza `daSostituire` non entrano.
5. Manda **a ogni operatore** con eventi del gruppo 4 un'email con l'elenco, solo se è attivo e ha un'email valida.
6. Manda **ai supervisori** (indirizzi di "Notifiche email") un unico riepilogo, se almeno un gruppo non è vuoto.
7. Salva l'esito del giro: data e ora, riepilogo inviato sì/no, numero di operatori avvisati.

Con X = 3 una convocazione mai confermata riceve fino a 4 promemoria: 3, 2, 1 giorni prima e la mattina stessa.

### Lettura di Firestore

- API REST di Firestore (`runQuery` per gli eventi, elenco documenti per gli operatori, lettura di `impostazioni/operativo`).
- Gettone: `ScriptApp.getOAuthToken()` dell'account proprietario, con l'intestazione `x-goog-user-project: tgi-availability` perché l'uso dell'API sia attribuito al progetto Firebase.
- Un account Google membro del progetto legge **fuori dalle regole di sicurezza** (vale l'autorizzazione del progetto, non le regole): le regole Firestore non cambiano.
- Nuove autorizzazioni nel manifesto: `https://www.googleapis.com/auth/datastore` (lettura Firestore) e `https://www.googleapis.com/auth/script.scriptapp` (attivatore giornaliero).

### Attivazione: `attivaPromemoria` (da eseguire una volta dall'editor)

1. Chiede le autorizzazioni.
2. Prova a leggere gli eventi e scrive nel registro l'esito, con un messaggio chiaro se l'account non è membro del progetto Firebase.
3. Scrive nel registro un'**anteprima** di cosa partirebbe oggi (destinatari e numero di eventi), senza spedire nulla.
4. Crea l'attivatore giornaliero, togliendo prima eventuali attivatori `inviaPromemoria` già presenti (eseguirla due volte non ne crea due).
5. Se non esistono ancora, imposta i promemoria come attivi a 3 giorni.

## 2. Email

### All'operatore

- Oggetto: «Promemoria: conferma la convocazione di sabato 11 ottobre» (una) oppure «Promemoria: 2 convocazioni da confermare».
- Testo: «Ciao Nome, queste convocazioni aspettano ancora la tua conferma:», poi una riga per evento con giorno («oggi»/«domani» quando serve), evento, competizione e giornata, ritrovo – fine turno (o inizio turno per la supervisione), come nell'email di convocazione.
- Tasto **«Conferma sulla piattaforma»** verso la pagina degli operatori.
- «Se non puoi partecipare, chiama il supervisore al …» con il numero di reperibilità, se impostato.
- «Per entrare usa il tuo codice personale.»
- Ritrovo e fine: quelli scritti sull'evento, altrimenti quelli salvati all'invio della convocazione (`convocazioneCalcolata`, `fineCalcolata`).

### Ai supervisori

- Oggetto: «Promemoria convocazioni · prossimi 3 giorni: 2 senza operatore, 3 in attesa» (solo le voci non a zero).
- Gruppi nell'ordine della sezione 1, ciascuno con il numero, solo se non vuoti. Ogni riga: giorno («oggi»/«domani»), evento, competizione, orario o ritrovo, operatore. Nel gruppo «In attesa di risposta» l'operatore che non ha ricevuto il promemoria porta la nota «(senza email)» o «(disattivato)».
- Tasto **«Apri le convocazioni»** verso la dashboard, scheda Convocazioni.

### Indirizzi dei link

Si ricavano da `URL_ADMIN`, l'indirizzo della dashboard già salvato con le impostazioni email: la dashboard senza `#…` più `#convocazioni`; la pagina operatori sostituendo `admin.html…` con la cartella del sito. Se `URL_ADMIN` manca, le email partono senza tasti.

## 3. Impostazioni nella dashboard

Nel riquadro *Notifiche email*, sotto la casella esistente:

- casella **«Promemoria automatici ogni mattina»**;
- campo **«Giorni prima dell'evento»** (numero intero da 1 a 7; vuoto o fuori limite = errore, non si salva);
- riga di stato, una fra:
  - «Ultimo promemoria: ven 10 ottobre alle 8:14 · riepilogo ai supervisori + 3 operatori»;
  - «Nessun promemoria ancora inviato»;
  - «Invio giornaliero non attivo: esegui *attivaPromemoria* nello script delle email», se l'attivatore non esiste;
  - «Script delle email da aggiornare», se lo script non restituisce i nuovi campi.

Dati: proprietà dello script (`PROMEMORIA_ATTIVI` `SI`/`NO`, `PROMEMORIA_GIORNI`, `ULTIMO_PROMEMORIA` in JSON), lette e salvate con `leggiImpostazioni` / `salvaImpostazioni` come le altre impostazioni email, solo dai supervisori. `leggiImpostazioni` restituisce anche se l'attivatore giornaliero esiste. La modalità demo simula gli stessi campi.

## 4. Casi particolari

- Nessun evento in sospeso: nessuna email.
- Nessun indirizzo supervisori impostato: partono solo le email agli operatori.
- Operatore disattivato o senza email: nessuna email a lui, segnalato nel riepilogo.
- Più eventi dello stesso operatore: una sola email.
- Eseguito due volte lo stesso giorno: il secondo giro non spedisce. Un giro fallito (lettura non riuscita) non conta: il giro successivo, anche manuale, riprova.
- Lettura di Firestore non riuscita: nessuna email, l'errore resta nel registro delle esecuzioni dello script (Google avvisa il proprietario degli errori degli attivatori).
- Limite Gmail: 100 destinatari al giorno; un giro tipico ne usa una decina.
- Il campo `data` è una stringa `aaaa-mm-gg` e «oggi» è calcolato nel fuso di Roma.

## 5. Verifiche

- **Prove automatiche** (node, caricando `backend/Codice.gs` con le funzioni di Google simulate) sulla parte di calcolo:
  - finestra di date: oggi incluso, oggi + X incluso, oggi + X + 1 ed eventi passati esclusi;
  - solo remoti: tipi diversi da partita/supervisione esclusi, annullati esclusi;
  - un solo gruppo per evento, `daSostituire` prima di tutto, confermati esclusi;
  - un'email per operatore con più eventi; operatori disattivati o senza email segnalati e non avvisati;
  - nulla in sospeso → niente da spedire; oggetti al singolare e al plurale; secondo giro nello stesso giorno → niente.
- **Demo**: riquadro Notifiche email con casella, giorni, riga di stato, salvataggio e numeri non validi.
- **Progetto reale**: `attivaPromemoria` eseguita dall'utente; il registro mostra la lettura riuscita e l'anteprima, poi il primo giro del mattino dopo compare nella riga di stato.

## 6. Messa in linea

1. **Firebase**: aggiungere l'account Google dello script come **Editor** del progetto (istruzioni passo per passo al rilascio).
2. **Script**: incollare il nuovo `Codice.gs` e il manifesto `appsscript.json`, eseguire `attivaPromemoria`, poi *Distribuisci → Gestisci deployment → Nuova versione*.
3. **Sito**: pubblicazione normale. Prima dell'aggiornamento dello script la dashboard mostra «Script delle email da aggiornare» e non succede altro.
4. **Dashboard**: Impostazioni → Notifiche email → casella e giorni → Salva.

## Fuori da questo blocco

- Promemoria per gli eventi on-site (esclusi per scelta).
- Promemoria per le richieste di disponibilità non compilate.
- Orario d'invio configurabile (fisso tra le 8 e le 9).
