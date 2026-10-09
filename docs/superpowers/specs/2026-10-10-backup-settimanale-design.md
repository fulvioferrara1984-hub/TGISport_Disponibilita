# Blocco 8 — Backup settimanale in Excel

Data: 2026-10-10 · Stato: approvato nelle sezioni, in revisione come documento

## Obiettivo

Ogni venerdì, senza intervento di nessuno, i supervisori ricevono per email un file Excel con tutti gli eventi della stagione, nel formato che la piattaforma sa reimportare; reimportandolo, gli eventi tornano com'erano senza duplicati.

Ultimo dei blocchi concordati.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Quando | **Venerdì alle 18:00** (lo script parte tra le 18 e le 19, ora italiana) |
| Contenuto | **Eventi della stagione, on-site, operatori e impostazioni** (A); niente disponibilità |
| Chi lo prepara | Lo script delle email, che legge già Firebase per i promemoria: nessuna nuova autorizzazione, niente Google Drive |
| Ripristino | Dall'importazione esistente, che riconosce il backup dalla colonna «ID evento» |

## 1. Il file e l'invio

### Lettura (account dello script, come i promemoria)

- `eventi` con `data` dal 1° agosto della stagione in corso; `onsite` con `a` dal 1° agosto; `onsiteRiservato` (compensi); `operatori`; `impostazioni/regole`.
- Lettura non riuscita → nessuna email ai destinatari del backup, errore nel registro e nell'ultimo backup (vedi sotto).

### File `Backup_TGI_Sport_<aaaa-mm-gg>.xlsx`

Creato dallo script (fogli XML compressi con `Utilities.zip`), date come date di Excel, orari come testo `HH:MM`.

- **Convocazioni** (riga 1 titolo «Backup eventi · Disponibilità Ops TGI Sport · <giorno lungo> alle <ora> · stagione <aaaa/aa>», riga 2 intestazioni, dati dalla riga 3; colonne A–K come il file della stagione):

  | | Colonna | Contenuto |
  |---|---|---|
  | A | Competizione | competizione; per i turni la mansione |
  | B | Round | |
  | C | Sport | |
  | D | Data | data di Excel |
  | E | Partita / turno | titolo; per i turni «Remote TL» / «Remote Support» |
  | F | Orario evento | vuoto per i turni |
  | G | Ritrovo | ritrovo calcolato o scritto |
  | H | Operatore | nome |
  | I | Fine turno | fine calcolata o scritta |
  | J | Conferma | «SI» se confermato |
  | K | Note | note interne |
  | L | Stato | Da assegnare, Da inviare, In attesa di risposta, Confermato, Rifiutato, Annullato |
  | M | Gettone maggiorato | «SI» se l'evento è maggiorato |
  | N | Da sostituire | «SI» |
  | O | Tipo | Partita, Remote TL, Remote Support |
  | P | ID evento | id in Firebase |
  | Q | Ritrovo scritto a mano | il ritrovo scritto sull'evento (vuoto se automatico) |
  | R | Fine scritta a mano | la fine scritta sull'evento (vuota se automatica) |

  Tutti gli eventi, anche annullati e da assegnare, in ordine di data e ritrovo.
