# Ruoli e turni remoti: Remote TL e Remote Support

Data: 2026-10-09 · Stato: approvato nelle sezioni, in revisione come documento

## Obiettivo

Chiamare il turno di supervisione con il suo nome di mansione («Remote TL»), aggiungere un secondo tipo di turno («Remote Support») con il ruolo omonimo, gestire entrambi come voci di «Competizioni e sport» (colore, ore, compenso) e togliere dalle impostazioni le ore generali ormai doppie rispetto alle competizioni.

Si fa prima dei blocchi 7 (accessi in sola visualizzazione) e 8 (backup settimanale).

## Decisioni prese

| Tema | Decisione |
|---|---|
| Ruoli | **Uno per operatore** (A), ognuno comprende quelli sotto: Remote OP < Remote Support < Remote TL |
| Remote Support e partite | **Sì** (A): il Remote Support fa anche le partite |
| Competizione del turno | **Solo la mansione** (A): colore, ore e compenso dalla riga «Remote TL» / «Remote Support»; nessuna competizione seguita |
| «Supervisori» | Restano i supervisori della dashboard: cambia solo il nome del **turno** |

## 1. Ruoli e turni

### Ruoli (`operatori.ruolo`)

| Valore | Nome mostrato | Partite | Turni Remote Support | Turni Remote TL |
|---|---|---|---|---|
| `OP` | Remote OP | ✓ | | |
| `SUP` | Remote Support | ✓ | ✓ | |
| `TL` | Remote TL | ✓ | ✓ | ✓ |

- Gli operatori esistenti restano `OP` o `TL`; il menu Ruolo della scheda operatore ha tre voci.
- L'abilitazione on-site (`onsite: 'TL' | 'OP' | ''`) non cambia.

### Tipi di evento (`eventi.tipo`)

| Valore | Nome mostrato | Mansione |
|---|---|---|
| `partita` | Partita | — |
| `supervisione` | Remote TL (turno Remote TL) | `Remote TL` |
| `support` | Remote Support (turno Remote Support) | `Remote Support` |

- Il valore `supervisione` resta nei dati: i turni già creati diventano Remote TL senza modifiche.
- Per un turno la **competizione che conta è la mansione**, qualunque cosa ci sia nel campo `competizione` (i turni vecchi possono avere «Serie A»): colore, ore, compenso, filtro per competizione, riepiloghi.
- Nuovi turni: `competizione` = nome della mansione, `titolo` = nome della mansione, `orario` vuoto, `sport` vuoto.
- Nella settimana delle Convocazioni ogni giorno ha «+ Remote TL», «+ Remote Support» e «+ partite». La finestra del nuovo turno chiede solo periodo e ora di ritrovo (un turno per giorno).
- Fine turno = ritrovo + ore dopo della riga della mansione (scritta a mano sull'evento se serve, come oggi).
- Il Riepilogo si calcola ogni volta dai dati: anche i mesi passati mostrano i turni di supervisione sotto «Remote TL» e con il compenso della sua riga (per esempio un vecchio turno «Supervisione Champions League», finora Dimezzato, conta come Diurno se Remote TL è Diurno).

### Chi si può assegnare

- Menu operatore dell'evento, finestra «Chiedi disponibilità», avvertenze: secondo la tabella dei ruoli.
- Testi del menu: «— Scegli un Remote TL —», «— Scegli un Remote Support o Remote TL —», «— Scegli operatore —».
- Note delle finestre dei nuovi turni: «Si possono assegnare solo operatori con ruolo Remote TL.» / «Si possono assegnare operatori con ruolo Remote Support o Remote TL.».

## 2. Competizioni, impostazioni, nomi

### Competizioni e sport

- Intestazione «Competizione / mansione».
- Due righe fisse in cima, **Remote TL** e **Remote Support** (`mansione: true`): nome non modificabile, non eliminabili, senza sport; si cambiano colore, compenso (iniziale Diurno: notturno se il ritrovo è di notte) e **durata** (ore dopo il ritrovo, iniziale 6; per Remote TL il valore di «Durata supervisione» salvato finora). «Ore prima» per le mansioni vale sempre 0 e non si modifica.
- Se mancano nelle regole salvate, si aggiungono da sole.
- Le mansioni non compaiono fra le competizioni scelte per le **partite** (nuove partite, finestra dell'evento).

### Tariffe e regole

- Tolti «Ritrovo: ore prima», «Fine turno: ore dopo», «Durata supervisione: ore» e la loro nota.
- Le competizioni con ore vuote mostrano i valori usati finora (4 prima, 2 dopo) e li salvano al salvataggio successivo; una nuova competizione parte da 4 e 2. I valori generali restano nei dati solo come riserva.

### Nomi

«Supervisione» / «Turno di supervisione» diventa «Remote TL» / «Turno Remote TL» (e «Remote Support» / «Turno Remote Support» per il nuovo tipo) ovunque compare il **turno**:

- Convocazioni (righe, cartellini, finestra dell'evento, nuovi turni), calendario mensile;
- pagina operatore (convocazioni, richieste per evento);
- Riepilogo: per operatore «di cui Remote TL» e «di cui Remote Support»; per competizione Remote TL e Remote Support sono righe proprie (via la colonna «di cui supervisione»); stessi cambi nell'Excel del Riepilogo;
- Esporta mese: colonne Tipo ed Evento con «Remote TL» / «Remote Support»; Presenze con «Remote TL confermati» e «Remote Support confermati»;
- email dello script (convocazione, richiesta per evento, promemoria) e README.

### Importazione dal file Excel

- Righe «Supporto…» (file della stagione) e «Remote TL…» → turno Remote TL; «Remote Support…» → turno Remote Support.
- Chi ha turni Remote TL diventa `TL` (come oggi); chi ha turni Remote Support e oggi è `OP` diventa `SUP`.

## 3. Verifiche

- **Prove automatiche** (`node --test`):
  - ruoli: nomi e chi può fare cosa (`OP`/`SUP`/`TL` × partita/support/supervisione);
  - mansione dell'evento: turni vecchi con «Serie A» → Remote TL; colore, compenso e fine turno dalla riga della mansione;
  - regole: righe mansione aggiunte se mancano, durata Remote TL presa dalla vecchia durata della supervisione, competizioni con ore vuote completate con 4 e 2;
  - Esporta mese e Riepilogo con le colonne nuove;
  - importazione: «Supporto», «Remote TL», «Remote Support»;
  - script: promemoria che includono i turni Remote Support e testi «Turno Remote TL / Remote Support».
- **Demo nel browser**: creazione di turni Remote TL e Remote Support, menu operatori secondo il ruolo, riga mansione in Competizioni e sport, Tariffe e regole senza le ore, pagina operatore con i nuovi nomi.

## 4. Messa in linea

1. **Sito**: pubblicazione normale (`?v=23`); le pagine aperte mostrano «È uscita una nuova versione del sito».
2. **Script delle email**: nuova versione (prima, i promemoria ignorano i turni Remote Support e le email dicono ancora «supervisione»).
3. Nessuna regola di Firestore da cambiare.

## Fuori da questo blocco

- Più ruoli per lo stesso operatore.
- Competizione seguita da un turno Remote TL / Remote Support.
- Rinominare i «supervisori» della dashboard.
