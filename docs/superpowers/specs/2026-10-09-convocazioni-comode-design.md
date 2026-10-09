# Blocco 4 — Convocazioni più comode

Data: 2026-10-09 · Stato: approvato nelle sezioni, in revisione come documento

## Obiettivo

Rendere la scheda Convocazioni più rapida da leggere e da usare: la giornata di campionato in una sola settimana, le competizioni riconoscibili dal colore, un calendario mensile a schermo intero con lo stato di copertura a colpo d'occhio, e la possibilità di inviare solo una parte delle convocazioni pronte.

Primo dei blocchi 4–8 concordati: **4. Convocazioni più comode** (questo documento) → 5. Operatori e compensi → 6. Richiesta di disponibilità per evento → 7. Accessi in sola visualizzazione → 8. Backup settimanale.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Settimana delle Convocazioni | **Da martedì a lunedì**, solo nella scheda Convocazioni |
| Colori delle competizioni | **Automatici ma modificabili** (B) in Impostazioni → Competizioni e sport |
| On-site | **Sempre lo stesso colore** (viola), qualunque sport o competizione |
| Calendario mensile | **Modalità a schermo intero**, separata dalla vista settimanale |
| «A ridosso» | La **finestra di blocco** già impostata (`giorniBlocco`, oggi 3 giorni) |
| Colori di stato nel calendario | **A**: verde confermato, blu operatore scelto non confermato, rosso/arancione senza operatore (rifiutati e da sostituire compresi), annullati nascosti, bordino con il colore della competizione |
| Righe del calendario | **Da lunedì a domenica** (B), come Outlook |

## 1. Settimana da martedì a lunedì

- La vista settimanale delle Convocazioni mostra 7 giorni a partire dal **martedì** che precede (o coincide con) il giorno di riferimento: lunedì 12 ottobre appartiene alla settimana di martedì 6.
- Frecce: ±7 giorni. «Oggi»: la settimana martedì–lunedì che contiene oggi. Arrivando da Aggiornamenti, dalla scheda on-site o da un evento del calendario si apre la settimana martedì–lunedì che contiene quel giorno.
- Il mese proposto per «Esporta mese» resta quello del primo giorno mostrato.
- Griglia disponibilità, pagina operatori ed esportazioni restano da lunedì a domenica.

## 2. Colori per competizione

- Tavolozza fissa di **12 colori** ben distinguibili su fondo chiaro. Il colore automatico di una competizione si ricava dal **nome** (sempre lo stesso colore per lo stesso nome, anche cambiando l'ordine dell'elenco).
- `impostazioni/regole` → `competizioni[]` riceve il campo facoltativo `colore` (`#rrggbb`); vuoto o non valido = automatico. Le competizioni già salvate senza `colore` restano valide.
- **Impostazioni → Competizioni e sport**: in ogni riga un selettore di colore che parte dal colore in uso; un comando «Automatico» toglie la scelta.
- Competizioni presenti negli eventi ma non nelle impostazioni: colore automatico.
- **On-site**: sempre viola (`#5b34c9`), che non fa parte della tavolozza delle competizioni.
- **Vista settimanale**: fascia colorata di 4 px a sinistra di ogni riga evento (i turni di supervisione prendono il colore della loro competizione; supervisione senza competizione = grigio neutro); le righe On-site hanno la fascia viola.

## 3. Invio di una selezione

- «Invia convocazioni» apre l'elenco delle convocazioni `assegnato` da oggi in poi, **raggruppate per operatore**:
  - una casella per l'operatore (seleziona/deseleziona tutte le sue) e una per ogni convocazione;
  - ogni riga: giorno, evento, competizione, ritrovo;
  - tutte spuntate all'apertura; restano le indicazioni attuali «(senza email)» e «(senza codice: non può ancora vederle)».
- Il tasto mostra il numero scelto («Invia 3 convocazioni») ed è disattivato con zero.
- Si inviano solo le spuntate (email comprese); le altre restano «Da inviare».

