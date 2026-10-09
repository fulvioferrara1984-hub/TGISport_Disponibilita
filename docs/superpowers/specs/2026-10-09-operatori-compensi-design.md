# Blocco 5 — Operatori e compensi

Data: 2026-10-09 · Stato: approvato nelle sezioni, in revisione come documento

## Obiettivo

Tre interventi sulla gestione degli operatori e dei compensi: mandare il codice personale con una email già pronta in Outlook, chiamare i ruoli remoti con il loro nome («Remote TL», «Remote OP») e scegliere per ogni competizione il tipo di compenso al posto della casella «UEFA ½».

Secondo dei blocchi 4–8: 4. Convocazioni più comode (fatto) → **5. Operatori e compensi** (questo documento) → 6. Richiesta di disponibilità per evento → 7. Accessi in sola visualizzazione → 8. Backup settimanale.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Apertura dell'email | **App di posta predefinita** del computer (A): Outlook se impostato come predefinito su Mac e Windows |
| «Diurno» | **Calcolo normale** (A): diurno, notturno da solo se il ritrovo è nelle ore notturne; Notturno, Maggiorato e Dimezzato valgono sempre |
| Maggiorato sull'evento | Continua a prevalere su tutto |
| Ruoli | Cambia solo il nome mostrato: i dati restano `TL` / `OP` |

## 1. Tasto «Invia mail» (finestra del codice personale)

- Nella finestra che mostra il codice appena creato o rigenerato, **«Invia mail»** prende il posto di «Copia messaggio d'invito» e apre `mailto:` con:
  - **destinatario**: l'email dell'operatore (vuoto se non registrata);
  - **oggetto**: «TGI Sport · il tuo codice per le disponibilità»;
  - **testo**: lo stesso messaggio di oggi — «Ciao <nome>, da ora puoi indicare le tue disponibilità settimanali per TGI Sport qui:» + link d'invito + «Il tuo codice personale è <codice>: non condividerlo.» — con gli a capo.
- Senza email registrata: l'email si apre comunque senza destinatario e la finestra mostra «Nessuna email registrata: scrivi tu il destinatario.».
- Resta un link **«Copia il testo»** con lo stesso messaggio (per WhatsApp).
- Nessuna email parte dal sito: la manda il supervisore da Outlook.

## 2. Ruoli «Remote TL» e «Remote OP»

- Nome mostrato: `TL` → «Remote TL», `OP` → «Remote OP», ovunque appaia il ruolo remoto: menu e tabella degli operatori, nota dei turni di supervisione («solo operatori con ruolo Remote TL»), menu dei turni di supervisione, Riepilogo, colonne «Ruolo» dell'Excel del Riepilogo e di «Esporta mese» (le righe on-site restano «On-site TL/OP»).
- Dati salvati invariati (`ruolo: 'TL' | 'OP'`); l'importazione dal file Excel continua a leggere TL/OP.

## 3. Tipo di compenso per competizione

- `impostazioni/regole` → `competizioni[]` riceve `compenso`: `'diurno' | 'notturno' | 'maggiorato' | 'dimezzato'`.
- Competizioni già salvate senza `compenso`: `uefa: true` → `'dimezzato'`, altrimenti `'diurno'`. Il campo `uefa` non si scrive più nei salvataggi successivi.
- **Calcolo del gettone** di un evento, in quest'ordine:
  1. evento con «Maggiorato» → maggiorato;
  2. competizione `maggiorato` → maggiorato;
  3. competizione `dimezzato` → metà del diurno;
  4. competizione `notturno` → notturno;
  5. competizione `diurno` (o sconosciuta) → notturno se il ritrovo cade nelle ore notturne impostate (oggi 22–06), altrimenti diurno.
- **Impostazioni → Competizioni e sport**: in ogni riga un menu **Compenso** (Diurno, Notturno, Maggiorato, Dimezzato) al posto della casella «UEFA ½»; intestazione «Compenso». La nota delle tariffe diventa: «Il tipo di compenso si sceglie per competizione (Competizioni e sport); il maggiorato anche sul singolo evento.»
- **Scritte**: il tipo di gettone «UEFA (½ diurno)» diventa «Dimezzato (½ diurno)»; il cartellino «UEFA ½» sugli eventi e nel Riepilogo diventa «Dimezzato»; la colonna «UEFA ½» del Riepilogo e dell'Excel diventa «Dimezzati».
- **Importazione dal file Excel**: le competizioni riconosciute come UEFA (Champions, Europa, Conference League) entrano come `dimezzato`, le altre nuove come `diurno`.
- I compensi già calcolati non cambiano: con le competizioni migrate il risultato è identico a oggi.

## 4. Verifiche

- **Prove automatiche** (`node --test`):
  - gettone per ciascun tipo di competizione con ritrovo di giorno e di notte; Maggiorato sull'evento che prevale su Dimezzato e su Notturno; competizione sconosciuta come Diurno;
  - migrazione: `uefa: true` senza `compenso` → `dimezzato`, `uefa` assente → `diurno`, `compenso` non valido → `diurno`;
  - nomi dei ruoli: `TL` → «Remote TL», `OP` → «Remote OP»;
  - testo e indirizzo `mailto:` (destinatario, oggetto, a capo, caratteri speciali codificati; senza email → destinatario vuoto);
  - esportazione mensile con «Remote TL/OP» nella colonna Ruolo.
- **Demo nel browser**: finestra del codice con «Invia mail» e «Copia il testo», menu Compenso salvato e ricaricato, cartellino «Dimezzato» sugli eventi Champions, Riepilogo con «Dimezzati», ruoli «Remote» in operatori e Riepilogo, console senza errori.

## 5. Messa in linea

Solo sito (nessuna regola Firestore né script da aggiornare): pubblicazione normale con nuovo `?v=`. Su ogni computer dei supervisori Outlook va impostato come app di posta predefinita (istruzioni date in chat e nel README).

## Fuori da questo blocco

- Invio dell'email direttamente dal sito o dallo script (resta da Outlook).
- Tariffe diverse per competizione oltre ai quattro tipi.
