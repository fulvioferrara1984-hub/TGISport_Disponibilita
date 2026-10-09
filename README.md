# Disponibilità Ops · TGI Sport

Disponibilità e convocazioni dei freelance TGI Sport: prende il posto del file Excel delle convocazioni (fogli Convocazioni, Riepilogo, Consultivo, Impostazioni, Assenze). La piattaforma è solo operativa: niente fatture.

- **`index.html` – operatori**: ognuno entra con il proprio codice personale, indica giorno per giorno se è *Disponibile*, *Parziale* (con gli orari) o *Non disponibile* e preme **Invia ai supervisori**. In alto trova **Le tue convocazioni** e le conferma (o dice che non può) con un tasto. Non vede compensi né note interne.
- **`admin.html` – supervisori**:
  - **Convocazioni**: partite e turni Remote TL e Remote Support della settimana; per ogni evento si sceglie l'operatore da un menu che mostra chi è disponibile, parziale, non disponibile o già impegnato; avviso di **doppio turno**; stati *da assegnare → da inviare → in attesa → confermato / rifiutato*, più *da sostituire* e *annullato*; **Invia convocazioni** le rende visibili agli operatori e manda le email.
  - **Disponibilità**: griglia settimanale del team in tempo reale (passando su una casella si leggono nota e impegni del giorno), pannello per ogni giorno, **Richiedi disponibilità** per un periodo.
  - **Aggiornamenti**: invii delle disponibilità, conferme e rifiuti delle convocazioni, stato delle richieste.
  - **Riepilogo**: eventi coperti e compensi netti per operatore, competizione e mese; esportazione in Excel.
  - **Operatori** (ruolo Remote OP / Remote Support / Remote TL, on-site TL/OP, contratto P.IVA/Coop, codici) e **Impostazioni** (tariffe, competizioni, importazione dal file Excel, email, password).

## Regole

