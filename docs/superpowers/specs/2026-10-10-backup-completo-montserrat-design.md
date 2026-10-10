# Blocco 9 — Backup completo, copia su Drive, campo «uefa», carattere Montserrat

Data: 2026-10-10 · Stato: decisioni approvate dall'utente, documento da approvare

## Obiettivo

Il backup del venerdì diventa completo: dentro ci sono anche le disponibilità degli operatori, e i deployment on-site si possono ripristinare come gli eventi. Una copia di ogni backup resta su Google Drive. Si toglie un campo dati rimasto per il passaggio dalla versione 21. Il sito passa al carattere aziendale Montserrat, con una sola scala di grandezze su computer e telefono.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Disponibilità | Nuovo foglio «Disponibilità»: una riga per operatore e giorno, dal 1° agosto. Si ripristina giorno per giorno; i giorni che non sono nel file restano come sono |
| On-site | Ripristino come gli eventi: i deployment presenti tornano come nel backup, i mancanti si ricreano, quelli non presenti nel file non si toccano |
| Drive | Copia nella cartella «Backup Disponibilità Ops» del Drive dell'account dello script. Si tengono gli ultimi 52 file; i più vecchi vanno nel cestino di Drive. Serve una nuova autorizzazione, la più ristretta (`drive.file`: lo script vede solo ciò che crea lui) |
| «uefa» | Non si scrive più; nei dati vecchi si legge ancora (Dimezzato) |
| Carattere | Montserrat incluso nel sito (nessuna richiesta a Google Fonts). Scala unica 12 / 14 / 16 / 20 / 28 px, uguale su computer e telefono |

## 1. Disponibilità nel backup

- **Lettura** (script, account del proprietario): tutti i documenti di `disponibilita`, solo i giorni dal 1° agosto della stagione.
- **Foglio «Disponibilità»** (quinto foglio, dopo Impostazioni). Colonne:
  - A Operatore (nome);
  - B Data (data di Excel);
  - C Stato: Disponibile / Parziale / Non disponibile;
  - D Nota;
  - E ID operatore.

  Righe solo per i giorni con uno stato o una nota, in ordine di nome e data.
- **Ripristino:**
  - l'operatore si trova per ID, poi per nome (come negli eventi);
  - le righe senza operatore riconoscibile, senza data valida o senza stato valido si saltano e si contano;
  - si scrive solo sui giorni del file (unione con quelli presenti, non sostituzione).
- **Anteprima:** «Disponibilità: N giorni di M operatori tornano come nel backup» (più «K righe saltate», se ce ne sono).
- **Email del backup:** in più «e le disponibilità di M operatori».

## 2. On-site: backup ripristinabile

- **Foglio On-site:** si aggiungono le colonne, ripetute su ogni riga-giorno:
  - O ID deployment;
  - P Note;
  - Q Destinatari (ID separati da virgola);
  - R Accettati TL (ID);
  - S Accettati OP (ID);
  - T Hanno rifiutato (ID);
  - U Esclusi (ID);
  - V Creato.
- **Ripristino:** solo con la colonna O.
  - Le righe si raggruppano per ID. Da ogni gruppo escono i giorni (data, attività, partita), luogo, sport, titolo, note, posti, liste di ID, stato (Aperta / Chiusa / Annullata) e compenso (in `onsiteRiservato`).
  - Un gruppo senza giorni validi, senza luogo o con ID non valido si salta e si conta.
  - I presenti tornano come nel backup, i mancanti si ricreano, gli altri non si toccano.
- **Anteprima:** «On-site: N deployment tornano come nel backup, M da ricreare». Con un backup di una versione precedente (senza colonna O): «I deployment on-site di questo backup non si reimportano (versione precedente)».

## 3. Copia su Google Drive

