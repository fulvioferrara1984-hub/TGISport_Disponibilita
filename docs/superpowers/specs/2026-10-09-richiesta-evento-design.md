# Blocco 6 — Richiesta di disponibilità per un singolo evento

Data: 2026-10-09 · Stato: approvato nelle sezioni, in revisione come documento

## Obiettivo

Trovare in fretta chi coprire una partita (o un turno di supervisione) remota: dal menu dell'evento il supervisore chiede ad alcuni operatori «sei disponibile per questa partita?», loro rispondono Sì o No dalla loro pagina, e chi ha detto sì compare in cima al menu di assegnazione. L'assegnazione resta del supervisore.

Terzo dei blocchi 4–8: 4 (fatto) → 5 (fatto) → **6. Richiesta di disponibilità per evento** (questo documento) → 7. Accessi in sola visualizzazione → 8. Backup settimanale.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Risposta | **Sì / No per quella partita** (B), non la disponibilità del giorno |
| Dopo un «Sì» | **Solo segnalazione** (A): il supervisore sceglie e assegna come sempre |
| Archivio | **Una scheda per evento** in un archivio nuovo; una nuova richiesta per lo stesso evento aggiunge destinatari alla stessa scheda |
| Eventi interessati | Partite e turni di supervisione remoti, non annullati, dal giorno stesso in poi |

## 1. Dati

### `richiesteEvento/{idEvento}` (id = id dell'evento)

| Campo | Contenuto |
|---|---|
| `destinatari` | id degli operatori a cui è stata chiesta |
| `messaggio` | testo facoltativo del supervisore (max 300) |
| `evento` | copia per gli operatori: `titolo`, `tipo`, `competizione`, `round`, `data`, `orario`, `ritrovo`, `fine` (orari già calcolati) |
| `aggiornata` | istante dell'ultima modifica di `evento` |
| `risposte` | mappa `idOperatore → { r: 'si' | 'no', il: istante }` |
| `aperta` | `true` finché serve una risposta |
| `assegnato` | id dell'operatore assegnato quando la richiesta si chiude per un'assegnazione, altrimenti `''` |
| `creata` | istante di creazione |

- Gli operatori non leggono gli eventi non inviati: per questo la scheda porta una copia dei dati della partita.
- Nessun compenso e nessuna nota interna nella copia.

### Allineamento automatico con l'evento

Ogni dashboard aperta confronta le richieste con gli eventi e corregge ciò che non torna (scritture idempotenti):

- **aperta** deve valere: evento esistente, non annullato, `data ≥ oggi`, e senza operatore oppure `rifiutato` oppure «da sostituire»;
- quando si chiude per un'assegnazione, `assegnato` = operatore dell'evento; quando si riapre, `assegnato` = `''`;
- se titolo, data, orari, competizione o round dell'evento cambiano, `evento` si aggiorna e `aggiornata` diventa l'istante attuale;
- evento eliminato: la scheda si chiude (`aperta: false`, `assegnato: ''`).

## 2. Regole di Firestore

