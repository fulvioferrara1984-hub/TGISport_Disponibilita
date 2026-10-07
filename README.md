# Disponibilità Ops · TGI Sport

Specchietto delle disponibilità giornaliere dei freelance, per inviare le convocazioni agli eventi in modo mirato.

- **`index.html` – operatori**: ognuno entra con il proprio codice personale, indica giorno per giorno (con vista settimanale) se è *Disponibile*, *Parziale* (con gli orari nella nota) o *Non disponibile*, e preme **Invia ai supervisori**.
- **`admin.html` – supervisori**: griglia settimanale di tutto il team, filtro per mansione, pannello **Convocazione** per ogni giorno (chi è disponibile, email in Ccn, copia telefoni/elenco, sollecito a chi non ha risposto), scheda **Aggiornamenti** con ogni invio e i giorni cambiati, gestione operatori e codici.

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

> Se modifichi `Codice.gs`: **Gestisci deployment → ✏️ → Versione: Nuova versione**. Così l'URL resta lo stesso.

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
- **Supervisori**: la dashboard controlla i nuovi invii ogni 45 secondi (badge su *Aggiornamenti*, avviso a schermo e, se attivate, notifiche del computer). Clic sull'intestazione di un giorno → pannello **Convocazione**: i disponibili e i parziali sono già selezionati; *Scrivi email ai selezionati* apre il programma di posta con tutti in Ccn e un testo da completare.
- **Esporta CSV** scarica la settimana in vista (si apre con Excel).
- Il Google Sheet è leggibile in ogni momento; meglio non modificarlo a mano, tranne per correggere un nome o una mansione.

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
