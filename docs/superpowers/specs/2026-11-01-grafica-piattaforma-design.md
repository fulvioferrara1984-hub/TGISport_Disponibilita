# Grafica allineata alla piattaforma TGI Sport

Data: 2026-11-01 · Stato: approvato nel dialogo e con l'esempio visivo, in revisione come documento

## Obiettivo

Disponibilità Ops deve sembrare parte della stessa piattaforma di TGI Sport: stesso tema scuro con interruttore per il chiaro, stessi riquadri, stesso menu laterale per i supervisori. Cambia solo l'aspetto: quello che le pagine fanno resta com'è.

Il riferimento è la grafica pubblicata della piattaforma (`src/app/stile.css` su `origin/main` del repository `TGISport_Piattaforma`, commit `17f9c2f`, e la sua spec `2026-11-01-grafica-tema-scuro-design.md`). Gli esempi approvati da Fulvio il 2026-11-01 sono disegni fuori dal repository (`.superpowers/brainstorm/`).

## Decisioni prese

- **Pagine:** sia supervisori (`admin.html`) sia operatori (`index.html`), comprese le pagine di accesso.
- **Tema:** scuro di partenza per tutti, con interruttore per il chiaro. Il chiaro è lo stesso disegno con i colori chiari.
- **Menu dei supervisori:** laterale, come nella piattaforma; a cassetto sotto i 1024 px.
- **Pagina operatori:** senza menu laterale, perché ha una sola sezione. L'interruttore è un'icona accanto a Esci.
- **Gruppi del menu:** *Lavoro* (Convocazioni, Disponibilità, Aggiornamenti, Riepilogo) e *Gestione* (Operatori, Impostazioni).
- **Testi:** restano in italiano.
- **Si pubblica solo il sito.** Dati, regole, indici, script, email ed Excel non cambiano. Non si tocca il repository della piattaforma.

## Temi

### Variabili

Tutti i colori di `app/stile.css` diventano variabili su due blocchi:

- `:root` contiene il tema **scuro** e dichiara `color-scheme: dark`;
- `:root[data-tema="chiaro"]` contiene il tema **chiaro** e dichiara `color-scheme: light`.

`color-scheme` fa seguire il tema anche ai comandi del browser: selettori di data, menu a tendina, spunte, barre di scorrimento.

Fuori da questi due blocchi non resta nessun colore scritto a mano, con una sola eccezione: `dialog::backdrop`. I browser più vecchi non passano le variabili a quell'elemento e il velo sparirebbe, quindi resta `rgba(0, 0, 0, .55)` in tutti e due i temi.

Le variabili che esistono in entrambi i siti prendono **gli stessi valori della piattaforma**:

| Variabile | Scuro | Chiaro |
|---|---|---|
| `--sfondo` | `#05070d` | `#edf0f5` |
| `--pannello` | `#0d1322` | `#ffffff` |
| `--lato` | `#080c16` | `#ffffff` |
| `--inchiostro` | `#eef1f8` | `#0f1830` |
| `--inchiostro-2` | `#b4bccd` | `#4f5a70` |
| `--inchiostro-3` | `#7b859b` | `#808ba0` |
| `--linea` | `rgba(255,255,255,.07)` | `#dde2eb` |
| `--linea-forte` | `rgba(255,255,255,.14)` | `#c6cdda` |
| `--accento` | `#1f5cff` | `#0b2ff0` |
| `--accento-scuro` | `#8fb4ff` | `#0822c4` |
| `--accento-sopra` | `#1a4fe0` | `#0822c4` |
| `--accento-tenue` | `rgba(31,92,255,.16)` | `#e8edff` |
| `--link` | `#6ea2ff` | `#0b2ff0` |
| `--ok` / `--ok-tenue` | `#4cc77a` / `rgba(76,199,122,.14)` | `#137a41` / `#e7f6ee` |
| `--attenzione` / `--attenzione-tenue` | `#ff9a3c` / `rgba(255,154,60,.14)` | `#a85000` / `#fff4e0` |
| `--errore` / `--errore-tenue` | `#ff6259` / `rgba(255,98,89,.14)` | `#c62f28` / `#fdecea` |
| `--campo` | `#0a1020` | `#ffffff` |
| `--intestazione-tabella` | `#111a2e` | `#f8f9fc` |
| `--riga-sopra` | `#141e36` | `#f7f9ff` |
| `--velo` | `rgba(0,0,0,.6)` | `rgba(15,24,48,.4)` |
| `--hover` | `rgba(255,255,255,.05)` | `#f1f4f9` |
| `--voce-attiva` | `rgba(255,255,255,.07)` | `#e8edff` |
| `--su-accento` | `#ffffff` | `#ffffff` |
| `--su-errore` | `#0d1322` | `#ffffff` |
| `--barra-versione` | `#1f5cff` | `#0f1830` |
| `--alone` | i due gradienti della piattaforma | il gradiente della piattaforma |