| | |
|---|---|
| Ritrovo | orario dell'evento meno le ore della competizione (una competizione nuova parte da 4); modificabile sul singolo evento |
| Fine turno | orario dell'evento più le ore della competizione (una nuova parte da 2); turni Remote TL e Remote Support: ritrovo + la durata della loro riga (6 ore); modificabile sul singolo evento |
| Doppio turno | stesso operatore due volte nello stesso giorno: avviso giallo se gli orari non si toccano, rosso "turni sovrapposti" se si sovrappongono |
| Blocco | quando all'evento mancano N giorni o meno (generale: 3; evento lunedì → da venerdì) l'operatore non cambia più disponibilità né rinuncia: telefona al numero di reperibilità |
| Notturno | ritrovo dalle 22:00 alle 6:00 |
| Gettoni netti | P.IVA: diurno 140, notturno 210, maggiorato 210 · Coop: diurno 175, notturno 262,50, maggiorato 262,50 |
| Compenso per competizione | Diurno (notturno se il ritrovo è di notte), Notturno, Maggiorato o Dimezzato (metà del diurno); Champions, Europa e Conference League partono come Dimezzato |
| Maggiorato | si sceglie anche sul singolo evento e prevale su tutto |
| Ruoli | un ruolo per operatore, ognuno comprende quelli sotto: **Remote OP** (partite), **Remote Support** (partite e turni Remote Support), **Remote TL** (partite e tutti i turni) |
| Turni remoti | **Remote TL** (l'ex supervisione) e **Remote Support**: un turno per giorno, con ora di ritrovo; colore, compenso e durata dalla loro riga fissa in *Competizioni e sport* (i vecchi turni di supervisione contano come Remote TL anche nei riepiloghi dei mesi passati) |
| Annullati | non contano mai nei riepiloghi |
| On-site | richiesta con date, attività per giorno (Travel Day, MD-1, MD…), luogo, sport e posti TL/OP, solo agli operatori abilitati; chi accetta per primo occupa il posto, è on-site in quei giorni (non assegnabile al remoto) e non si ritira dal sito; compenso di trasferta = giorni × tariffa on-site (generale: 150 € al giorno), modificabile, visibile solo ai supervisori |
| Disponibilità per evento | dal menu ⋯ di una partita o di un turno Remote TL / Remote Support ancora scoperto: gli operatori scelti rispondono Sì o No per quell'evento (anche dentro la finestra di blocco, fino al giorno stesso); il Sì è solo una segnalazione, l'assegnazione resta del supervisore; la richiesta si chiude da sola quando l'evento ha un operatore e si riapre se viene rifiutato o segnato da sostituire |
| Promemoria | ogni mattina tra le 8 e le 9 (nuovo tentativo alle 11 se il primo non riesce), per gli eventi remoti da oggi a X giorni dopo (generale: 3): agli operatori le convocazioni ancora da confermare, ai supervisori il riepilogo di ciò che non è coperto (da sostituire, senza operatore, da inviare, in attesa) |

Tutti i valori si cambiano da **Impostazioni → Tariffe e regole**, **Regole per gli operatori** (telefono di reperibilità, giorni di blocco), **Competizioni e sport** (ore prima/dopo, colore e menu *Compenso* per competizione) , **Notifiche email** (promemoria automatici e giorni) e **Tariffe e regole → Tariffa on-site**; l'abilitazione on-site di ciascuno si imposta nella scheda dell'operatore.

**Esporta mese** (scheda Convocazioni) scarica un Excel con le convocazioni del mese e le presenze per operatore, senza compensi.

## Come funziona

```
Pagine su GitHub Pages ──► Firebase (Firestore + Authentication)   dati e accessi, in tempo reale
          │
          └──────────────► Google Apps Script                       solo l'invio delle email, in sottofondo
```

- **Firestore** contiene operatori, disponibilità, invii e richieste. Le **regole di sicurezza** ([`firebase/firestore.rules`](firebase/firestore.rules)) decidono chi vede cosa: un operatore legge e scrive solo i propri dati, i supervisori tutto.
- **Authentication**: ogni supervisore ha il proprio account (email TGI Sport + password, indirizzo confermato via email); ogni codice operatore è un account a sé (nella console si vedono solo impronte, non i codici).
- **Apps Script** ([`backend/Codice.gs`](backend/Codice.gs)) spedisce le email ai supervisori e agli operatori. Nessuno lo aspetta: la pagina risponde subito e l'email parte dopo. Ogni mattina manda anche i **promemoria**: per farlo legge Firestore da solo, in sola lettura, con l'account Google che possiede lo script (Editor del progetto Firebase).

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

Quando cambiano [`firebase/firestore.rules`](firebase/firestore.rules) o [`backend/Codice.gs`](backend/Codice.gs), l'ordine è **sito → regole → script**:

1. **sito** (push su `main`): la pagina nuova funziona anche con le regole vecchie;
2. **regole**, quando il sito nuovo è online (GitHub Pages lo pubblica in un paio di minuti; i telefoni possono tenere la pagina vecchia fino a 10 minuti): pubblicarle prima disconnetterebbe chi ha ancora la pagina vecchia;
3. **script**: fino a quel momento le email partono con il testo precedente (per esempio senza la fine turno).

Dopo **ogni** pubblicazione del sito, **ricaricare la dashboard** su ogni computer dei supervisori (o chiudere e riaprire la scheda) prima di salvare impostazioni o esportare il Riepilogo: una scheda rimasta aperta da prima continua a usare la versione vecchia. Dalla versione 22 le pagine aperte (dashboard e pagina operatori) se ne accorgono da sole: in alto compare *È uscita una nuova versione del sito* con il tasto **Ricarica** (controllo quando si torna sulla scheda e ogni 15 minuti).

Come pubblicarli:

- **regole**: Firebase → Firestore Database → Regole → incolla il file → **Pubblica**;
- **script**: incolla il codice nell'editor di Apps Script, salva, poi **Esegui il deployment → Gestisci deployment → ✏️ → Nuova versione** (l'URL resta lo stesso).

