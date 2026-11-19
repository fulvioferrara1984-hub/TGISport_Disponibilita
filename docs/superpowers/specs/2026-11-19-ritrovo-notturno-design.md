# Ritrovo del giorno prima per le partite notturne

Data: 2026-11-19. Modifica piccola: descrizione breve.

## Perché

Una partita di sabato 21/11 alle 02:00 (Hobart – Sydney) con 4 ore di anticipo ha il ritrovo **venerdì 20 alle 22:00**. La piattaforma salva il giorno della partita e gli orari come «ore:minuti»; togliendo l'anticipo l'orario passa la mezzanotte (02:00 → 22:00) ma il giorno resta il 21. Così l'operatore legge «sab 21 · Ritrovo 22:00» e rischia di presentarsi un giorno dopo. Fulvio vuole che il sistema dia il ritrovo giusto, all'operatore e nel calendario del telefono.

Riprodotto con il codice pubblicato (v41):

- il calendario del telefono è già giusto: venerdì 20 dalle 22:00 alle 04:00 di sabato;
- sbagliano la scheda e le viste settimana e mese dell'operatore, l'elenco, il calendario e i messaggi dei supervisori;
- sbaglia l'ordine: la partita notturna finisce dopo una partita di sabato pomeriggio;
- il controllo dei turni sovrapposti non vede un turno di venerdì sera e segnala per errore un turno di sabato sera.

## Obiettivi

- Il ritrovo si legge con il suo giorno quando non è quello della partita: «Ritrovo ven 20 alle 22:00».
- Le convocazioni si ordinano per il momento vero del ritrovo.
- I turni sovrapposti si riconoscono anche a cavallo della mezzanotte, sia per i supervisori (assegnazione) sia per l'operatore (conferma).

## Fuori dal lavoro

- I dati salvati non cambiano: il ritrovo resta «22:00» con il giorno della partita. Niente da aggiornare nelle partite esistenti, nelle copie inviate agli operatori, nelle regole di Firebase o nello script.
- Riepilogo, esportazioni e backup restano com'erano (colonne Data e Ritrovo uguali).
- Compensi: il notturno si conta già dall'ora del ritrovo, non cambia.
- Disponibilità: per convocare una partita del 21 la griglia guarda ancora la disponibilità del 21, non della sera del 20 (deciso da Fulvio: per ora resta così).
- Giorni di blocco e rinuncia restano legati al giorno della partita.

## Strade considerate

1. **Una sola regola per il giorno del ritrovo, usata ovunque** — scelta da Fulvio. Se il ritrovo viene dopo l'orario della partita, è del giorno prima. Sta in `app/comune.js`, letto da tutte e due le pagine, e prende il posto delle due copie che oggi esistono (calendario del telefono in `app/agenda.js`, «evento già iniziato» in `app/regole.js`).
2. Salvare anche il giorno del ritrovo in ogni partita: scartata, perché richiede di aggiornare partite, copie e regole di Firebase per lo stesso risultato.
3. Correggere solo la pagina degli operatori: scartata, perché lascia sbagliati elenco, messaggi e controlli dei supervisori.

## Decisioni

- **Giorno mostrato:** la convocazione resta sotto il giorno della partita, ovunque; il ritrovo porta il suo giorno quando è diverso (scelta di Fulvio, 2026-11-19).
- **La regola:** il ritrovo è del giorno prima quando c'è l'orario della partita e il ritrovo, in minuti, viene dopo. Il confronto si fa in minuti, non tra testi, così «2:00» vale come «02:00». I turni remoti non hanno orario della partita e restano sul loro giorno. Ritrovo uguale all'orario vuol dire stesso giorno.
- **Come si scrive (mia scelta):** «ven 20 alle 22:00» nelle righe brevi, cioè giorno breve, numero e ora, come nell'anteprima approvata. Dove il ritrovo è dello stesso giorno, il testo resta com'è oggi.
- **Dove:** scheda, viste settimana e mese e pannello del giorno dell'operatore; richieste di disponibilità per l'evento; elenco, calendario e popup della griglia dei supervisori; finestra dell'evento («automatico 22:00 del giorno prima»); messaggio di convocazione; descrizione dell'evento nel calendario del telefono.
- **Sovrapposizioni:** gli orari si confrontano come momenti veri (giorno più ora), con la fine dopo mezzanotte che passa al giorno dopo. «Doppio turno» resta per due impegni dello stesso giorno della partita che non si toccano; «sovrapposto» vale anche tra giorni vicini.
- **Versione:** v42.

## Lasciato a chi lo costruisce

- Il nome e la forma esatta delle funzioni condivise, purché una sola regola serva tutte e due le pagine.
- Come andare a capo nelle colonne strette dell'elenco dei supervisori.