- `richiesteEvento/{id}`:
  - lettura: supervisore, oppure operatore attivo presente in `destinatari` (le letture dell'operatore filtrano con `destinatari array-contains <id>`);
  - creazione, eliminazione e qualunque modifica: supervisore;
  - **risposta dell'operatore**: richiesta `aperta`, operatore attivo in `destinatari`, prima della fine del giorno `evento.data`; cambia solo `risposte`, e in `risposte` solo la propria voce, con esattamente `{ r: 'si' | 'no', il: request.time }`.
- `invii`: invariato; voci con `tipo: 'risposta-evento'` ed `evento: { id, titolo, data, risposta }`.

## 3. Dashboard

### «Chiedi disponibilità» (finestra dell'evento, tasto ⋯)

- Tasto nella finestra di modifica dell'evento, per eventi remoti non annullati con `data ≥ oggi`.
- Elenco degli operatori attivi (solo Remote TL per la supervisione), ordinati per nome, ciascuno con: disponibilità del giorno (✓ disponibile, ½ parziale con la nota, ✕ non disponibile, · non indicata), «ha già un turno» / «⛔ sovrapposto» / «⛔ on-site», «già chiesto» con la risposta se c'è.
- Preselezionati: disponibili e parziali senza altri impegni quel giorno e non ancora chiesti.
- Messaggio facoltativo, casella «Invia anche un'email» (attiva), tasto «Chiedi a N operatori».
- La richiesta compare subito sulla pagina degli operatori; le email partono in sottofondo come per le altre richieste.

### Risposte

- Nella finestra dell'evento: «Sì: Marco Rossi, Anna Neri · No: Luca Bianchi · In attesa: 2»; accanto a un Sì dato prima di una modifica dell'evento: «(prima della modifica)».
- Nel menu di assegnazione dell'evento, chi ha detto sì sale in cima con «✓ ha detto sì» (restano gli altri segni: ⛔ sovrapposto, ⛔ on-site…).
- Aggiornamenti: «Marco Rossi è disponibile per Roma-Lazio (sab 18 ott)» e «Luca Bianchi non è disponibile per Roma-Lazio (sab 18 ott)», con «Vedi evento».
- Email ai supervisori solo per i Sì, se le notifiche sono attive.

## 4. Pagina operatore

- Riquadro **«Ti chiediamo se sei disponibile»** (in cima, solo se c'è qualcosa da mostrare), una voce per richiesta:
  - **aperta**: partita («Roma-Lazio · Serie A, giornata 9»), giorno e orari («sab 18 ottobre · evento 20:45 · ritrovo 16:45 – fine 22:45»; per la supervisione «turno 10:00 – 16:00»), messaggio del supervisore, tasti **Sì, sono disponibile** e **No**; dopo la risposta «Hai risposto: sì» (o no) con il tasto per cambiarla;
  - **chiusa con un altro operatore assegnato** e risposta «sì»: «Posto già coperto, grazie», fino al giorno dell'evento;
  - chiusa e assegnata a lui stesso, annullata o passata: non compare (la convocazione arriva come sempre).
- Rispondere si può anche dentro la finestra di blocco.
- La disponibilità settimanale non cambia: il Sì vale solo per quella partita.
- Con le regole non ancora pubblicate (lettura negata) il riquadro non compare e la pagina funziona come prima.

## 5. Email (Apps Script)

- **`emailRichiestaEvento`** (solo supervisori): a ogni destinatario con email valida. Oggetto «Sei disponibile? Roma-Lazio · sabato 18 ottobre»; testo con saluto, partita, competizione, giorno, orari, messaggio, tasto «Rispondi sulla piattaforma».
- **`notificaRispostaEvento`** (operatore): lo script legge la richiesta con il gettone dell'operatore e verifica che la sua risposta sia «si»; se le notifiche ai supervisori sono attive manda «Marco Rossi è disponibile per Roma-Lazio (sabato 18 ottobre)» con il link alle Convocazioni. Nessuna email per i «No».

## 6. Verifiche

- **Prove automatiche** (`node --test`):
  - calcolo dell'allineamento (aperta/chiusa per ogni stato dell'evento, assegnato, evento eliminato, copia aggiornata solo quando cambiano i campi della partita);
  - stato della voce sulla pagina operatore (da rispondere, risposto sì/no, posto già coperto, nascosta);
  - «prima della modifica» (risposta precedente ad `aggiornata`);
  - preselezione dei destinatari;
  - demo con le stesse condizioni delle regole (non destinatario, richiesta chiusa, giorno passato, sola propria risposta);
  - email dello script (oggetto, verifica della risposta, nessuna email per i No o con notifiche spente).
- **Demo nel browser**: richiesta dalla finestra dell'evento, risposta dalla pagina operatore (anche in formato telefono), «✓ ha detto sì» nel menu, chiusura all'assegnazione e riapertura togliendo l'operatore, Aggiornamenti.

## 7. Messa in linea

1. **Sito**: prima delle regole nuove il tasto «Chiedi disponibilità» mostra «Pubblica le nuove regole di Firestore (vedi README).»; la pagina operatori non mostra il riquadro.
2. **Regole Firestore**: incolla e pubblica.
3. **Script delle email**: nuova versione; prima, le email non partono e la dashboard lo segnala.
4. Ricaricare la dashboard su ogni computer dei supervisori.

## Fuori da questo blocco

- Assegnazione automatica al primo «Sì».
- Richiesta per più eventi in una volta (resta «Richiedi disponibilità» per periodo).
- Promemoria automatici per le richieste senza risposta.