### 3. Script per le email

Nell'editor di Apps Script: sostituisci il codice con [`backend/Codice.gs`](backend/Codice.gs), metti l'ID del progetto Firebase in `FIREBASE_PROJECT_ID`, aggiorna il manifest con [`backend/appsscript.json`](backend/appsscript.json) (Impostazioni progetto → *Mostra il file manifest*). Poi **Esegui il deployment → Gestisci deployment → ✏️ → Versione: Nuova versione → Esegui il deployment** e accetta le nuove autorizzazioni. L'URL resta lo stesso.

L'app web va pubblicata con *Esegui come: Me* e *Chi ha accesso: Chiunque*: le richieste vengono comunque rifiutate se chi chiama non è un supervisore o un operatore attivo.

### Promemoria automatici

Da fare una volta, nell'ordine:

1. **Firebase**: l'account Google che possiede lo script deve poter leggere i dati. [Console Firebase](https://console.firebase.google.com/) → progetto **tgi-availability** → ⚙️ accanto a *Panoramica del progetto* → **Impostazioni progetto** → scheda **Utenti e autorizzazioni** → **Aggiungi membro** → email dell'account dello script → ruolo **Editor** → **Aggiungi membro**. Se script e Firebase sono dello stesso account, niente da fare.
2. **Script**: incolla [`backend/Codice.gs`](backend/Codice.gs) e il manifest [`backend/appsscript.json`](backend/appsscript.json), salva, scegli **attivaPromemoria** nel menu delle funzioni accanto a *Debug* e premi **Esegui**; accetta le autorizzazioni nuove (dati di Firestore e attivatori). Nel registro devono comparire:
   - `Firebase: lettura riuscita.`
   - `Anteprima di oggi, nessuna email spedita: …` (chi riceverebbe un promemoria oggi)
   - `Invio giornaliero attivo tra le 8 e le 9 (nuovo tentativo alle 11) · promemoria accesi, 3 giorni prima …`

   Se invece compare *aggiungilo come Editor del progetto*, il passo 1 non è ancora attivo: aspetta qualche minuto e riesegui. Poi **Esegui il deployment → Gestisci deployment → ✏️ → Nuova versione**.
3. **Sito**: pubblicazione normale. Prima dell'aggiornamento dello script la dashboard scrive *Script delle email da aggiornare*.
4. **Dashboard**: **Impostazioni → Notifiche email** → *Promemoria automatici ogni mattina* e *Giorni prima dell'evento* → **Salva** (salva anche l'indirizzo usato per i link delle email). La riga sotto mostra l'ultimo promemoria partito.

Per sospenderli basta togliere la casella; per fermare del tutto l'invio giornaliero: editor di Apps Script → ⏰ **Attivatori** → elimina *inviaPromemoria*. `attivaPromemoria` si può rieseguire quando si vuole: non crea doppioni.

### Deployment on-site

Ordine come per ogni aggiornamento, **sito → regole → script**:

1. **Sito**: finché le regole nuove non sono pubblicate la pagina operatori non mostra le richieste on-site (senza errori) e la dashboard avvisa *On-site non disponibile: pubblica le nuove regole di Firestore*.
2. **Regole**: incolla [`firebase/firestore.rules`](firebase/firestore.rules) in Firebase → Firestore Database → Regole → **Pubblica**. Le regole controllano posti, ruolo on-site, richiesta aperta e primo giorno: due operatori non possono prendere lo stesso ultimo posto.
3. **Script**: nuova versione di [`backend/Codice.gs`](backend/Codice.gs) (*Gestisci deployment → ✏️ → Nuova versione*). Prima, le email delle richieste on-site non partono e la dashboard lo segnala dopo l'invio.
4. **Dashboard**: in **Operatori → Modifica** imposta *On-site: TL / OP* per chi può andare in trasferta, e controlla la **Tariffa on-site** in Impostazioni.

