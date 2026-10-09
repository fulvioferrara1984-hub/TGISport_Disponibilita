# Blocco 3 — Deployment on-site

Data: 2026-10-09 · Stato: approvato nelle sezioni, in revisione come documento

## Obiettivo

Gestire le trasferte on-site, che seguono un percorso inverso rispetto al remoto: arriva la richiesta del cliente, il supervisore chiede agli operatori abilitati chi è disponibile, chi accetta occupa un posto ed è on-site in quei giorni (presenza conteggiata, non assegnabile al remoto, compenso di trasferta).

Terzo dei blocchi concordati: 1. convocazioni remote (fatto) → 2. promemoria automatici (fatto) → **3. deployment on-site** (questo documento). Promemoria, orari per competizione, gettoni e finestra di blocco del remoto **non** si applicano all'on-site.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Risposta «Accetto» | **Posti limitati, chi accetta prima è dentro** (A): la richiesta indica i posti TL e OP; accettare occupa subito un posto |
| Chi può andare on-site | **Abilitazione separata** (A): nella scheda operatore «On-site: no / TL / OP», il ruolo remoto resta |
| Posti per ruolo | Un abilitato on-site TL occupa solo posti TL, un on-site OP solo posti OP |
| Compenso | **Tariffa on-site giornaliera** nelle impostazioni (predefinita 150 €); compenso per persona = giorni × tariffa, modificabile per ogni richiesta; uguale per TL e OP, P.IVA e Coop; visibile solo ai supervisori |
| Convocazioni | **Compaiono da sole** (A): ogni giorno del deployment è una riga On-site nel calendario delle Convocazioni |
| Convocazioni remote negli stessi giorni | **Non si può accettare** (A) finché il supervisore non le libera |
| Archivio | **Una scheda per deployment** in un archivio a parte (approccio 1) |
| Ritiro dopo l'accettazione | Mai dal sito: si telefona al supervisore, che toglie la persona |

## 1. Dati

### Operatori (`operatori/{id}`)

- Nuovo campo `onsite`: `''` (no), `'TL'` oppure `'OP'`. Assente = no.

### Impostazioni (`impostazioni/regole`, solo supervisori)

- Nuovo valore `tariffaOnsite` (€ al giorno, predefinito 150).

### Deployment (`onsite/{id}`)

| Campo | Contenuto |
|---|---|
| `creato` | data e ora di creazione (ISO) |
| `titolo`, `luogo`, `sport`, `note` | testi (titolo e note facoltativi; luogo e sport obbligatori) |
| `giorni` | elenco ordinato e senza doppioni di `{ data: 'aaaa-mm-gg', attivita, partita }` |
| `da`, `a` | primo e ultimo giorno (per regole e filtri) |
| `posti` | `{ TL: intero ≥ 0, OP: intero ≥ 0 }`, almeno un posto in tutto |
| `destinatari` | id degli operatori a cui è stata mandata |
| `accettatiTL`, `accettatiOP` | id di chi ha occupato un posto, in ordine di accettazione |
| `rifiuti` | id di chi ha risposto «Non posso» |
| `esclusi` | id di chi è stato tolto dal supervisore (non può riaccettare) |
| `stato` | `aperta` (si accetta), `chiusa` (niente nuove accettazioni), `annullata` |

- Attività: `Travel Day`, `MD-1`, `MD`, `MD+1` oppure testo libero («Altro»); `partita` facoltativa, proposta solo per gli `MD`.
- Proposta automatica delle attività, modificabile: 1 giorno → `MD`; 2 giorni → `MD`, `Travel Day`; 3 o più → `Travel Day`, …, `MD-2`, `MD-1`, `MD`, `Travel Day` (es. 4 giorni: Travel Day, MD-1, MD, Travel Day).

### Compenso (`onsiteRiservato/{id}`, solo supervisori)

- `{ compenso: numero ≥ 0 }`: importo per persona per l'intero deployment. Separato perché gli operatori leggono la scheda del deployment ma non devono vedere il compenso.

### Presenze on-site

- Un operatore è **on-site** in un giorno se il giorno è in `giorni` di un deployment non `annullata` e il suo id è in `accettatiTL` o `accettatiOP`. Ruolo della presenza: on-site TL o on-site OP secondo la lista.
- È un dato calcolato, non salvato: disponibilità e convocazioni remote non vengono modificate.

## 2. Regole di Firestore