Restano uguali in tutti e due i temi il carattere Montserrat, le cinque grandezze di testo e `--marchio-gradiente`. `--raggio` passa a 16 px e lo prendono tutti i riquadri (`.scheda`, `.kpi`, finestre); bottoni e campi restano a 8 px.

### Colori che ha solo Disponibilità

| Variabile | A cosa serve | Scuro | Chiaro |
|---|---|---|---|
| `--vuoto` | giorni non indicati, chip neutri | `rgba(255,255,255,.06)` | `#eff2f6` |
| `--su-stato` | testo sui tasti Disponibile, Parziale, Non disponibile quando sono scelti | `#05070d` | `#ffffff` |
| `--viola`, `--viola-tenue`, `--viola-fondo` | on-site e Remote TL, con i valori di `--attivita-vigilia`, `--vigilia-tenue`, `--vigilia-fondo` della piattaforma | `#b48cff`, `rgba(180,140,255,.14)`, `rgba(180,140,255,.06)` | `#7a3fc4`, `#f4eefc`, `#faf7fe` |
| `--segnale`, `--segnale-testo`, `--segnale-tenue` | «oggi» e Remote Support | `#00b8d9`, `#4fc3ff`, `rgba(79,195,255,.14)` | `#00b8d9`, `#00708a`, `#e2f8fc` |
| `--vetro` | fondo della barra fissa «Invia ai supervisori» | `rgba(8,12,22,.92)` | `rgba(255,255,255,.92)` |
| `--freccia` | la freccia dei menu a tendina, che è un'immagine e non può usare un colore del tema | stessa freccia, tratto `#b4bccd` | stessa freccia, tratto `#5a606d` |
| `--anello` | opacità dell'anello del logo nella pagina di accesso | `.3` | `.14` |
| `--schiarisci` | quanto resta del colore della competizione (sotto) | `62%` | `100%` |

Le ombre diventano variabili (`--ombra`, `--ombra-finestra`, `--ombra-menu`, con i valori della piattaforma): nello scuro i riquadri non hanno ombra, solo il bordo sottile.

### Trappole note dello scuro

Oggi queste scelte funzionano perché il fondo è chiaro; vanno corrette una per una.

- **Blu come testo.** Il blu pieno si legge male sullo scuro. `color: var(--accento)` (12 regole) diventa `--link` per i link e `--accento-scuro` sui fondi `--accento-tenue`. `--accento` resta per i fondi pieni e i bordi.
- **Chiaro su scuro invertito.** Avvisi e *Nuova versione* usano `background: var(--inchiostro)` con testo `#fff`: nello scuro sarebbe bianco su bianco. Prendono `--barra-versione` e `--su-accento`. `.iniziali` prende `--accento-tenue` e `--accento-scuro`, come l'avatar della piattaforma.
- **Tasti di stato pieni.** Bianco su `--ok` scuro non si legge: il testo e il pallino prendono `--su-stato`.
- **Celle fisse.** La prima colonna della griglia e quelle di `.tabella.ampia` restano ferme mentre il resto scorre sotto: devono avere un fondo pieno (`--pannello`, `--intestazione-tabella`), mai una variabile trasparente.
- **Calendario.** `.cal-verde`, `.cal-blu`, `.cal-arancione`, `.cal-rosso` passano ai colori di stato del tema (`--ok`, `--accento-scuro`, `--attenzione`, `--errore`, con i loro fondi tenui).

### Colori delle competizioni

I colori scelti in Impostazioni e la tavolozza di `app/regole.js` non cambiano, e nemmeno i dati. Molti sono scuri e sul fondo scuro si vedrebbero poco: la riga colorata di `.ev-riga` e di `.cal-voce` mescola il colore con il bianco secondo `--schiarisci` (`color-mix(in srgb, var(--comp) var(--schiarisci), var(--su-accento))`).

La mescola sta dentro `@supports (color: color-mix(in srgb, red, blue))`: senza il controllo, sui browser vecchi la riga sparirebbe invece di restare del suo colore. Vale anche per il colore fisso degli on-site in `app/onsite.js`.

