# Blocco 7 — Accessi in sola visualizzazione

Data: 2026-10-09 · Stato: approvato nelle sezioni, in revisione come documento

## Obiettivo

Dare ad alcuni colleghi un accesso alla dashboard in sola lettura: vedono **Convocazioni**, **Riepilogo** e **Operatori**, non modificano nulla. I supervisori li aggiungono e li tolgono dalla dashboard.

Penultimo dei blocchi concordati: … → **7. Accessi in sola visualizzazione** (questo documento) → 8. Backup settimanale.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Elenco dei colleghi | **Dalla dashboard** (A): Impostazioni → «Accessi in sola visualizzazione», effetto immediato, nessuna regola da ripubblicare per ogni collega |
| Riepilogo | **Completo** (A): importi compresi, Excel del Riepilogo ed «Esporta mese» scaricabili |
| Accesso | Stessa pagina dei supervisori, account con email e password, indirizzo confermato |

## 1. Accessi e regole

### Archivio `visualizzatori/{email}` (id = email in minuscolo)

| Campo | Contenuto |
|---|---|
| `email` | l'email del collega (minuscolo) |
| `aggiunto` | istante in cui è stato aggiunto |
| `da` | email del supervisore che l'ha aggiunto |

### Dashboard dei supervisori

- **Impostazioni → «Accessi in sola visualizzazione»**: elenco delle email (ordinate), campo email + «Aggiungi», per ogni riga «Invia mail» e «Togli» (con conferma «Togliere l'accesso a <email>?»).
- Email non valida → «Scrivi un'email valida.»; email di un supervisore → «È già un supervisore.»; già presente → «È già nell'elenco.».
- «Invia mail» apre l'app di posta (`DO.mailto`) con destinatario, oggetto «TGI Sport · accesso alla dashboard in sola visualizzazione» e testo: «Ciao, puoi consultare la dashboard di TGI Sport (Convocazioni, Riepilogo, Operatori) qui:\n<link della dashboard>\n\nAl primo accesso premi "Crea account" con questa email (<email>), conferma l'indirizzo con il link che ricevi e poi entra con la tua password.».

### Accesso del collega

- Primo accesso: «Crea account» con la sua email (non più solo le email dei supervisori), conferma dell'indirizzo, poi accesso con la password — come i supervisori.
- Dopo l'accesso: supervisore (elenco nel codice) → dashboard completa; altrimenti, se esiste `visualizzatori/{email}` → dashboard in sola visualizzazione; altrimenti si esce con «Questa email non ha accesso alla dashboard: chiedi a un supervisore.».
- Collega tolto mentre è collegato: la prima lettura negata lo fa uscire con lo stesso messaggio.

### Regole di Firestore

- `visualizzatore()`: utente con email confermata e documento `visualizzatori/{request.auth.token.email}` esistente.
- **Lettura** per i colleghi: `operatori`, `disponibilita`, `eventi`, `impostazioni/regole`, `impostazioni/operativo`, `onsite`, `onsiteRiservato`, `richiesteEvento`, e il proprio `visualizzatori/{email}`.
- **Niente lettura** per i colleghi: `invii`, `richieste`, `utenti`, `visualizzatori` degli altri.
- **Nessuna scrittura** per i colleghi.
- `visualizzatori/{email}`: lettura per i supervisori e per chi ha quella email; scrittura solo per i supervisori, con esattamente `email` (uguale all'id), `aggiunto`, `da`.
- Lo script delle email non cambia: verifica già che chi chiama sia un supervisore.

## 2. Dashboard in sola lettura

- **Schede**: solo Convocazioni (si apre lì), Riepilogo, Operatori; accanto al nome il cartellino «Sola visualizzazione».
- **Convocazioni**: settimana, filtri, calendario ed «Esporta mese» come per i supervisori. Nascosti «+ Remote TL», «+ Remote Support», «+ Partite», «+ On-site», «Invia convocazioni» e i tasti dei giorni; menu operatore disattivato; finestra dell'evento in sola lettura (campi disattivati, storico e risposte visibili, solo «Chiudi», niente «Chiedi disponibilità», «Annulla evento», «Elimina», «Salva»); scheda on-site senza Togli, Modifica, Chiudi, Annulla.
- **Riepilogo**: completo, con l'Excel.
- **Operatori**: tabella visibile; nascosti «Nuovo operatore», Modifica, tasti dei codici, Elimina.
- **Niente scritture**: nessun allineamento delle richieste per evento, nessun «segna come letto», nessuna notifica; la dashboard non legge `invii` né `richieste` (liste vuote).
- **Demo**: l'email `collega@esempio.it` con la password `demo` entra in sola visualizzazione; l'elenco della demo si gestisce da Impostazioni come in Firebase.

## 3. Verifiche

- **Prove automatiche** (`node --test`):
  - demo: aggiunta e tolta di un collega (email valida, già presente, di un supervisore), accesso del collega in sola visualizzazione, accesso negato a un'email non in elenco, collega tolto → accesso non più valido;
  - testo e indirizzo dell'«Invia mail»;
  - stato restituito da `ascolta` per un collega (`invii` e `richieste` vuoti).
- **Demo nel browser**: gestione dell'elenco; accesso come collega: tre schede, nessun tasto di modifica, finestra dell'evento in sola lettura, Riepilogo con Excel; console senza errori.

## 4. Messa in linea

1. **Sito** (`?v=24`).
2. **Regole di Firestore**: incolla e pubblica (prima di questo passo i colleghi non riescono a entrare; la dashboard dei supervisori mostra il riquadro ma aggiungere un collega risponde «Pubblica le nuove regole di Firestore (vedi README).»).
3. Ricarica delle dashboard dei supervisori. Lo script delle email non cambia.

## Fuori da questo blocco

- Permessi diversi per scheda o per collega.
- Colleghi che modificano solo alcune cose.