- `onsite/{id}`:
  - lettura: supervisore, oppure operatore attivo presente in `destinatari` (le letture dell'operatore filtrano con `destinatari array-contains <id>`);
  - creazione, eliminazione e qualunque modifica: supervisore;
  - **accettazione** dell'operatore: `stato == 'aperta'`, prima dell'inizio del giorno `da` (mezzanotte UTC, come la finestra di blocco del blocco 1), operatore attivo in `destinatari`, non in `esclusi`, non già in `accettatiTL`/`accettatiOP`; la sua abilitazione `onsite` è `TL` o `OP`; cambiano solo `accettati<abilitazione>` (= lista precedente + il suo id) e `rifiuti` (= lista precedente senza il suo id); la nuova lunghezza non supera `posti.<abilitazione>`;
  - **«Non posso»** dell'operatore: stesse condizioni su stato, data, destinatari, non accettato; cambia solo `rifiuti` (= lista precedente + il suo id, se non c'era).
- `onsiteRiservato/{id}`: solo supervisori.
- `invii`: invariato; l'operatore scrive le voci di Aggiornamenti con `tipo: 'onsite'` ed `evento: { id, luogo, da, a, stato: 'accettato' | 'rifiutato' }`.
- `operatori`: invariato (il campo `onsite` lo scrive solo il supervisore).
- Il controllo «hai già convocazioni remote in quei giorni» lo fa la pagina (le regole non possono cercare fra gli eventi).

## 3. Pagina operatore

- **Richieste on-site** (riquadro visibile solo se ce ne sono): deployment `aperta` il cui primo giorno è dopo oggi (dal primo giorno in poi non si accetta più), in cui l'operatore è destinatario e non è già dentro. Per ognuno: titolo, luogo, sport, note, l'elenco dei giorni («gio 12 ottobre · Travel Day», «sab 14 ottobre · MD · Italia-Francia»), il ruolo («posto on-site TL») e i posti liberi per quel ruolo. Tasti e casi:
  - **Accetto** → occupa il posto (transazione), scrive la voce in Aggiornamenti, fa partire l'email ai supervisori;
  - **Non posso** → resta segnato «Hai risposto: non posso» con **Ho cambiato idea, accetto** finché ci sono posti;
  - convocazioni remote già inviate (`convocato` o `confermato`) in uno dei giorni → al posto di Accetto: «Hai già convocazioni il 12 e il 13 ottobre: chiama il supervisore» con il numero di reperibilità;
  - nessun posto libero per il suo ruolo → «Posti esauriti»;
  - abilitazione on-site assente o diversa da qualunque posto → la richiesta non compare;
  - escluso dal supervisore → «Il supervisore ti ha tolto da questo deployment.».
- **Le tue convocazioni**: i deployment accettati e non passati compaiono come scheda **On-site** (date, attività, luogo, sport, ruolo) in ordine di data con le convocazioni remote, solo con «📞 Contatta il supervisore». Se il supervisore annulla un deployment accettato, la scheda mostra «Annullato dal supervisore» fino all'ultimo giorno.
- **Disponibilità**: i giorni on-site mostrano «On-site · luogo» e non si modificano; le modifiche non inviate su quei giorni vengono scartate come per i giorni bloccati.
- Se le regole nuove non sono ancora pubblicate (lettura negata), il riquadro non compare e la pagina funziona come prima.

## 4. Dashboard supervisori

### Richiesta (tasto «+ On-site» nella scheda Convocazioni)

- Primo e ultimo giorno → una riga per giorno con attività proposta (sezione 1), partita per gli `MD`, tasto per togliere il giorno.
- Titolo, luogo, sport (elenco degli sport delle impostazioni, o testo libero), note.
- Posti TL e OP.
- Compenso per persona: calcolato giorni × `tariffaOnsite`, si ricalcola quando cambiano i giorni finché non viene scritto a mano.
- Destinatari: solo operatori attivi con abilitazione on-site; preselezionati quelli il cui ruolo ha posti > 0; per ognuno l'indicazione «convocazioni remote in quei giorni» se ne ha.
- Casella «Invia anche un'email» (attiva di base).
- Controlli: almeno un giorno, primo giorno non passato, luogo e sport scritti, almeno un posto, almeno un destinatario, compenso ≥ 0.

### Calendario delle Convocazioni

- Ogni giorno di un deployment non annullato mostra una riga **On-site**: «MD · Italia-Francia · Roma · Rugby · TL 1/1 · OP 1/2» con i nomi di chi ha accettato. Le righe On-site non contano negli eventi da assegnare/inviare.
- Clic sulla riga → **scheda del deployment**: giorni, posti, compenso, e per ogni destinatario lo stato (accettato TL/OP, non può, nessuna risposta, tolto). Azioni:
  - **Togli** una persona accettata → torna libero il posto, la persona va in `esclusi`;
  - **Modifica** titolo, luogo, sport, note, posti (non sotto il numero di accettati), compenso, aggiunta di destinatari (con email facoltativa ai nuovi);
  - **Chiudi richiesta** / **Riapri**;
  - **Annulla deployment** (con conferma; definitivo).
  - Le date non si cambiano dopo la creazione: si annulla e se ne crea uno nuovo.