## 4. Calendario mensile a schermo intero

### Apertura e barra

- Tasto **«Calendario»** nella barra delle Convocazioni → livello che copre l'intera finestra sopra la dashboard.
- Barra in alto: **‹ mese anno ›**, **Oggi**, **legenda** dei colori di stato, **Schermo intero** (modalità a tutto schermo del browser, se disponibile), **Chiudi**; anche **Esc** chiude.
- Si apre sul mese del giorno di riferimento della vista settimanale.

### Griglia

- 7 colonne **lunedì → domenica**, 5 o 6 righe; giorni fuori mese attenuati, oggi evidenziato.
- In ogni giorno solo gli eventi (annullati esclusi), in ordine di orario:
  - partita: «20:45 Roma-Lazio» (orario dell'evento);
  - supervisione: «10:00 Supervisione Serie A» (ritrovo);
  - on-site: una voce per giorno di deployment non annullato, «ON-SITE · Italia-Francia» se c'è la partita, altrimenti «ON-SITE · Travel Day · Roma».
- Se gli eventi non entrano nella cella: le prime voci e «+N altri».

### Colori di stato

| Colore | Eventi remoti | On-site |
|---|---|---|
| Verde | `confermato` (e non da sostituire) | tutti i posti presi |
| Blu | operatore scelto, non ancora confermato (`assegnato`, `convocato`) | qualcuno ha accettato, restano posti |
| Rosso | senza operatore, oppure `rifiutato` o da sostituire, e il giorno è dentro la finestra di blocco | nessuno ha accettato e il primo giorno è dentro la finestra di blocco |
| Arancione | come il rosso, ma fuori dalla finestra di blocco | nessuno ha accettato, fuori finestra |

- Bordino sinistro con il colore della competizione (viola per l'on-site).
- Un giorno già passato mantiene i colori (utile per rivedere il mese).

### Dettagli e clic

- **Passaggio del mouse** (tocco sul telefono): riquadro con titolo, competizione e giornata, orario dell'evento, ritrovo – fine turno, operatore e stato, note. Per l'on-site: luogo, sport, attività del giorno, partita, posti («TL 1/1 · OP 1/2»), chi ha accettato.
- **Clic su un evento**: il calendario si chiude e si apre la settimana martedì–lunedì di quel giorno; per l'on-site si apre la scheda del deployment.
- **Clic su «+N altri»**: si apre la settimana di quel giorno.
- Il calendario usa i dati già presenti nella dashboard (nessuna lettura in più) e si ridisegna quando arrivano aggiornamenti.
- Al telefono la griglia resta a 7 colonne con voci più compatte (solo orario e titolo abbreviato).

## 5. Verifiche

- **Prove automatiche** (`node --test`):
  - inizio settimana martedì: lunedì → martedì precedente, martedì → sé stesso, domenica → martedì precedente;
  - colore automatico: stesso nome → stesso colore, colore scelto vince, colore non valido → automatico;
  - colore di stato degli eventi remoti per ogni stato, con la finestra di blocco (es. N = 3) e annullati esclusi;
  - colore di stato dell'on-site (completo, in parte, nessuno dentro/fuori finestra);
  - giorni della griglia del mese (inizio lunedì, 5 o 6 settimane, giorni fuori mese segnati).
- **Demo nel browser**: settimana martedì–lunedì e navigazione, fasce colorate e on-site viola, colore scelto in impostazioni che resta dopo il ricaricamento, invio di una selezione (le non spuntate restano «Da inviare»), calendario con colori, riquadro dei dettagli, clic su evento/on-site/«+N altri», Esc, formato telefono, console senza errori.

## 6. Messa in linea

Solo sito (nessuna regola Firestore né script da aggiornare): pubblicazione normale con nuovo `?v=`.

## Fuori da questo blocco

- Settimana martedì–lunedì nella griglia disponibilità o nella pagina operatori.
- Trascinamento degli eventi nel calendario, creazione di eventi dal calendario.
- Colori per competizione nella pagina operatori.
