# Disponibilità Ops · TGI Sport

Disponibilità e convocazioni dei freelance TGI Sport: prende il posto del file Excel delle convocazioni (fogli Convocazioni, Riepilogo, Consultivo, Impostazioni, Assenze). La piattaforma è solo operativa: niente fatture.

- **`index.html` – operatori**: ognuno entra con il proprio codice personale, indica giorno per giorno se è *Disponibile*, *Parziale* (con gli orari) o *Non disponibile* e preme **Invia ai supervisori**. In alto trova **Le tue convocazioni** e le conferma (o dice che non può) con un tasto. Non vede compensi né note interne.
- **`admin.html` – supervisori**:
  - **Convocazioni**: partite e turni di supervisione della settimana; per ogni evento si sceglie l'operatore da un menu che mostra chi è disponibile, parziale, non disponibile o già impegnato; avviso di **doppio turno**; stati *da assegnare → da inviare → in attesa → confermato / rifiutato*, più *da sostituire* e *annullato*; **Invia convocazioni** le rende visibili agli operatori e manda le email.
  - **Disponibilità**: griglia settimanale del team in tempo reale (passando su una casella si leggono nota e impegni del giorno), pannello per ogni giorno, **Richiedi disponibilità** per un periodo.
  - **Aggiornamenti**: invii delle disponibilità, conferme e rifiuti delle convocazioni, stato delle richieste.
  - **Riepilogo**: eventi coperti e compensi netti per operatore, competizione e mese; esportazione in Excel.
  - **Operatori** (ruolo TL/OP, contratto P.IVA/Coop, codici) e **Impostazioni** (tariffe, competizioni, importazione dal file Excel, email, password).

## Regole

| | |
|---|---|
| Ritrovo | orario dell'evento meno 4 ore (modificabile sul singolo evento) |
| Notturno | ritrovo dalle 22:00 alle 6:00 |
| Gettoni netti | P.IVA: diurno 140, notturno 210, maggiorato 210 · Coop: diurno 175, notturno 262,50, maggiorato 262,50 |
| Maggiorato | si sceglie sul singolo evento e prevale sulle altre regole |
| UEFA | Champions, Europa e Conference League: metà del diurno |
| Supervisione | un turno per giorno, solo operatori con ruolo **TL**; le partite vanno a TL o OP |
| Annullati | non contano mai nei riepiloghi |

Tutti i valori si cambiano da **Impostazioni → Tariffe e regole** e **Competizioni e sport** (casella *UEFA ½*).

## Come funziona

```
Pagine su GitHub Pages ──► Firebase (Firestore + Authentication)   dati e accessi, in tempo reale
          │
          └──────────────► Google Apps Script                       solo l'invio delle email, in sottofondo
```

- **Firestore** contiene operatori, disponibilità, invii e richieste. Le **regole di sicurezza** ([`firebase/firestore.rules`](firebase/firestore.rules)) decidono chi vede cosa: un operatore legge e scrive solo i propri dati, i supervisori tutto.
- **Authentication**: ogni supervisore ha il proprio account (email TGI Sport + password, indirizzo confermato via email); ogni codice operatore è un account a sé (nella console si vedono solo impronte, non i codici).
- **Apps Script** ([`backend/Codice.gs`](backend/Codice.gs)) spedisce le email ai supervisori e agli operatori. Nessuno lo aspetta: la pagina risponde subito e l'email parte dopo.

Nel repository pubblico non ci sono dati né password. La configurazione in `app/config.js` non è segreta: la protezione sta nelle regole.

## Costi

Tutto sul piano gratuito **Spark** di Firebase, senza carta di credito: 50.000 letture, 20.000 scritture al giorno e 1 GB di dati. Per qualche decina di operatori se ne usa una piccola parte (aprire la dashboard costa circa 150 letture, poi solo ciò che cambia; un invio di un operatore una decina di operazioni). Se un giorno il limite venisse superato, Firebase smette di rispondere fino al giorno dopo: non può addebitare nulla.

## Prova veloce (modalità demo)

Con `FIREBASE: null` in `app/config.js` il sito funziona con dati di prova salvati solo nel browser: password supervisori `demo`, codici operatori `DEMO-0001` … `DEMO-0008`.