- **On-site**: una riga per giorno di ogni deployment: Luogo, Sport, Titolo, Dal, Al, Giorno, Attività, Partita, Posti TL, Posti OP, On-site TL, On-site OP, Stato, Compenso.
- **Operatori**: Nome, Mansione, Ruolo (Remote OP / Remote Support / Remote TL), Contratto, Email, Telefono, On-site (TL / OP / vuoto), Attivo (SI / NO).
- **Impostazioni** (colonne lette anche dall'importazione della stagione): A Voce / B Valore (Netto P.IVA diurno, notturno, maggiorato; Netto Coop diurno, notturno, maggiorato; Tariffa on-site; Notturno dalle; Notturno alle), D Operatore / E Contratto, G Sport, I Competizione / mansione, J Compenso (Diurno, Notturno, Maggiorato, Dimezzato), K Ore prima, L Ore dopo, M Colore.

### Email

- A: indirizzi dei supervisori di Impostazioni → Notifiche email (le notifiche spente non fermano il backup: lo ferma solo la sua casella).
- Oggetto «Backup eventi TGI Sport · <giorno lungo>»; testo con quanti eventi (e quanti annullati) e deployment contiene, «Per ripristinare: dashboard → Impostazioni → Importa dal file Excel → scegli questo file.», link alla dashboard.

### Impostazioni → Notifiche email (dashboard)

- Casella «Backup settimanale (venerdì alle 18)» (salvata nelle proprietà dello script come i promemoria, accesa all'attivazione).
- Riga «Ultimo backup: venerdì 16 ottobre alle 18:04 · 152 eventi, 3 deployment» oppure «Ultimo backup non riuscito: <motivo>», «Nessun backup ancora inviato.», «Invio del venerdì non attivo: esegui attivaPromemoria nello script delle email.», «Script delle email da aggiornare: il backup non è ancora disponibile.».
- Tasto «Invia un backup adesso» (solo supervisori) → esito «Backup inviato a N indirizzi.».

### Attivazione

- `attivaPromemoria` crea anche l'attivatore `inviaBackup` (venerdì, ore 18, Europe/Rome) senza doppioni e scrive nel registro «Backup ogni venerdì tra le 18 e le 19 · backup acceso/spento».

## 2. Ripristino

- L'importazione riconosce un backup quando l'intestazione di Convocazioni contiene «ID evento»; altrimenti tratta il file come quello della stagione (comportamento invariato).
- **Eventi**: id dalla colonna P (riga senza id → id calcolato come per la stagione); tipo da O; stato da L; `daSostituire` da N; maggiorato da M; operatore per nome. Ritrovo e fine scritti a mano dalle colonne Q e R (vuote = automatici); `convocazioneCalcolata` e `fineCalcolata` ricalcolati con le regole del file, come quando si crea un evento. `inviata` per gli stati In attesa, Confermato, Rifiutato (e Annullato con operatore). Storico: «Ripristinato dal backup del <giorno>». Eventi presenti nella piattaforma ma non nel file: non si toccano.
- **Operatori**: per nome come oggi; nuovi senza codice; per tutti ruolo, contratto, email, telefono, mansione, on-site e attivo dal foglio Operatori.
- **Impostazioni**: tariffe, notturno, tariffa on-site, sport e competizioni/mansioni (compenso, ore, colore) dal foglio Impostazioni.
- **On-site**: non si reimporta (foglio da consultare).
- **Anteprima**: in più «Backup del <giorno>: N eventi da aggiornare, M da ricreare» e gli operatori che cambiano.

## 3. Verifiche

- **Prove automatiche** (`node --test`):
  - script: righe dei fogli (colonne, ordine, annullati, turni, date di Excel, orari), file `.xlsx` valido (le parti dello zip e il foglio Convocazioni rileggibili), email con allegato, nome e oggetto; destinatari; casella spenta → niente invio; lettura non riuscita → errore registrato; attivatore del venerdì senza doppioni; «Invia un backup adesso» solo per i supervisori;
  - importazione: backup riconosciuto, id/stato/tipo/gettone/da sostituire/orari scritti a mano ripresi, operatori aggiornati, file della stagione invariato;
  - riga dell'ultimo backup in Impostazioni.
- **Prova nel browser**: il file generato dalle prove si apre in Excel con i quattro fogli (Convocazioni, On-site, Operatori, Impostazioni) e si reimporta nella demo senza duplicati.

## 4. Messa in linea

1. **Sito** (`?v=26`).
2. **Script delle email**: nuova versione, poi eseguire **attivaPromemoria** una volta (crea l'invio del venerdì); nessuna nuova autorizzazione.
3. Nessuna regola di Firestore da cambiare.

## Fuori da questo blocco

- Disponibilità degli operatori nel backup.
- Ripristino dei deployment on-site.
- Conservazione dei backup su Google Drive.