### Altri punti della dashboard

- **Griglia disponibilità**: per gli operatori on-site, nei giorni on-site la casella mostra «On-site» al posto della disponibilità.
- **Assegnazione remota**: nel menu operatori, chi è on-site quel giorno porta «⛔ on-site»; assegnarlo chiede conferma («… è in on-site a Roma: assegnare comunque?»). Un evento remoto già assegnato a chi risulta on-site quel giorno mostra il cartellino «⛔ in on-site».
- **Operatori**: nella finestra dell'operatore il campo «On-site» (No, On-site TL, On-site OP); in tabella il cartellino «on-site TL/OP».
- **Impostazioni → Tariffe e regole**: campo «Tariffa on-site (€ al giorno)».
- **Aggiornamenti**: «Ha accettato l'on-site · Roma 12–15 ottobre (TL)» e «Non può per l'on-site · Roma 12–15 ottobre».

## 5. Riepiloghi ed esportazioni

- **Riepilogo** (solo supervisori), per chi ha accettato un deployment non annullato:
  - per operatore: colonne **Giorni on-site** e **€ on-site**, comprese nel totale;
  - per mese: il compenso si divide in parti uguali sui giorni (es. 600 € su 4 giorni, 2 a ottobre e 2 a novembre → 300 € per mese);
  - per competizione: una riga **On-site** con giorni-persona e importi nelle colonne P.IVA/Coop secondo il contratto dell'operatore;
  - l'Excel del Riepilogo include l'on-site.
- **Esporta mese** (senza compensi):
  - foglio Convocazioni: una riga per giorno e per persona con Tipo «On-site», Sport, Evento «attività · partita · luogo», Operatore, Ruolo «On-site TL/OP», Stato «Confermato»;
  - foglio Presenze: nuova colonna **Giorni on-site**.
- I promemoria del blocco 2 leggono solo gli eventi remoti: l'on-site ne resta fuori senza modifiche.

## 6. Email (Apps Script)

- **`emailOnsite`** (solo supervisori): una email per destinatario con email valida. Oggetto «Richiesta on-site: Roma · 12–15 ottobre»; testo con saluto, giorni e attività, luogo, sport, ruolo richiesto, note, tasto «Rispondi sulla piattaforma». Mai il compenso.
- **`notificaOnsite`** (operatore): lo script legge il deployment con il gettone dell'operatore e verifica che sia davvero fra gli accettati; se le notifiche ai supervisori sono attive manda «On-site accettato: Marco Rossi · Roma 12–15 ottobre» con ruolo, posti («TL 1/1 · OP 2/2 · completo») e link alle Convocazioni.
- Nessuna email per «Non posso», per chi viene tolto e per l'annullamento.

## 7. Verifiche

- **Prove automatiche** (`node --test`): proposta delle attività; compenso giorni × tariffa; posti liberi e stato «completo»; giorni on-site di un operatore; convocazioni remote che bloccano l'accettazione; divisione del compenso per mese; righe on-site dell'esportazione mensile e colonna Giorni on-site; demo con le stesse condizioni delle regole (stato, data, destinatari, esclusi, abilitazione, posti, doppie accettazioni); email dello script (oggetti, assenza del compenso, verifica dell'accettazione).
- **Demo nel browser**: richiesta dalla dashboard, risposta dalla pagina operatore (anche in formato telefono), righe nel calendario, griglia, menu di assegnazione, scheda del deployment, riepilogo ed esportazione.
- **Regole sul progetto reale**: passi di prova forniti all'utente (accettazione, posti esauriti, doppia accettazione rifiutata).

## 8. Messa in linea

1. **Sito**: con le regole vecchie la lettura dei deployment è negata e la pagina operatori non mostra il riquadro, senza errori; la dashboard mostra un avviso nella scheda Convocazioni finché le regole non sono pubblicate.
2. **Regole Firestore**: incolla e pubblica.
3. **Script delle email**: nuova versione. Prima, le email on-site non partono e la dashboard dice che lo script va aggiornato.
4. **Dashboard**: abilitare gli operatori on-site e controllare la tariffa nelle impostazioni.

## Fuori da questo blocco

- Email agli operatori quando un deployment viene annullato o vengono tolti.
- Rimborsi spese, viaggi e alloggi.
- Cambio delle date dopo l'invio della richiesta.
- Promemoria automatici per l'on-site.
