# Disponibilità Ops · TGI Sport

Specchietto delle disponibilità giornaliere dei freelance, per inviare le convocazioni agli eventi in modo mirato.

- **`index.html` – operatori**: ognuno entra con il proprio codice personale, indica giorno per giorno (con vista settimanale) se è *Disponibile*, *Parziale* (con gli orari nella nota) o *Non disponibile*, e preme **Invia ai supervisori**.
- **`admin.html` – supervisori**: griglia settimanale di tutto il team aggiornata in tempo reale (passando sopra una casella, o toccandola sul telefono, si legge la nota), filtro per mansione, pannello **Convocazione** per ogni giorno (chi è disponibile, email in Ccn, copia telefoni/elenco), **Richiedi disponibilità** per un periodo a scelta, scheda **Aggiornamenti** con ogni invio e lo stato delle richieste, gestione operatori e codici.

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
| `app/config.js` | collegamento a Firebase e allo script delle email |
| `app/stile.css`, `Logo/`, favicon | identità TGI Sport (come Mockup Studio) |
| `firebase/` | regole di sicurezza di Firestore e configurazione dell'emulatore |
| `backend/` | script Google Apps Script per le email |
