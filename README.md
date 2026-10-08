# Disponibilità Ops · TGI Sport

Specchietto delle disponibilità giornaliere dei freelance, per inviare le convocazioni agli eventi in modo mirato.

- **`index.html` – operatori**: ognuno entra con il proprio codice personale, indica giorno per giorno (con vista settimanale) se è *Disponibile*, *Parziale* (con gli orari nella nota) o *Non disponibile*, e preme **Invia ai supervisori**.
- **`admin.html` – supervisori**: griglia settimanale di tutto il team (passando sopra una casella, o toccandola sul telefono, si legge la nota), filtro per mansione, pannello **Convocazione** per ogni giorno (chi è disponibile, email in Ccn, copia telefoni/elenco), **Richiedi disponibilità** per un periodo a scelta, scheda **Aggiornamenti** con ogni invio e lo stato delle richieste, gestione operatori e codici.

Il sito è statico (GitHub Pages). I dati stanno in un **Google Sheet** e passano da un **Google Apps Script** che controlla codici e password: nel repository pubblico non c'è nessun dato né password.

```
Pagine su GitHub Pages ──► Apps Script (app web) ──► Google Sheet
                                   └──► email ai supervisori
```

## Prova veloce (modalità demo)

Con `API_URL` vuoto in `app/config.js` il sito funziona con dati di prova salvati solo nel browser: password supervisori `demo`, codici operatori `DEMO-0001` … `DEMO-0008`.

## Messa in funzione

### 1. Google Sheet e Apps Script

1. Crea un nuovo Google Sheet (es. *Disponibilità Ops*), poi **Estensioni → Apps Script**.
2. Incolla il contenuto di [`backend/Codice.gs`](backend/Codice.gs) al posto del codice di esempio.
3. **Impostazioni progetto** → spunta *Mostra il file manifest "appsscript.json"*, poi incolla [`backend/appsscript.json`](backend/appsscript.json). Salva.
4. Torna al foglio e ricarica la pagina: compare il menu **Disponibilità Ops**.
   - **Prepara i fogli** (la prima volta Google chiede le autorizzazioni) → crea i fogli `Operatori`, `Disponibilita`, `Invii`.
   - **Imposta password supervisori** → la password per entrare in `admin.html`.

### 2. Pubblicazione del backend

Nell'editor di Apps Script: **Esegui il deployment → Nuovo deployment → App web**

- *Esegui come*: **Me**
- *Chi ha accesso*: **Chiunque**

Copia l'URL che termina con `/exec` e incollalo in [`app/config.js`](app/config.js):

```js
window.DO_CONFIG = { API_URL: 'https://script.google.com/macros/s/…/exec' };
```

"Chiunque" serve perché le pagine possano chiamare lo script senza login Google: ogni richiesta viene comunque rifiutata senza codice o password validi.

> **Aggiornare il backend** (quando cambia `Codice.gs`): incolla il nuovo codice nell'editor di Apps Script, salva, poi **Esegui il deployment → Gestisci deployment → ✏️ → Versione: Nuova versione → Esegui il deployment**. Così l'URL resta lo stesso e `config.js` non va toccato. Se Google chiede nuove autorizzazioni, accettale.

### 3. GitHub Pages

Repository → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)`. Dopo un paio di minuti il sito è online:

- operatori: `https://<utente>.github.io/<repo>/`
- supervisori: `https://<utente>.github.io/<repo>/admin.html`

### 4. Primo accesso dei supervisori

1. Apri `admin.html` con la password impostata al punto 1.
2. **Impostazioni**: inserisci le email dei supervisori che ricevono la notifica a ogni invio e salva (il link nelle email porterà alla dashboard).
3. **Operatori → + Nuovo operatore**: nome, mansione, email, telefono. Compare il **codice personale** con il **link d'invito**: *Copia messaggio d'invito* e mandalo su WhatsApp o per email. Il codice si vede una volta sola; se l'operatore lo perde, *Nuovo codice* (il vecchio smette di funzionare).

## Uso quotidiano

- **Operatori**: aprono il link, scelgono lo stato per ogni giorno (scorciatoie *Tutta la settimana* e *Copia settimana precedente*), premono **Invia ai supervisori**. Possono compilare fino a 12 settimane in avanti; i giorni passati non si modificano. Le modifiche non inviate restano salvate sul telefono.
- **Richiedi disponibilità** (in alto nella griglia): scegli il periodo (scorciatoie per questa settimana, la prossima, le prossime 2 o 4), un messaggio facoltativo e gli operatori. Sono già selezionati quelli a cui mancano giorni nel periodo, e si può filtrare per mansione. Ogni operatore vede la richiesta in cima alla sua pagina, con i giorni richiesti evidenziati, e riceve un'email con il link (se la casella è spuntata). In **Aggiornamenti** c'è l'avanzamento di ogni richiesta, chi manca ancora, *Sollecita chi manca*, il messaggio per WhatsApp e *Chiudi*. Dal pannello Convocazione, *Chiedi a loro le disponibilità…* prepara la richiesta per chi non ha risposto quel giorno.
- **Supervisori**: la dashboard controlla i nuovi invii ogni 45 secondi (badge su *Aggiornamenti*, avviso a schermo e, se attivate, notifiche del computer). Clic sull'intestazione di un giorno → pannello **Convocazione**: i disponibili e i parziali sono già selezionati; *Scrivi email ai selezionati* apre il programma di posta con tutti in Ccn e un testo da completare.
- **Esporta CSV** scarica la settimana in vista (si apre con Excel).
- Il Google Sheet è leggibile in ogni momento; meglio non modificarlo a mano, tranne per correggere un nome o una mansione.

## Velocità

Ogni chiamata passa da Google Apps Script, che di solito risponde in 1–2 secondi ma a volte ne impiega anche 10–30 (dipende da Google, non dal sito). Per questo:

- all'apertura le pagine mostrano subito gli ultimi dati salvati sul dispositivo e intanto chiedono quelli aggiornati;
- la dashboard carica sei settimane alla volta con una sola chiamata: spostarsi tra le settimane vicine è istantaneo;
- se Google risponde con una pagina d'errore, la richiesta viene ripetuta da sola (fino a 3 volte) e, se l'attesa supera 6 secondi, compare un avviso.

Se la lentezza diventasse un problema, il passo successivo è spostare i dati su un database dedicato (es. Firebase), con risposte sotto il mezzo secondo.

## Sicurezza

- Codici operatori e password supervisori sono salvati solo come impronta (HMAC-SHA256 con un segreto nelle proprietà dello script); le sessioni sono token firmati che scadono dopo 30 giorni.
- *Nuovo codice* chiude le sessioni aperte con il vecchio codice; disattivare un operatore gli impedisce subito di entrare; cambiare la password supervisori fa uscire gli altri supervisori.
- Dopo 20 tentativi di accesso sbagliati in 15 minuti gli accessi si bloccano per un quarto d'ora.
- Le email partono dall'account Google che ha pubblicato lo script (limite giornaliero di Google: 100 per account Gmail, 1500 per Google Workspace).

## File

| File | Contenuto |
|---|---|
| `index.html`, `app/operatore.js` | pagina operatori |
| `admin.html`, `app/admin.js` | dashboard supervisori |
| `app/comune.js` | chiamate al backend, sessione, date |
| `app/demo.js` | backend di prova nel browser (solo senza `API_URL`) |
| `app/config.js` | URL del backend |
| `app/stile.css`, `Logo/`, favicon | identità TGI Sport (come Mockup Studio) |
| `backend/` | codice da incollare in Google Apps Script |