## Messa in funzione

### 1. Progetto Firebase

1. Vai su [console.firebase.google.com](https://console.firebase.google.com) → **Crea un progetto** (es. *tgi-disponibilita*). Google Analytics non serve.
2. **Build → Firestore Database → Crea database** → località **europe-west8 (Milano)** → *modalità di produzione*.
3. **Firestore → Regole**: sostituisci tutto il testo con il contenuto di [`firebase/firestore.rules`](firebase/firestore.rules) e **Pubblica**. Le email dei supervisori sono già dentro.
4. **Build → Authentication → Inizia → Email/password** → abilita (solo la prima opzione) → Salva.
5. **Authentication → Impostazioni → Domini autorizzati**: aggiungi `fulvioferrara1984-hub.github.io`.
6. **Impostazioni progetto (⚙️) → Le tue app → `</>` (Web)**: registra l'app (*Disponibilità*, senza Hosting) e copia l'oggetto `firebaseConfig`.

Gli account dei supervisori non si creano in console: ognuno lo crea da sé al primo accesso (punto 5 qui sotto).

### 2. Configurazione del sito

In [`app/config.js`](app/config.js):

```js
window.DO_CONFIG = {
  FIREBASE: { apiKey: '…', authDomain: '…', projectId: '…', storageBucket: '…', messagingSenderId: '…', appId: '…' },
  SUPERVISORI: ['fferrara@tgisport.com', 'spedatella@tgisport.com', 'fgennaro@tgisport.com', 'ssolera@tgisport.com'],
  EMAIL_URL: 'https://script.google.com/macros/s/…/exec',
  EMULATORI: false,
};
```

### Aggiornamenti successivi

Quando cambiano [`firebase/firestore.rules`](firebase/firestore.rules) o [`backend/Codice.gs`](backend/Codice.gs):

- **regole**: Firebase → Firestore Database → Regole → incolla il file → **Pubblica**;
- **script**: incolla il codice nell'editor di Apps Script, salva, poi **Esegui il deployment → Gestisci deployment → ✏️ → Nuova versione** (l'URL resta lo stesso).

### 3. Script per le email

Nell'editor di Apps Script: sostituisci il codice con [`backend/Codice.gs`](backend/Codice.gs), metti l'ID del progetto Firebase in `FIREBASE_PROJECT_ID`, aggiorna il manifest con [`backend/appsscript.json`](backend/appsscript.json) (Impostazioni progetto → *Mostra il file manifest*). Poi **Esegui il deployment → Gestisci deployment → ✏️ → Versione: Nuova versione → Esegui il deployment** e accetta le nuove autorizzazioni. L'URL resta lo stesso.

L'app web va pubblicata con *Esegui come: Me* e *Chi ha accesso: Chiunque*: le richieste vengono comunque rifiutate se chi chiama non è un supervisore o un operatore attivo.

### 4. GitHub Pages

Repository → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)`.

- operatori: `https://fulvioferrara1984-hub.github.io/TGISport_Disponibilita/`
- supervisori: `https://fulvioferrara1984-hub.github.io/TGISport_Disponibilita/admin.html`

### 5. Primo accesso dei supervisori

1. Ogni supervisore apre `admin.html` → **Primo accesso? Crea la tua password** → email TGI Sport e password scelta. Arriva un'email di Firebase con il link per confermare l'indirizzo (guardare anche nello spam); dopo il clic si entra con email e password.
2. **Impostazioni**: email dei supervisori che ricevono la notifica a ogni invio (possono essere anche solo alcuni).
3. **Operatori → + Nuovo operatore**: compare il **codice personale** con il **link d'invito** (*Copia messaggio d'invito* per WhatsApp). Il codice si vede una volta sola; se l'operatore lo perde, *Nuovo codice* (il vecchio smette subito di funzionare).

## Importare il file Excel della stagione

**Impostazioni → Importa dal file Excel** → scegli `Convocazioni_Operatori_2026-27.xlsx`. Il file viene letto solo nel browser; prima di importare compare un'anteprima.

