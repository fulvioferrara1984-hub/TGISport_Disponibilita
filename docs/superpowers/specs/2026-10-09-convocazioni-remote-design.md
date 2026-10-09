# Blocco 1 — Convocazioni remote più solide

Data: 2026-10-09 · Stato: approvato nelle sezioni, in revisione come documento

## Obiettivo

Ridurre le rinunce last-minute e arrivare a ridosso degli eventi remoti con dati stabili: gli operatori non possono più cambiare disponibilità o rinunciare a una convocazione negli ultimi giorni (devono telefonare), i turni hanno un orario di fine per competizione che rende visibili le vere sovrapposizioni, e il supervisore può esportare il mese in Excel solo con le presenze.

Fa parte di tre blocchi concordati: **1. convocazioni remote** (questo documento) → 2. promemoria automatici via email → 3. deployment on-site. Tutto ciò che segue vale **solo per gli eventi remoti** (partite e turni di supervisione esistenti).

## Decisioni prese

| Tema | Decisione |
|---|---|
| Contatto | "Contatta il supervisore" apre una **telefonata** a un **numero unico di reperibilità** impostato dai supervisori |
| Ambito del blocco | **Disponibilità e convocazioni** (opzione B) |
| Finestra di blocco | Un giorno/evento è bloccato se **mancano N giorni o meno** (N configurabile, proposta 3). Esempio N = 3: evento lunedì → bloccato da venerdì |
| "Non posso più" | Sostituito **sempre** da "Contatta il supervisore": una convocazione confermata si annulla solo telefonando |
| Doppio turno | Avviso a **due livelli**: giallo se gli orari non si toccano, rosso se si sovrappongono; in entrambi i casi si può confermare |
| Applicazione del blocco | **Pagina + regole di Firebase** per le convocazioni; **solo pagina** per le disponibilità |

## 1. Impostazioni e dati

### Orari per competizione (`impostazioni/regole`, solo supervisori)