## Codice del tema

Un file nuovo, `app/tema.js`, caricato **nel `<head>` senza `defer`** in tutte e due le pagine, così il tema è già impostato al primo disegno e chi ha scelto il chiaro non vede lampi di scuro.

`DO.tema` espone:

- `temaDa(salvato)`: `'chiaro'` se il valore salvato è `'chiaro'`, altrimenti `'scuro'`;
- `altroTema(t)`;
- `attuale()`;
- `cambia()`: passa all'altro tema, lo salva e aggiorna tutti gli interruttori della pagina;
- `collega(elemento, solaIcona)`: disegna in `elemento` l'interruttore e lo tiene aggiornato.

La scelta resta nel browser del dispositivo (`localStorage`, chiave `do-tema`), mai su Firestore. Ogni accesso all'archivio sta in `try/catch`: senza archivio il tema vale per quella visita. Piattaforma e Disponibilità sono su indirizzi diversi, quindi la scelta di una non vale per l'altra.

**Interruttore.** Cambia il tema subito, senza ricaricare. Sta:

- per i supervisori in fondo al menu laterale, con icona e testo *Tema chiaro* / *Tema scuro*;
- per gli operatori in testata accanto a Esci, solo icona, con il testo in `aria-label` e `title`;
- nelle pagine di accesso sotto il tasto Entra, con icona e testo.

**Logo.** `Logo/TGI-Sport_white.png` è copiato dalla piattaforma (`public/logo/TGI-Sport_white.png`). Ogni logo diventa due `<img>`, bianco per lo scuro e nero per il chiaro, e il CSS nasconde quello dell'altro tema.

## Pagina dei supervisori

`admin.html` passa da testata con schede a due colonne: `.guscio` con `aside.lato` e `.colonna`. Le classi `.lato`, `.voce-menu`, `.sezione-menu`, `.piede-lato`, `.avatar`, `.colonna`, `.barra-pagina`, `.percorso`, `.barra-data` (nella piattaforma `.oggi`, che qui esiste già) e `.velo-lato` riprendono le regole della piattaforma.

**Menu laterale**, da 1024 px in su, fisso a sinistra e largo 248 px:

- in cima la linea del marchio, il logo e la scritta *Disponibilità*;
- i gruppi *Lavoro* e *Gestione*, con le icone a tratto scritte nell'HTML (nessuna libreria nuova);
- la voce attiva ha il fondo `--voce-attiva` e la riga dell'accento a sinistra;
- i numeri rossi restano su Convocazioni e Aggiornamenti (`#badge-conv`, `#badge`);
- in fondo l'avatar con l'iniziale, chi è entrato, il ruolo, l'interruttore del tema ed *Esci*.

Le voci restano i bottoni `#schede [data-vista]` e `mostra()` resta l'unico punto che cambia vista. Il menu usa `aria-current="page"` al posto di `role="tab"` e `aria-selected`.

**Chi è entrato:** il nome salvato in `do-nome-supervisore` se c'è, altrimenti l'email della sessione. `utente()` oggi la restituisce solo per la sola visualizzazione: va aggiunta anche per il supervisore in `app/dati-firebase.js` e `app/demo.js`. Senza nome né email (demo) resta solo il ruolo. Il ruolo è *Supervisore* o *Sola visualizzazione*. Il titolo della scheda del browser non cambia.

**Sola visualizzazione:** vede Convocazioni, Riepilogo e Operatori come oggi. Entrambi i gruppi hanno almeno una voce, quindi non compaiono gruppi vuoti.

**Barra della pagina:** a sinistra *Disponibilità / nome della voce*, a destra la data di oggi per esteso («Domenica 1 novembre 2026»). `mostra()` aggiorna il nome della voce. La data si ricalcola anche quando la pagina torna visibile, per chi la lascia aperta di notte. Sotto i 760 px la data non si mostra.

**Sotto i 1024 px** il menu diventa un cassetto, come nella piattaforma:

- la barra resta in cima alla pagina con ☰, logo e percorso;
- il cassetto si apre sopra la pagina, largo `min(280px, 85vw)`, con il velo dietro;
- si chiude scegliendo una voce, toccando il velo o con Esc;
- aperto, il fuoco va sulla prima voce; chiuso con Esc o con il velo, torna su ☰;
- chiuso, è fuori dallo schermo e fuori dal tasto Tab.

**Prima dell'accesso** menu e barra non si vedono, come oggi le schede: restano nascosti finché `entra()` non ha riconosciuto l'utente.