### Backup settimanale

Ordine **sito → script**, nessuna regola di Firestore da cambiare e nessuna nuova autorizzazione:

1. **Sito**: pubblicazione normale; in **Impostazioni → Notifiche email** compaiono la casella *Backup settimanale*, la riga *Ultimo backup* e il tasto *Invia un backup adesso* (spenti finché lo script non è aggiornato).
2. **Script**: incolla [`backend/Codice.gs`](backend/Codice.gs), salva, poi **Esegui il deployment → Gestisci deployment → ✏️ → Nuova versione**.
3. **Attivazione** (una volta): nell'editor scegli **attivaPromemoria** e premi **Esegui**. Nel registro compare anche `Backup ogni venerdì tra le 18 e le 19 · backup acceso`.
4. **Prova**: in dashboard premi **Invia un backup adesso** e controlla che l'email arrivi con il file Excel allegato.

### Accessi in sola visualizzazione

Ordine **sito → regole**, lo script delle email non cambia:

1. **Sito**: finché le regole nuove non sono pubblicate i colleghi non riescono a entrare e la dashboard avvisa *Accessi in sola visualizzazione non disponibili: pubblica le nuove regole di Firestore*.
2. **Regole**: incolla [`firebase/firestore.rules`](firebase/firestore.rules) in Firebase → Firestore Database → Regole → **Pubblica**.
3. **Dashboard**: ricaricala su ogni computer dei supervisori, poi aggiungi i colleghi da **Impostazioni → Accessi in sola visualizzazione** e manda a ciascuno l'invito con **Invia mail**.

### Richiesta di disponibilità per evento

Ordine come per ogni aggiornamento, **sito → regole → script**:

1. **Sito**: finché le regole nuove non sono pubblicate la pagina operatori non mostra le richieste per evento (senza errori), la dashboard avvisa *Richieste per evento non disponibili: pubblica le nuove regole di Firestore* e il tasto *Chiedi disponibilità* risponde *Pubblica le nuove regole di Firestore (vedi README).*
2. **Regole**: incolla [`firebase/firestore.rules`](firebase/firestore.rules) in Firebase → Firestore Database → Regole → **Pubblica**. Le regole lasciano a ciascun operatore solo la propria risposta, con la richiesta aperta e fino al giorno dell'evento.
3. **Indice** (una volta): Firebase → Firestore Database → **Indici** → *Composito* → **Crea indice**: raccolta `richiesteEvento`, campi `destinatari` *Array contains* ed `evento.data` *Crescente*, ambito *Raccolta* → **Crea** (pronto in pochi minuti). Senza l'indice la pagina operatori funziona lo stesso, ma legge anche le richieste passate.
4. **Script**: nuova versione di [`backend/Codice.gs`](backend/Codice.gs) (*Gestisci deployment → ✏️ → Nuova versione*). Prima, le email delle richieste per evento non partono e la dashboard lo segnala dopo l'invio.
5. **Dashboard**: ricaricala su ogni computer dei supervisori.

### Turni Remote TL e Remote Support

Ordine **sito → script**, nessuna regola di Firestore da cambiare:

1. **Sito**: subito dopo la pubblicazione **ricarica (o chiudi) la dashboard su ogni computer dei supervisori**, anche le schede rimaste aperte in secondo piano: una dashboard della versione precedente toglierebbe il ruolo Remote Support a chi modifica e riscriverebbe le richieste per evento dei turni. Le pagine in primo piano mostrano anche *È uscita una nuova versione del sito*: premere **Ricarica**.
2. **Script**: nuova versione di [`backend/Codice.gs`](backend/Codice.gs) (*Gestisci deployment → ✏️ → Nuova versione*). Prima, i promemoria ignorano i turni Remote Support e le email dei turni usano ancora i nomi vecchi.
3. **Dashboard**: in **Operatori → Modifica** scegli *Remote Support* per chi fa quei turni; in **Impostazioni → Competizioni e sport** controlla colore, compenso e durata delle righe *Remote TL* e *Remote Support*.