- Ogni competizione in `competizioni[]` riceve due campi facoltativi: `prima` (ore prima dell'evento = ritrovo) e `dopo` (ore dopo l'inizio dell'evento = fine turno). Es. Serie A 4/2, Ligue 1 4/2, Champions League 1/2.
- Valori generali usati quando la competizione non li ha: `anticipoOre` (esistente, 4) e il nuovo `fineOre` (default 2).
- Precedenza del ritrovo: ritrovo scritto a mano sull'evento → `prima` della competizione → `anticipoOre`.
- Fine turno: fine scritta a mano sull'evento (nuovo campo `fine`, "HH:MM") → orario evento + `dopo` della competizione → orario evento + `fineOre`.
- **Supervisione**: inizio = ritrovo scritto dal supervisore (come oggi); fine = `fine` scritta a mano, facoltativa (nessun calcolo automatico).
- Il **notturno** resta calcolato sul ritrovo (22:00–06:00, configurabile come oggi).
- Interfaccia: nella scheda *Competizioni e sport* due campi numerici per riga ("ritrovo: ore prima", "fine: ore dopo", vuoti = valori generali); in *Tariffe e regole* si aggiunge "fine turno: ore dopo".

### Regole per gli operatori (`impostazioni/operativo`, nuovo documento)

- `telefono`: numero di reperibilità chiamato da "Contatta il supervisore".
- `giorniBlocco`: N (default 3).
- Leggibile da operatori attivi e supervisori, modificabile solo dai supervisori. Le tariffe restano in `impostazioni/regole`, riservato ai supervisori.
- Interfaccia: nuovo riquadro *Regole per gli operatori* nelle Impostazioni.

### Eventi

- Nuovo campo `fine` (fine turno scritta a mano, facoltativa) e nuovo campo salvato `fineCalcolata`, scritto come già `convocazioneCalcolata` alla creazione, modifica, importazione e invio: l'operatore non legge le regole riservate.
- Eventi esistenti: in dashboard prendono subito i nuovi orari (calcolati al momento); le convocazioni già inviate mostrano agli operatori gli orari salvati all'invio finché non vengono reinviate.

## 2. Lato operatore (`index.html`, `app/operatore.js`)

- **Giorno bloccato**: `data − oggi ≤ giorniBlocco` (in giorni di calendario). Con N = 3 e oggi venerdì 9: bloccati 9, 10, 11, 12; il 13 no.
- **Disponibilità**: i giorni bloccati sono in sola lettura come i passati, con etichetta "Bloccato: contatta il supervisore". Le scorciatoie (*Tutta la settimana*, *Copia settimana precedente*) li ignorano. Le modifiche non inviate su giorni diventati bloccati vengono scartate all'apertura con un avviso. Il riepilogo "giorni da compilare" e le richieste dei supervisori non contano i giorni bloccati.
- **Convocazioni**:
  - *in attesa*, fuori finestra: **Confermo** · **Non posso** (con motivo facoltativo, come oggi);
  - *in attesa*, nella finestra: **Confermo** · **📞 Contatta il supervisore** + riga "Mancano N giorni o meno: per rinunciare chiama il supervisore";
  - *confermata* (sempre): stato "Confermata" · **📞 Contatta il supervisore**;
  - *rifiutata*, fuori finestra: "Posso, confermo" resta disponibile; nella finestra: solo stato;
  - *annullata*: come oggi.
- "📞 Contatta il supervisore" è un link `tel:` al numero di reperibilità; se il numero non è impostato, il tasto mostra "Chiedi ai supervisori il numero di reperibilità" e non chiama.
- Il rifiuto ("Non posso", con motivo facoltativo) resta solo per le convocazioni *in attesa* **fuori** dalla finestra.
- Orari mostrati: "Ritrovo 14:30 – fine turno 20:30" (supervisione: "Turno 10:00 – 16:00" se c'è la fine).

## 3. Lato supervisore (`admin.html`, `app/convocazioni.js`, `app/riepilogo.js` per l'export)

- **Righe del calendario**: ritrovo e fine turno ("ritrovo 16:45 · fine 22:45").
- **Sovrapposizione**: due turni dello stesso operatore nello stesso giorno si sovrappongono se `inizioA < fineB` e `inizioB < fineA`, dove inizio = ritrovo e fine = fine turno; se manca la fine di un turno (supervisione senza fine), si considera la fine di giornata (23:59). Fine turno oltre la mezzanotte: conta come 23:59 dello stesso giorno ai fini del confronto.
  - Menu operatori: "⛔ sovrapposto" al posto di "⚠ già impegnato" quando c'è sovrapposizione.
  - Avviso sulla riga: giallo "⚠ Doppio turno: anche …" oppure rosso "⛔ Turni sovrapposti con …".
  - All'assegnazione: conferma con testo diverso per i due casi; l'assegnazione resta possibile.
- **⏰ A ridosso**: etichetta sulle righe nella finestra di blocco che sono *da assegnare* o *in attesa di risposta*.
- **Esporta mese** (nella scheda Convocazioni): scelta del mese, file Excel con due fogli, **senza compensi**:
  1. *Convocazioni*: data, tipo, competizione, round, sport, evento, orario, ritrovo, fine turno, operatore, ruolo, stato;
  2. *Presenze*: per operatore, partite confermate, supervisioni confermate, convocazioni in attesa; gli annullati non contano.
- I supervisori non sono soggetti al blocco.

## 4. Sicurezza, email, verifiche, messa in linea

### Regole Firestore

- `impostazioni/operativo`: `read` se supervisore o operatore attivo; `write` solo supervisore. `impostazioni/{altro}`: invariato (solo supervisore).
- `eventi/{id}`, aggiornamento da operatore: come oggi, più — il passaggio a `rifiutato` è permesso solo da `convocato` (mai da `confermato`) e solo se `request.time < data_evento − giorniBlocco giorni` (data evento ricavata dalla stringa `yyyy-mm-dd`, N letto da `impostazioni/operativo`, default 3 se il documento manca). Il passaggio a `confermato` resta sempre permesso dalle regole; è la pagina a non offrire "Posso, confermo" dentro la finestra.
- Disponibilità: nessuna modifica alle regole (blocco solo sulla pagina).

### Email (Apps Script)

- `emailConvocazioni` mostra anche la fine turno (`fine`). Da ripubblicare con "Nuova versione".

### Verifiche

- Calcoli (in `app/regole.js`): ritrovo e fine per competizione, precedenze dei valori a mano, sovrapposizione con casi: Serie A −4h/+2h, Champions −1h/+2h, partita a cavallo di mezzanotte, supervisione con e senza fine.
- Finestra di blocco: esempio lunedì/venerdì e casi limite (N = 0, oggi stesso, evento passato).
- Schermate operatore e supervisore nella demo, anche in formato telefono; esportazione mensile aperta e controllata.
- Regole sul progetto reale: verificabile da fuori che senza accesso nulla si legge; i casi "rifiuto dentro/fuori finestra" vanno provati con l'utente di prova (passi forniti).

### Messa in linea

1. Pubblicare le nuove regole Firestore.
2. Pubblicare il sito.
3. Ripubblicare lo script delle email. Fino a quel momento le email di convocazione partono senza fine turno.

## Fuori da questo blocco

- Promemoria email automatici (blocco 2): solo remoto, a X giorni dall'evento, per partite senza operatore e convocazioni in attesa.
- Deployment on-site (blocco 3): ruoli on-site TL/OP, richiesta con calendario e attività per giorno, accettazione, presenze on-site, compenso configurabile (base 600 € per 4 giorni), blocco sugli eventi remoti. Orari per competizione e promemoria non si applicano all'on-site.
- Modifica delle disponibilità di un operatore da parte del supervisore: non prevista.