**Cosa si sposta per fare posto al menu:**

- `.dashboard.con-pannello` (griglia con il pannello accanto) va in colonna sotto i 1328 px invece che sotto i 1080, così il contenuto ha la stessa larghezza di oggi;
- `.pannello-conv` non deve più stare sotto la testata: `top: 16px` e `max-height: calc(100vh - 32px)`;
- si tolgono le regole di `.testata.con-schede` e le media query delle schede;
- `mostraDemo` in `app/comune.js` inserisce la striscia demo dopo `.barra-pagina` se c'è, altrimenti dopo `.testata`;
- il calendario a schermo intero e gli avvisi restano sopra a tutto, menu compreso.

## Pagina degli operatori

`index.html` tiene la struttura di oggi, con i colori del tema:

- testata con la linea del marchio, logo, *Disponibilità*, nome dell'operatore dove oggi si vede, icona del tema ed Esci;
- contenuto stretto con `--alone` in cima alla pagina;
- riquadri, tasti di stato, vista settimana e mese, convocazioni, on-site, richieste, messaggi e *Aggiungi al calendario* con le stesse regole di tutto il resto;
- barra fissa *Invia ai supervisori* con il fondo `--vetro`.

## Prove

**Automatiche:**

- `test/tema.test.js`: `temaDa` (chiaro, scuro, sconosciuto, assente), `altroTema`, la scelta salvata e riletta, l'archivio che lancia un errore.
- `test/stile.test.js`, sul modello di `test/app/stile.test.ts` della piattaforma:
  - i testi hanno almeno 4,5:1 sui loro fondi nei due temi (`--inchiostro`, `--inchiostro-2`, `--link`, `--accento-scuro` su `--accento-tenue`, `--ok`, `--attenzione`, `--errore` e `--viola` sui loro fondi tenui, `--segnale-testo` su `--segnale-tenue`, `--su-accento` su `--accento` e `--accento-sopra`, `--su-errore` su `--errore`, `--su-stato` su `--ok`, `--attenzione` ed `--errore`);
  - almeno 3:1 per `--inchiostro-3` e `--accento` su `--pannello`;
  - fuori dai due blocchi non ci sono colori scritti a mano, tranne il velo di `dialog::backdrop`;
  - ogni tema dichiara `color-scheme`;
  - ogni variabile usata nel foglio è definita.
- Con il DOM finto di `test/messaggi.test.js`: apertura e chiusura del cassetto e relativo fuoco; `mostra()` che aggiorna la voce attiva e il percorso; le voci nascoste in sola visualizzazione.

**Nel browser, sulla demo, nei due temi, a 1440, 1024 e 375 px:**

- Accesso di operatori e supervisori, compreso *Primo accesso*.
- Supervisori: Convocazioni (settimana, calendario a schermo intero, finestra dell'evento, conteggi), Disponibilità (griglia con il pannello aperto e il popup della nota), Aggiornamenti, Riepilogo, Operatori, tutte le Impostazioni, sola visualizzazione, cassetto.
- Operatori: settimana e mese, convocazioni, on-site, richieste, messaggi, *Aggiungi al calendario*, barra di invio.
- Finestre e avvisi; avviso di nuova versione; ricaricamento (il tema resta).

## Punti da controllare nella revisione

- Un dispositivo che non può scrivere nel `localStorage` (finestra privata bloccata): il tema deve funzionare per la visita.
- Sui telefoni la pagina non deve scorrere di lato a 375 px.
- Il tema scelto deve restare anche su una vista aperta dal link con `#griglia`.
- `Esci` non deve lasciare visibili menu o barra.
- Righe di evento (`.ev-riga`) a 1024 px, dove il contenuto è largo solo 776 px: devono restare leggibili.

## Pubblicazione

Solo il sito, con `?v=37` su tutti i file: con «unisci e pubblica» di Fulvio si fa il merge su `main` e GitHub Pages pubblica. Regole, indici e script non si toccano. Il README si aggiorna (riga di `app/stile.css`, `app/tema.js`, logo bianco).

## Fuori

- Home con saluto e contatori grandi: i supervisori entrano direttamente in Convocazioni e restano i conteggi di oggi.
- Testi in inglese come nella piattaforma.
- Tema che segue l'impostazione del telefono, tema salvato per utente, scelta condivisa con la piattaforma.
- Un foglio di stile in comune tra i due siti: sono su indirizzi diversi, con classi e tempi di pubblicazione diversi.
- Email, Excel e documenti esportati.