### Outlook come app di posta

Il tasto **Invia mail** (codice personale di un operatore) apre una nuova email nell'app di posta predefinita del computer, già compilata. Perché sia Outlook:

- **Mac**: Outlook → **Impostazioni** (o **Preferenze**) → **Generali** → **Imposta come predefinita**; in alternativa app **Mail** → Impostazioni → Generali → *Lettore email predefinito* → Microsoft Outlook.
- **Windows 11**: Start → **Impostazioni → App → App predefinite** → nel campo in alto scrivi **MAILTO** → scegli **Outlook**.
- **Windows 10**: Start → **Impostazioni → App → App predefinite → Posta elettronica** → **Outlook**.

Prova: aprendo `mailto:prova@esempio.it` dal browser deve aprirsi una nuova email in Outlook.

### 4. GitHub Pages

Repository → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)`.

- operatori: `https://fulvioferrara1984-hub.github.io/TGISport_Disponibilita/`
- supervisori: `https://fulvioferrara1984-hub.github.io/TGISport_Disponibilita/admin.html`

### 5. Primo accesso dei supervisori

1. Ogni supervisore apre `admin.html` → **Primo accesso? Crea la tua password** → email TGI Sport e password scelta. Arriva un'email di Firebase con il link per confermare l'indirizzo (guardare anche nello spam); dopo il clic si entra con email e password.
2. **Impostazioni**: email dei supervisori che ricevono la notifica a ogni invio (possono essere anche solo alcuni).
3. **Operatori → + Nuovo operatore**: compare il **codice personale** con il **link d'invito** (*Copia messaggio d'invito* per WhatsApp). Il codice si vede una volta sola; se l'operatore lo perde, *Nuovo codice* (il vecchio smette subito di funzionare).

## Ripristinare da un backup

Ogni venerdì tra le 18 e le 19 i supervisori ricevono `Backup_TGI_Sport_<data>.xlsx` (fogli **Convocazioni**, **On-site**, **Operatori**, **Impostazioni**), con tutti gli eventi della stagione, anche annullati e da assegnare. Per ripristinare: **Impostazioni → Importa dal file Excel** → scegli il file. L'importazione riconosce il backup (colonna *ID evento*):

- gli eventi tornano con il loro ID, stato, tipo (partita, Remote TL, Remote Support), gettone maggiorato, «da sostituire», motivo del rifiuto e orari scritti a mano; le convocazioni già inviate tengono gli orari dati all'operatore; quelli già presenti tornano come nel backup (**le modifiche fatte dopo quella data si perdono**: lo storico resta, con *Ripristinato dal backup del …*), quelli che mancano si ricreano; quelli che non sono nel file non si toccano;
- gli operatori si riconoscono per nome: dei presenti cambia solo ciò che è diverso nel backup (mai con un campo vuoto), e l'anteprima elenca ogni cambiamento, compreso un accesso riattivato; i nuovi arrivano senza codice;
- tariffe, notturno, sport, competizioni e mansioni tornano come nel file; i deployment on-site no (il foglio è da consultare).

## Importare il file Excel della stagione

**Impostazioni → Importa dal file Excel** → scegli `Convocazioni_Operatori_2026-27.xlsx`. Il file viene letto solo nel browser; prima di importare compare un'anteprima.

