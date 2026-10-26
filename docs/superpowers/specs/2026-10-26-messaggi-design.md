# Blocco 10 — Messaggi tra operatori e supervisori su convocazioni e on-site

Data: 2026-10-26 · Stato: approvato nelle sezioni, in revisione come documento

## Obiettivo

Su una convocazione l'operatore oggi può solo confermare o dire che non può. Con questo blocco può anche scrivere ai supervisori (una domanda o un messaggio qualsiasi), e i supervisori rispondono dalla dashboard. Domande e risposte restano scritte sull'evento o sul deployment, e tutti i supervisori vedono se qualcuno ha già risposto.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Risposta | Dentro la piattaforma: il supervisore risponde dalla dashboard, l'operatore trova la risposta sotto la convocazione e riceve un'email |
| Dove | Convocazioni remote (partite, Remote TL, Remote Support) e deployment on-site |
| Archiviazione | Raccolta a parte `messaggi`, una voce per messaggio legata a (evento o deployment, operatore). Convocazioni e deployment non cambiano |
| Conversazione | Libera: più messaggi da entrambe le parti; il supervisore può scrivere per primo |
| Stato | Un messaggio non conferma e non rinuncia |
| Email | Ai supervisori per ogni messaggio di un operatore; all'operatore per ogni messaggio dei supervisori |
| Nome del supervisore | Chiesto al primo messaggio e ricordato sul computer (gli account hanno solo l'email) |
| Backup | I messaggi non entrano nel backup settimanale (fuori da questo blocco) |

## 1. Dati

Raccolta `messaggi/{id}`, un documento per messaggio:

| Campo | Contenuto |
|---|---|
| `operatoreId` | l'operatore della conversazione (anche quando scrive un supervisore) |
| `tipo` | `'evento'` (convocazione remota) oppure `'onsite'` |
| `rif` | ID dell'evento o del deployment |
| `da` | `'operatore'` oppure `'supervisore'` |
| `autore` | nome di chi scrive (operatore: il suo nome; supervisore: il nome ricordato sul computer) |
| `testo` | da 1 a 500 caratteri, spazi iniziali e finali tolti |
| `quando` | data e ora ISO |
| `letto` | `false` alla creazione; solo per i messaggi dei supervisori: `true` quando l'operatore apre la conversazione |

Una **conversazione** è l'insieme dei messaggi con lo stesso (`tipo`, `rif`, `operatoreId`), in ordine di `quando`.

Quando scrive un operatore, nella stessa scrittura si crea anche una voce di Aggiornamenti (`invii`) con `tipo: 'messaggio'`, `modifiche: []`, `letto: false` ed `evento: { tipo, rif, titolo, data, testo }` (per un on-site: `titolo` = luogo e titolo, `data` = primo giorno). Le regole attuali di `invii` lo permettono già. La voce letta o non letta di Aggiornamenti è ciò che i supervisori «devono ancora vedere».

## 2. Regole di Firebase

`match /messaggi/{id}`:
- **lettura:** `lettore()` (supervisori e sola visualizzazione); un operatore solo se `operatoreId == mioOperatore()`.
- **creazione da un supervisore:** `da == 'supervisore'`, campi esattamente quelli della tabella, `testo` stringa da 1 a 500, `letto == false`.
- **creazione da un operatore:** `operatore()`, `da == 'operatore'`, `operatoreId == mioOperatore()`, stessi campi e limiti, e:
  - `tipo == 'evento'`: l'evento `rif` esiste, ha `operatoreId == mioOperatore()`, `inviata == true` e non è `annullato`;
  - `tipo == 'onsite'`: il deployment `rif` esiste, `mioOperatore()` è tra i `destinatari` e non tra gli `esclusi`, e non è `annullata`.
- **modifica:** solo l'operatore della conversazione, solo `letto` (da `false` a `true`) e solo sui messaggi con `da == 'supervisore'`.
- **cancellazione:** solo i supervisori (dalla console; nella dashboard non c'è un tasto).

## 3. Pagina operatori

- **Tasto:** su ogni convocazione visibile (da confermare, confermata, «Non puoi» ancora in programma) e su ogni deployment on-site visibile (richiesta da rispondere o già accettato): **💬 Scrivi ai supervisori**; con messaggi già presenti **💬 Messaggi (N)**; con messaggi dei supervisori non letti **💬 N nuovi messaggi** e il cartellino **Nuovo messaggio** sulla scheda.
- **Pannello** (finestra del sito, come «Aggiungi al calendario»; dal basso sul telefono):
  - titolo dell'evento o del deployment e data;
  - i messaggi in ordine: quelli dell'operatore a destra, quelli dei supervisori a sinistra con il nome, ciascuno con giorno e ora;
  - campo di testo (500 caratteri, contatore quando ne restano meno di 50) e **Invia**; **Chiudi**.
  - Dopo l'invio il messaggio compare nella conversazione e un avviso dice «Messaggio inviato ai supervisori.».
  - Aprendo il pannello i messaggi dei supervisori diventano letti.
- **Sola lettura:** su una convocazione annullata, su un deployment annullato o se l'operatore è stato escluso, la conversazione si legge ma il campo non c'è: «Convocazione annullata: non si possono più mandare messaggi.» (on-site: «Deployment annullato…» / «Non fai più parte di questo deployment…»).
- **Aggiornamento:** i messaggi si caricano insieme alle convocazioni, all'apertura della pagina (come oggi le convocazioni).
- Gli eventi passati spariscono dalla lista come oggi, con la loro conversazione.

## 4. Dashboard dei supervisori

- **Aggiornamenti:** voce «**Marco Rossi** ha scritto · Feyenoord-Como · mer 21 ott» con il testo; tasti **Rispondi** (apre la conversazione nel pannello dei messaggi) e **Segna come letto**. Conta nel numerino come le altre voci. Rispondere segna come lette tutte le voci di quella conversazione.
- **Finestra dell'evento** (Convocazioni): parte **Messaggi con <operatore>** con la conversazione, il campo e **Invia**.
  - Evento senza operatore o convocazione non ancora inviata: «Potrai scrivere dopo l'invio della convocazione.»
  - Conversazioni con operatori assegnati prima: sotto, chiuse, «Conversazioni precedenti: Luca Bianchi (2)»; si leggono, non si scrive.
- **Scheda del deployment on-site:** nell'elenco dei destinatari, per ogni persona il tasto **💬** (con il numero dei messaggi) che apre la conversazione con quella persona.
- **Segno 💬:** su eventi e deployment con almeno una voce di Aggiornamenti `messaggio` non letta, nella scheda Convocazioni (elenco e calendario) e nell'elenco degli on-site. Sparisce quando un supervisore risponde o segna la voce come letta.
- **Nome del supervisore:** al primo invio la dashboard chiede «Il tuo nome (lo vedono gli operatori)» con la finestra del sistema; lo ricorda sul computer (`do-nome-supervisore`); nel pannello un link «Scrivi come <nome> · cambia».
- **Sola visualizzazione:** le conversazioni si leggono nella finestra dell'evento e nella scheda on-site; niente campo. Chi è in sola visualizzazione non legge Aggiornamenti (come oggi), quindi non vede le voci dei messaggi né il segno 💬.
- **Pannello dei messaggi:** lo stesso componente nelle tre posizioni (Aggiornamenti, evento, on-site): titolo, conversazione, campo, **Invia**.

## 5. Email (script)

Due nuove azioni in `backend/Codice.gs`:
- **`notificaMessaggio`** (operatore, con `verificaOperatore`): se le email sono attive e c'è un indirizzo dei supervisori, email a `emailSupervisori`.
  - Oggetto: «Messaggio da <operatore> · <evento o luogo on-site>».
  - Corpo: chi, su quale evento e quando, il testo in un riquadro, il link «Rispondi sulla piattaforma» (`urlAdmin` con `#aggiornamenti`).
- **`emailMessaggio`** (supervisore, con `verificaSupervisore`): email all'operatore all'indirizzo passato dalla dashboard.
  - Oggetto: «Nuovo messaggio dai supervisori · <evento o luogo on-site>».
  - Corpo: «Ciao <nome>, <supervisore> ti ha scritto su <evento> (<giorno>):», il testo, il tasto «Rispondi sulla piattaforma» (`urlSito`), la riga «Per entrare usa il tuo codice personale.».
  - Operatore senza email valida: nessuna email; la dashboard mostra «Messaggio salvato. <nome> non ha un'email: lo vedrà sulla piattaforma.».
- Testi limitati a 500 caratteri e passati da `esc` come nelle altre email.
- Un'email non partita non annulla il messaggio: il messaggio è già salvato, l'errore va nella console come per le rinunce.

## 6. Demo

`app/demo.js` tiene i messaggi come le altre raccolte (stesse funzioni, stessi controlli dell'operatore: evento suo, inviato, non annullato; on-site tra i destinatari, non escluso, non annullato).

## 7. Verifiche

- **Prove automatiche** (`node --test test/*.test.js`):
  - parti pure (nuovo file `app/messaggi.js`): raggruppare per conversazione, numero dei nuovi messaggi per l'operatore, testo valido (vuoto, solo spazi, oltre 500), si può scrivere o no (evento annullato, non inviato, operatore escluso), conversazioni precedenti di un evento, segno 💬 da Aggiornamenti;
  - dati su Firebase (finto): invio di un operatore = messaggio + voce di Aggiornamenti nella stessa scrittura; invio di un supervisore; messaggi segnati come letti;
  - script: `notificaMessaggio` (email attive / spente, senza indirizzo), `emailMessaggio` (indirizzo valido / mancante, testo con caratteri HTML).
- **Regole di Firebase:** controllo a mano e in revisione (non c'è un emulatore).
- **Nel browser (demo):** operatore e supervisore, computer e telefono: domanda su una convocazione e su un on-site, risposta, nuovo messaggio, sola lettura su annullato, sola visualizzazione.

## 8. Messa in linea

1. **Regole di Firebase:** incollare le nuove regole nella console e pubblicarle (prima del sito: senza, il sito nuovo non può leggere né scrivere i messaggi).
2. **Sito:** `?v=34` → `?v=35`.
3. **Script:** incollare il codice e fare **Gestisci deployment → Nuova versione**. Finché non è fatto i messaggi funzionano ma le email non partono.
4. **Prova:** un messaggio da un operatore di prova e la risposta di un supervisore, con le due email.

## Fuori da questo blocco

- Messaggi nel backup settimanale.
- Messaggi su richieste di disponibilità per periodo o per singolo evento.
- Allegati, foto, cancellazione o modifica dei messaggi dalla dashboard.
- Promemoria per i messaggi senza risposta.