- Dopo l'invio riuscito dell'email, lo script salva lo stesso file nella cartella «Backup Disponibilità Ops». Usa le API di Drive con il gettone del proprietario e l'autorizzazione `drive.file`.
- La cartella si crea la prima volta e il suo ID resta nelle proprietà dello script. Se è stata cancellata, se ne crea una nuova.
- Un file con lo stesso nome nella cartella (backup ripetuto nello stesso giorno) va nel cestino prima del nuovo.
- Oltre 52 file `Backup_TGI_Sport_*.xlsx`, i più vecchi vanno nel cestino.
- Se Drive non risponde o manca l'autorizzazione:
  - l'email è già partita e il backup conta come riuscito;
  - `ULTIMO_BACKUP.drive` registra l'esito.
- **Riga in Impostazioni:**
  - normale: «Ultimo backup: … · copia su Drive»;
  - Drive non riuscito: «… · copia su Drive non riuscita: <motivo>»;
  - nessun campo `drive` (script vecchio): nessuna aggiunta.

## 4. Campo «uefa»

- `regole.complete`, l'editor delle competizioni e l'importazione non scrivono più `uefa`.
- Una competizione salvata con `uefa: true` e senza `compenso` resta Dimezzato, sia nella dashboard sia nel backup.
- Al primo salvataggio delle competizioni il campo sparisce da Firestore.

## 5. Montserrat e scala unica

- Montserrat variabile (pesi 100–900, sottoinsieme latino, 35 KB) in `app/font/`, licenza OFL. Archivo si toglie.
- **Scala** (identica su computer e telefono):
  - **28:** titoli di pagina e di accesso, numero del giorno nelle convocazioni dell'operatore.
  - **20:** settimana nel navigatore, titoli delle finestre, mese del calendario, numeri del Riepilogo, orari degli eventi.
  - **16:** titoli delle schede, giorni (pagina operatori e Convocazioni), titoli di eventi e convocazioni.
  - **14:** testo, campi, tasti, schede di navigazione, tabelle, elenchi.
  - **12:** testo secondario (sottotitoli brevi, note, etichette, cartellini, legenda, intestazioni di tabella).
- **Pesi:** 400 testo, 500–600 etichette e tasti, 700 titoli e orari. Cifre allineate (tabular) negli orari, nelle date e nei numeri.
- **Unica eccezione:** sul telefono i campi da compilare a 16 px. Sotto i 16 px l'iPhone ingrandisce la pagina quando si tocca il campo.
- **Verifica visiva** di ogni scheda su computer (1440 px) e telefono (390 px): nessun testo che esce dal suo spazio.

## 6. Verifiche

- **Prove automatiche** (`node --test test/*.test.js`):
  - foglio Disponibilità (righe, stati, ordine, giorni prima della stagione esclusi);
  - nuove colonne On-site;
  - copia su Drive con le risposte delle API finte (cartella creata o ritrovata, stesso nome nel cestino, oltre 52 nel cestino, errore Drive che non ferma il backup);
  - riga dell'ultimo backup con Drive;
  - ripristino delle disponibilità (per ID e per nome, unione, righe saltate) e degli on-site (presenti e mancanti, compenso, gruppi saltati, backup vecchio);
  - `uefa` non più scritto ma ancora letto;
  - andata e ritorno: backup dello script → importazione con disponibilità e on-site.
- **Nel browser (demo):** ripristino di un file generato dalle prove; foto di tutte le schede su computer e telefono.

## 7. Messa in linea

1. **Sito** (`?v=28`).
2. **Script:**
   - incolla il codice;
   - nell'editor esegui **autorizzaDrive** (chiede il permesso per Drive e crea la cartella);
   - poi **Gestisci deployment → Nuova versione**.
3. **Prova:** «Invia un backup adesso», poi controlla la cartella «Backup Disponibilità Ops» in Drive.
4. Nessuna regola di Firestore da cambiare: i supervisori possono già scrivere `disponibilita`, `onsite` e `onsiteRiservato`.

## Fuori da questo blocco

- Ripristino automatico dal file su Drive (si scarica il file e lo si importa come oggi).
- Copie su Drive di account diversi da quello dello script.