- operatori (ruolo TL a chi ha fatto turni di *Supporto*, contratto dal foglio Impostazioni), tariffe, sport e competizioni;
- ogni riga del foglio Convocazioni diventa un evento: *Supporto* → turno di supervisione; *Deleted* → annullato (con lo storico di chi è stato tolto); *Cambiare …* → da sostituire; *Gettone maggiorato* → maggiorato; le partite di Europa e Conference League segnate come Champions passano alla loro competizione; con operatore e CONFERMA = SI → confermato, altrimenti in attesa di conferma;
- le assenze diventano giorni *Non disponibile* (senza toccare ciò che l'operatore ha già indicato).

Ripetere l'importazione aggiorna gli stessi eventi senza duplicarli. Gli operatori importati arrivano **senza codice**: crealo dalla scheda Operatori (*Crea codice*) quando li inviti.

## Uso quotidiano

- **Operatori**: aprono il link, scelgono lo stato per ogni giorno (scorciatoie *Tutta la settimana* e *Copia settimana precedente*), premono **Invia ai supervisori**. Possono compilare fino a 12 settimane in avanti; i giorni passati non si modificano. Le modifiche non inviate restano salvate sul telefono.
- **Supervisori**: la dashboard si aggiorna da sola appena un operatore invia (badge su *Aggiornamenti*, avviso a schermo e, se attivate, notifiche del computer). Clic sull'intestazione di un giorno → pannello **Convocazione**; *Scrivi email ai selezionati* apre il programma di posta con tutti in Ccn.
- **Richiedi disponibilità**: periodo (scorciatoie per questa settimana, la prossima, le prossime 2 o 4), messaggio facoltativo e operatori (già selezionati quelli a cui mancano giorni). Ogni operatore vede la richiesta in cima alla sua pagina, con i giorni richiesti evidenziati, e riceve un'email con il link. In **Aggiornamenti** c'è l'avanzamento, *Sollecita chi manca*, il messaggio per WhatsApp e *Chiudi*.
- **Esporta CSV** scarica la settimana in vista (si apre con Excel).
- **Password dimenticata**: nella schermata di accesso, scrivere l'email e premere *Password dimenticata?*: arriva un'email per sceglierne una nuova.
- **Aggiungere o togliere un supervisore**: modificare l'elenco delle email sia in [`firebase/firestore.rules`](firebase/firestore.rules) (poi ripubblicare le regole in console) sia in `SUPERVISORI` di `app/config.js`. Per togliere l'accesso basta toglierlo dalle regole; l'account si può eliminare da Authentication → Utenti.

## Sicurezza

- Le regole di Firestore ricontrollano a ogni lettura e scrittura chi è l'utente: *Nuovo codice* e la disattivazione di un operatore hanno effetto immediato.
- Un supervisore entra solo dopo aver confermato il proprio indirizzo: chi si registrasse con la sua email non riceverebbe il link.
- Firebase blocca da solo i tentativi di accesso ripetuti.
- Uscendo (*Esci*) si cancella anche la copia dei dati salvata sul dispositivo.
- Le email partono dall'account Google che ha pubblicato lo script (limite di Google: 100 al giorno con Gmail, 1500 con Google Workspace); le notifiche ai supervisori sono al massimo una al minuto per operatore.

## Prove in locale

Con l'emulatore di Firebase (serve Java): `npx firebase-tools emulators:start --config firebase/firebase.json --project demo-tgi` e `EMULATORI: true` in `app/config.js`.

## File

| File | Contenuto |
|---|---|
| `index.html`, `app/operatore.js` | pagina operatori |
| `admin.html`, `app/admin.js` | dashboard supervisori |
| `app/dati-firebase.js` | accessi e dati su Firebase |
| `app/demo.js` | archivio di prova nel browser (senza Firebase) |
| `app/comune.js` | date, avvisi, accesso, email |
| `app/regole.js` | ritrovo, notturno, gettoni, stagione |
| `app/convocazioni.js`, `app/riepilogo.js`, `app/impostazioni.js` | schede Convocazioni, Riepilogo, regole e importazione |
| `app/config.js` | collegamento a Firebase e allo script delle email |
| `app/stile.css`, `Logo/`, favicon | identità TGI Sport (come Mockup Studio) |
| `firebase/` | regole di sicurezza di Firestore e configurazione dell'emulatore |
| `backend/` | script Google Apps Script per le email |