- operatori (ruolo Remote TL a chi ha fatto turni *Supporto* o *Remote TL*, Remote Support a chi ha fatto turni *Remote Support*; il ruolo si alza soltanto; contratto dal foglio Impostazioni), tariffe, sport e competizioni;
- ogni riga del foglio Convocazioni diventa un evento: *Supporto* o *Remote TL* → turno Remote TL; *Remote Support* → turno Remote Support (per entrambi il ritrovo è 4 ore prima dell'orario della riga); *Deleted* → annullato (con lo storico di chi è stato tolto); *Cambiare …* → da sostituire; *Gettone maggiorato* → maggiorato; le partite di Europa e Conference League segnate come Champions passano alla loro competizione; con operatore e CONFERMA = SI → confermato, altrimenti in attesa di conferma;
- le assenze diventano giorni *Non disponibile* (senza toccare ciò che l'operatore ha già indicato).

Ripetere l'importazione aggiorna gli stessi eventi senza duplicarli. Gli operatori importati arrivano **senza codice**: crealo dalla scheda Operatori (*Crea codice*) quando li inviti.

## Uso quotidiano

- **Operatori**: aprono il link, scelgono lo stato per ogni giorno (scorciatoie *Tutta la settimana* e *Copia settimana precedente*), premono **Invia ai supervisori**. Possono compilare fino a 12 settimane in avanti; i giorni passati non si modificano. Le modifiche non inviate restano salvate sul telefono.
- **Supervisori**: la dashboard si aggiorna da sola appena un operatore invia (badge su *Aggiornamenti*, avviso a schermo e, se attivate, notifiche del computer). Clic sull'intestazione di un giorno → pannello **Convocazione**; *Scrivi email ai selezionati* apre il programma di posta con tutti in Ccn.
- **Richiedi disponibilità**: periodo (scorciatoie per questa settimana, la prossima, le prossime 2 o 4), messaggio facoltativo e operatori (già selezionati quelli a cui mancano giorni). Ogni operatore vede la richiesta in cima alla sua pagina, con i giorni richiesti evidenziati, e riceve un'email con il link. In **Aggiornamenti** c'è l'avanzamento, *Sollecita chi manca*, il messaggio per WhatsApp e *Chiudi*.
- **Esporta CSV** scarica la settimana in vista (si apre con Excel).
- **Convocazioni**: la settimana va da martedì a lunedì (una giornata di campionato in una sola vista); ogni competizione ha il suo colore (automatico, modificabile in *Impostazioni → Competizioni e sport*), l'on-site è sempre viola. Ogni giorno ha *+ Remote TL*, *+ Remote Support* e *+ partite*; il menu dell'operatore mostra solo chi ha il ruolo adatto. *Invia convocazioni* elenca quelle pronte per operatore: si tolgono le spunte a quelle da tenere per dopo. **Calendario** apre il mese a schermo intero: verde confermato, blu in attesa di conferma, arancione senza operatore, rosso senza operatore a ridosso (finestra di blocco); passando col mouse (o toccando) si vedono i dettagli, un clic porta alla settimana o alla scheda on-site.
- **On-site**: *Convocazioni → + On-site* → primo e ultimo giorno (si può togliere un giorno), attività di ogni giorno con la partita per gli MD, luogo, sport, posti TL/OP, compenso proposto e destinatari (gli abilitati, con l'avviso se hanno convocazioni remote in quei giorni). Gli operatori rispondono *Accetto* / *Non posso* dalla loro pagina; chi ha convocazioni remote inviate negli stessi giorni deve prima chiamare. I giorni del deployment compaiono nel calendario: clic sulla riga → scheda con risposte, *Togli*, *Modifica*, *Chiudi richiesta* e *Annulla deployment*. Le presenze e i compensi on-site entrano nel Riepilogo e in *Esporta mese*.
- **Chiedi disponibilità** (per un solo evento): nella finestra dell'evento (⋯) di una partita o di un turno Remote TL / Remote Support ancora senza operatore (o rifiutato, o da sostituire) → elenco degli operatori che possono fare l'evento (secondo il ruolo) con disponibilità del giorno, altri turni e on-site; già spuntati i disponibili e parziali liberi non ancora interpellati → messaggio facoltativo → *Chiedi a N operatori*. Gli operatori trovano in cima alla loro pagina *Ti chiediamo se sei disponibile* e rispondono *Sì, sono disponibile* o *No* (anche via email con il link). Le risposte compaiono nella finestra dell'evento (*Sì: … · No: … · In attesa: N*, con *(prima della modifica)* se l'evento è cambiato dopo), in **Aggiornamenti** e, per i Sì, per email ai supervisori; nel menu di assegnazione chi ha detto sì sale in cima con *✓ ha detto sì*.
- **Promemoria**: ogni mattina, se ci sono convocazioni da sistemare nei prossimi giorni, arrivano le email (agli operatori solo le loro convocazioni da confermare, con il numero di reperibilità). Un operatore senza email o disattivato compare nel riepilogo dei supervisori con la nota *(senza email)* o *(disattivato)*.
- **Colleghi in sola visualizzazione**: **Impostazioni → Accessi in sola visualizzazione** → email → **Aggiungi**, poi **Invia mail** (apre Outlook con il link e le istruzioni). Il collega entra dalla dashboard con *Crea account* e quella email, conferma l'indirizzo e poi entra con la sua password: vede solo Convocazioni, Riepilogo (con gli importi e l'Excel) e Operatori, senza tasti di modifica. **Togli** gli toglie l'accesso subito; se ha la pagina aperta, esce appena la pagina riceve un aggiornamento dei dati (al più tardi quando la ricarica).
- **Password dimenticata**: nella schermata di accesso, scrivere l'email e premere *Password dimenticata?*: arriva un'email per sceglierne una nuova.
- **Aggiungere o togliere un supervisore**: modificare l'elenco delle email sia in [`firebase/firestore.rules`](firebase/firestore.rules) (poi ripubblicare le regole in console) sia in `SUPERVISORI` di `app/config.js`. Per togliere l'accesso basta toglierlo dalle regole; l'account si può eliminare da Authentication → Utenti.

## Sicurezza

- Le regole di Firestore ricontrollano a ogni lettura e scrittura chi è l'utente: *Nuovo codice* e la disattivazione di un operatore hanno effetto immediato.
- Un supervisore entra solo dopo aver confermato il proprio indirizzo: chi si registrasse con la sua email non riceverebbe il link.
- Firebase blocca da solo i tentativi di accesso ripetuti.
- I colleghi in sola visualizzazione leggono solo i dati delle tre schede (non gli Aggiornamenti né le richieste per periodo) e non possono scrivere nulla: lo controllano le regole di Firestore, non solo la pagina.
- Uscendo (*Esci*) si cancella anche la copia dei dati salvata sul dispositivo.
- Le email partono dall'account Google che ha pubblicato lo script (limite di Google: 100 al giorno con Gmail, 1500 con Google Workspace); le notifiche ai supervisori sono al massimo una al minuto per operatore.
- Il compenso on-site sta in un archivio che leggono solo i supervisori (`onsiteRiservato`): agli operatori non arriva mai, nemmeno nelle email.
- Per i promemoria lo script legge Firestore con il proprio account, fuori dalle regole di sicurezza: lo fa solo nel giro del mattino e solo in lettura; le richieste che arrivano dalle pagine continuano a usare l'accesso di chi le manda.

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
| `app/calendario.js` | calendario mensile a schermo intero delle Convocazioni |
| `app/richieste-evento.js` | richieste di disponibilità per un evento: allineamento con l'evento, stato per l'operatore, riepilogo delle risposte |
| `app/onsite.js`, `app/onsite-admin.js` | deployment on-site: calcoli (giorni, posti, presenze, compensi) e richiesta/scheda nella dashboard |
| `app/convocazioni.js`, `app/riepilogo.js`, `app/impostazioni.js` | schede Convocazioni, Riepilogo, regole e importazione |
| `app/config.js` | collegamento a Firebase e allo script delle email |
| `app/stile.css`, `Logo/`, favicon | identità TGI Sport (come Mockup Studio) |
| `firebase/` | regole di sicurezza di Firestore e configurazione dell'emulatore |
| `backend/` | script Google Apps Script per le email e i promemoria |
| `test/` | prove automatiche: `node --test test/*.test.js` |
