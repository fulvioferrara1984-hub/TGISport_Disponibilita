# Grafica allineata alla piattaforma TGI Sport — piano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare a Disponibilità Ops il tema scuro con interruttore per il chiaro, i riquadri e il menu laterale della piattaforma TGI Sport, senza cambiare quello che le pagine fanno.

**Architecture:** tutti i colori di `app/stile.css` diventano variabili su due blocchi (`:root` scuro, `:root[data-tema="chiaro"]` chiaro). `app/tema.js`, nel `<head>`, imposta il tema prima del primo disegno. `app/menu.js` contiene la logica del menu laterale e del cassetto; `admin.html` passa da testata con schede a due colonne, `admin.js` resta l'unico punto che cambia vista.

**Tech Stack:** HTML, CSS e JavaScript senza librerie (IIFE su `window.DO`), prove con `node --test test/*.test.js`.

**Spec:** [docs/superpowers/specs/2026-11-01-grafica-piattaforma-design.md](../specs/2026-11-01-grafica-piattaforma-design.md)

## Global Constraints

- Si pubblica solo il sito: niente modifiche a regole, indici, script, email, Excel. Il repository della piattaforma si legge e basta.
- Nessuna libreria nuova, nessuna richiesta esterna.
- Si lavora nel worktree `.claude/worktrees/grafica-piattaforma`, ramo `worktree-grafica-piattaforma`. Niente push né merge prima di «unisci e pubblica».
- Ogni commit finisce con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nomi e commenti in italiano, come il codice intorno.
- Testi esatti: `Tema chiaro`, `Tema scuro`, `Lavoro`, `Gestione`, `Supervisore`, `Sola visualizzazione`. Chiave di memoria: `do-tema`.
- Misure esatte: menu largo `248px` da `1024px`, cassetto `min(280px, 85vw)` sotto `1024px`, griglia e pannello in colonna sotto `1328px`, data della barra nascosta sotto `760px`, versione `?v=37`.
- Riferimenti della piattaforma: `git -C /Users/fulvioisg/Documents/Claude/Code/UnionePiattaforme show origin/main:src/app/stile.css` e `...:test/app/stile.test.ts`.

## Review Focus

1. iPhone senza `color-mix` (prima di iOS 16.2): la riga della competizione resta del suo colore e non sparisce.
2. Browser che non passano le variabili a `dialog::backdrop`: il velo dietro le finestre resta visibile.
3. `localStorage` bloccato fino a far lanciare un errore alla sola lettura di `window.localStorage`: la pagina si carica e il tema vale per la visita.
4. Scorrimento di lato della griglia e di `.tabella.ampia`: le celle ferme hanno un fondo pieno e il resto non si vede in trasparenza.
5. Esc per chiudere una finestra mentre il cassetto è chiuso: il fuoco non deve saltare su ☰.

---

### Task 1: i due temi in `app/stile.css`

**Files:**
- Create: `test/stile.test.js`
- Modify: `app/stile.css`

**Interfaces:**
- Consumes: niente.
- Produces: le variabili della spec e queste in più, usate dai task successivi:

| Variabile | Scuro | Chiaro |
|---|---|---|
| `--errore-sopra` | `#ff7d75` | `#a32520` |
| `--avviso-ok`, `--avviso-errore` | `#13653a`, `#a32520` | uguali |
| `--bordo-info` | `rgba(31,92,255,.4)` | `#c7d2ff` |
| `--bordo-ok` | `rgba(76,199,122,.35)` | `#bfe5cf` |
| `--bordo-attenzione` | `rgba(255,154,60,.35)` | `#f2d7a6` |
| `--bordo-errore` | `rgba(255,98,89,.35)` | `#f3c3bf` |
| `--bordo-viola` | `rgba(180,140,255,.35)` | `#d9c9ff` |
| `--ombra` | `none` | `0 1px 2px rgba(15,24,48,.04), 0 8px 24px rgba(15,24,48,.05)` |
| `--ombra-finestra` | `0 20px 40px rgba(0,0,0,.5)` | `0 20px 40px rgba(15,24,48,.2)` |
| `--ombra-menu` | `0 10px 24px rgba(0,0,0,.45)` | `0 10px 24px rgba(15,24,48,.15)` |
| `--ombra-barra` | `0 -8px 24px -16px rgba(0,0,0,.6)` | `0 -8px 24px -16px rgba(15,24,48,.25)` |
| `--anello-gradiente` | `conic-gradient(from 150deg, transparent 0 9%, #00e8fe 9%, #0018fe 100%)` | uguale |
| `--alone` | `radial-gradient(60% 60% at 70% 30%, rgba(40,70,255,.22), transparent 70%), radial-gradient(40% 50% at 20% 10%, rgba(0,232,254,.10), transparent 70%)` | `radial-gradient(50% 60% at 75% 20%, rgba(11,47,240,.07), transparent 70%)` |

- [ ] **Step 1: scrivi la prova che fallisce**

`test/stile.test.js`, con `node:test` e `require`. Porta da `test/app/stile.test.ts` della piattaforma `blocco`, `variabili`, `colore`, `sopra`, `luce` e `contrasto`, con questi casi:

```js
const TESTI = [
  ['--inchiostro', ['--sfondo', '--pannello', '--lato', '--campo', '--intestazione-tabella']],
  ['--inchiostro-2', ['--sfondo', '--pannello', '--lato', '--intestazione-tabella', '--vuoto']],
  ['--link', ['--pannello', '--sfondo', '--intestazione-tabella']],
  ['--accento-scuro', ['--accento-tenue']],
  ['--ok', ['--ok-tenue']], ['--attenzione', ['--attenzione-tenue']], ['--errore', ['--errore-tenue']],
  ['--viola', ['--pannello', '--viola-tenue']], ['--segnale-testo', ['--segnale-tenue']],
  ['--su-accento', ['--accento', '--accento-sopra', '--barra-versione', '--avviso-ok', '--avviso-errore']],
  ['--su-errore', ['--errore', '--errore-sopra']],
  ['--su-stato', ['--ok', '--attenzione', '--errore']],
];
```

Nomi delle prove e asserzioni, una serie per tema:

- `testi leggibili: almeno 4,5:1 sui loro fondi` (tutti i casi di `TESTI`);
- `testi tenui e accento: almeno 3:1 sulle schede` (`--inchiostro-3` e `--accento` su `--pannello`, `--inchiostro-3` su `--vuoto`);
- `dichiara color-scheme`.

E una volta sola:

- `fuori dai due blocchi nessun colore scritto a mano`: tolti i due blocchi e i commenti, la regex `/(?<![\w-])#[0-9a-fA-F]{3,8}\b|rgba?\(/g` trova solo il velo di `dialog::backdrop`;
- `il velo delle finestre non usa variabili`: la regola `dialog::backdrop` è `rgba(0, 0, 0, .55)` e non contiene `var(`;
- `ogni variabile usata è definita`: ogni `var(--x)` ha una dichiarazione `--x:` nel foglio, tranne `--comp`, che arriva dallo stile scritto da JavaScript;
- `il chiaro ridefinisce solo variabili dello scuro`;
- `la mescola delle competizioni è protetta`: `color-mix(` compare in una dichiarazione solo dentro `@supports (color: color-mix(in srgb, red, blue))`, e fuori c'è `--comp-vista: var(--comp, transparent)`;
- `le celle ferme hanno un fondo pieno`: le regole di `.colonna-op` e di `.tabella.ampia` usano solo `--pannello` o `--intestazione-tabella`, e queste due variabili sono esadecimali in tutti e due i temi.

- [ ] **Step 2: verifica che fallisca**

Run: `node --test test/stile.test.js`
Expected: FAIL, il blocco `:root[data-tema="chiaro"]` non esiste.

- [ ] **Step 3: scrivi i due blocchi**

Sostituisci `:root` in cima a `app/stile.css` con i valori della spec e di questo task. Tieni nel blocco `:root` anche `--t-*`, `--marchio-gradiente`, `font-family`, `font-size`, `color`, `background`, `-webkit-font-smoothing`. `--raggio: 16px`. Il blocco chiaro ridefinisce solo ciò che cambia. Aggiorna il commento d'apertura del file.

- [ ] **Step 4: sostituisci i colori scritti a mano**

Regola generale per il blu come testo: `color: var(--accento)` diventa `--accento-scuro` sui fondi `--accento-tenue` (`.richiesta-testo small`, `.giorno-data .oggi` e `.richiesto`, `.conv-data`, `.tag`, `.conteggio-conv.attivo`) e `--link` altrove (`.link`, `.richiesta > svg`, `.aggiungi-nota:hover`, `.giorno-testa.oggi b`, `.ev-giorno-testa.oggi b`, `.cal-altri:hover`). `.st-blu` prende `--st: var(--accento-scuro)`.

Tabella delle sostituzioni:

| Diventa | Dove |
|---|---|
| `--su-accento` | testo di `button.primario`, `.cal-giorno.oggi .cal-num`, `.avviso`, `.nuova-versione` |
| `--su-errore` | testo di `.badge` e di `button.primario.pericolo` |
| `--su-stato` | testo e pallino di `.stati button[aria-checked="true"]` |
| `--campo` | fondo di input, select, textarea |
| `--pannello` | fondo di `.icona`, `.griglia .colonna-op`, celle ferme di `.tabella.ampia` |
| `--intestazione-tabella` | `.griglia thead th`, `thead th.colonna-op`, `.tabella th`, `.tabella tfoot td`, testate e piedi di `.tabella.ampia`, `.importazione`, `.ev-giorno-testa`, `.cal-giorno.fuori` |
| `--riga-sopra` | `.ev-riga:hover`, `.giorno.modificato`, `.feed-voce.non-letto`, `.griglia td.selezionato` |
| `--hover` | `.bottone:hover` |
| `--viola`, `--viola-tenue` | `.onsite-tag`, `.convocazione.onsite .conv-data`, `.tag-sup`, `.etichetta.ruolo-TL`, `.mc-onsite` e `.mc-num`, `.st-onsite`, `.chip.st-onsite`, `.etichetta-onsite`, `.tag-piattaforma`, `.ev-riga.onsite .ev-ora b`, `.ev-ora .notte`, bordo di `.onsite-piattaforma` |
| `--viola-fondo` | `.ev-riga.sup`, `.ev-riga.onsite`, `.onsite-piattaforma` |
| `--segnale-testo`, `--segnale-tenue` | `.giorno-data .oggi`, `.etichetta.ruolo-SUP`, alone del pallino di `.ev-giorno-testa.oggi b::before` |
| `--bordo-info` | `.richiesta`, `.sintesi-richiesta`, `.filtro-attivo` |
| `--bordo-ok` | `.richiesta.fatta`, `.mc.st-D` |
| `--bordo-attenzione` | `.demo-banner`, `.mc.st-P` |
| `--bordo-errore` | `.mc.st-A` |
| `--bordo-viola` | `.mc-onsite` |
| `--attenzione`, `--attenzione-tenue` | `.tag-ridosso` |
| `--ok` | `.conferma b` |
| `--accento-tenue` | `.barra-avanzamento`; `button.primario:disabled`, con testo `--inchiostro-3` |
| `--errore-sopra` | `button.primario.pericolo:hover` |
| `--barra-versione` | fondo di `.avviso` e `.nuova-versione` |
| `--avviso-ok`, `--avviso-errore` | `.avviso.ok`, `.avviso.errore` |
| `--accento-tenue` + `--accento-scuro` | `.iniziali` |
| `--ombra-finestra` | `.accesso-scheda`, `dialog` |
| `--ombra-menu` | `.popup`, `.avviso`, `.nuova-versione`, `.cal-dettagli` |
| `--ombra` | `.vista-scelta button[aria-pressed="true"]` |
| `--vetro`, `--ombra-barra` | `.barra-invio` |
| `var(--freccia)` | `background-image` di `select` |
| `var(--anello-gradiente)`, `opacity: var(--anello)` | `.accesso::before`; nella `mask` `#000` diventa `black` |

Altri ritocchi:

- `button.primario` perde la sua ombra.
- `.cal-verde` prende `--ok`/`--ok-tenue`, `.cal-blu` `--accento-scuro`/`--accento-tenue`, `.cal-arancione` `--attenzione`/`--attenzione-tenue`, `.cal-rosso` `--errore`/`--errore-tenue`.
- `.ev-riga` e `.cal-voce` dichiarano `--comp-vista: var(--comp, transparent)` e usano `var(--comp-vista)` nel `box-shadow`, così come `.cal-voce:hover`. In coda al foglio: `@supports (color: color-mix(in srgb, red, blue)) { .ev-riga, .cal-voce { --comp-vista: color-mix(in srgb, var(--comp, transparent) var(--schiarisci), var(--su-accento)); } }`.
- `dialog::backdrop { background: rgba(0, 0, 0, .55); }`.
- `.scheda`, `.kpi > div`, `.richiesta`, `.conferma` usano `var(--raggio)`; `.griglia-box` usa `0 0 var(--raggio) var(--raggio)`.
- `--alone` sta sul `body`, per tutte e due le pagine: `body { background-color: var(--sfondo); background-image: var(--alone); background-repeat: no-repeat; background-size: 100% 560px; }`.

- [ ] **Step 5: verifica che passi**

Run: `node --test test/stile.test.js`
Expected: PASS.

Run: `node --test test/*.test.js`
Expected: nessun fallimento.

- [ ] **Step 6: commit**

```bash
git add app/stile.css test/stile.test.js
git commit -m "Grafica: tema scuro e chiaro sulle stesse variabili, con la prova del contrasto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `app/tema.js`, interruttori e logo

**Files:**
- Create: `app/tema.js`, `test/tema.test.js`, `Logo/TGI-Sport_white.png`
- Modify: `index.html`, `admin.html`, `app/stile.css`

**Interfaces:**
- Consumes: i blocchi del Task 1.
- Produces: `DO.tema = { CHIAVE, temaDa(s) → 'chiaro'|'scuro', altroTema(t), leggi(archivio) → tema, salva(archivio, t) → void, attuale() → tema, cambia() → void, collega(elemento, solaIcona) → void }`. Marcatori HTML: `data-interruttore-tema`, `data-sola-icona`. Classi: `.logo-scuro`, `.logo-chiaro`.

- [ ] **Step 1: scrivi la prova che fallisce**

`test/tema.test.js`, con `global.window` e `global.document = { documentElement: { dataset: {} }, querySelectorAll: () => [], addEventListener() {} }` impostati prima di `require('../app/tema.js')`. Un elemento finto ha `innerHTML`, `setAttribute` che registra, `addEventListener` che conserva il click.

```js
test('temaDa: solo «chiaro» è chiaro', () => {
  assert.equal(T.temaDa('chiaro'), 'chiaro');
  for (const v of ['scuro', 'blu', '', null, undefined]) assert.equal(T.temaDa(v), 'scuro');
});
test('altroTema', () => { assert.equal(T.altroTema('scuro'), 'chiaro'); assert.equal(T.altroTema('chiaro'), 'scuro'); });
test('archivio che lancia errori: si legge scuro e si salva senza lanciare', () => {
  const rotto = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.equal(T.leggi(rotto), 'scuro');
  assert.doesNotThrow(() => T.salva(rotto, 'chiaro'));
  assert.equal(T.leggi(null), 'scuro');
});
```

Altre prove:

- `al caricamento applica il tema salvato`: con `window.localStorage` che contiene `do-tema = chiaro`, dopo un nuovo `require` (togliendo il modulo dalla cache) `document.documentElement.dataset.tema` è `chiaro`.
- `localStorage che lancia alla sola lettura non blocca la pagina`: `Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloccato'); }, configurable: true })`; il `require` non lancia, `dataset.tema` è `scuro`, e `cambia()` porta a `chiaro` per la visita.
- `cambia: tema, memoria e tutti gli interruttori`: due elementi collegati, uno `solaIcona`; dopo `cambia()` `dataset.tema` è `chiaro`, in memoria c'è `chiaro`; il primo contiene `<span>Tema scuro</span>`, il secondo non ha `<span>`; tutti e due hanno `aria-label` e `title` uguali a `Tema scuro`.
- `il click sull'interruttore cambia tema`.
- `le due pagine caricano il tema nel head, senza defer`: in `index.html` e `admin.html` il tag di `app/tema.js` sta prima di `</head>` e non contiene `defer` né `async`.
- `ogni logo ha le due versioni`: in ciascuna pagina il numero di `class="[^"]*logo-scuro` è uguale a quello di `logo-chiaro` ed è almeno 2; gli `src` sono rispettivamente `Logo/TGI-Sport_white.png` e `Logo/TGI-Sport_black.png`; il file bianco esiste.

- [ ] **Step 2: verifica che fallisca**

Run: `node --test test/tema.test.js`
Expected: FAIL, `app/tema.js` non esiste.

- [ ] **Step 3: scrivi `app/tema.js`**

IIFE `})(window.DO = window.DO || {})`, senza dipendenze da `comune.js`, perché si carica prima. Al caricamento imposta `document.documentElement.dataset.tema`. L'accesso a `window.localStorage` sta in una funzione con `try/catch`. Su `DOMContentLoaded` chiama `collega(el, el.hasAttribute('data-sola-icona'))` per ogni `[data-interruttore-tema]`.

`collega` scrive nell'elemento l'icona (sole nello scuro, luna nel chiaro, SVG a tratto con `class="ic-tema"` come `i-sole` e `i-luna` dell'esempio) e, se non è `solaIcona`, `<span>Tema chiaro</span>` o `<span>Tema scuro</span>` (il tema verso cui si passa). Imposta `aria-label` e `title` con lo stesso testo e ricorda l'elemento per ridisegnarlo dopo `cambia()`.

- [ ] **Step 4: logo e pagine**

- Copia il logo: `git -C /Users/fulvioisg/Documents/Claude/Code/UnionePiattaforme show origin/main:public/logo/TGI-Sport_white.png > Logo/TGI-Sport_white.png`.
- In `index.html` e `admin.html`, dopo il `<link>` del foglio di stile: `<script src="app/tema.js?v=36"></script>`.
- Ogni `<img>` del logo diventa due `<img>` con le classi di oggi più `logo-scuro` o `logo-chiaro`, e lo stesso `alt` e `onerror`.
- In `index.html`, testata, prima di `#btn-esci`: `<button type="button" class="icona" data-interruttore-tema data-sola-icona></button>`.
- Nei due moduli di accesso, come ultimo elemento: `<button type="button" class="link accesso-tema" data-interruttore-tema></button>`.

In `app/stile.css`:

```css
:root[data-tema="chiaro"] .logo-scuro, :root:not([data-tema="chiaro"]) .logo-chiaro { display: none; }
.ic-tema { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.accesso-tema { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 16px auto 0; font-size: var(--t-14); }
```

- [ ] **Step 5: verifica che passi**

Run: `node --test test/*.test.js`
Expected: nessun fallimento.

- [ ] **Step 6: commit**

```bash
git add app/tema.js test/tema.test.js Logo/TGI-Sport_white.png index.html admin.html app/stile.css
git commit -m "Grafica: tema salvato nel browser, interruttore e logo bianco

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: menu laterale dei supervisori

**Files:**
- Create: `app/menu.js`, `test/menu.test.js`
- Modify: `admin.html`, `app/admin.js`, `app/comune.js` (`mostraDemo`), `app/dati-firebase.js:192`, `app/demo.js:83,113`, `test/firebase.test.js:100,173`, `test/demo.test.js:412`, `app/stile.css`, spec (nome della classe)

**Interfaces:**
- Consumes: `DO.giorno(iso) → { nome, num, mese }`, `DO.oggi()`, `data-interruttore-tema` del Task 2.
- Produces:
  - `DO.menu.ETICHETTE`: `{ convocazioni: 'Convocazioni', griglia: 'Disponibilità', aggiornamenti: 'Aggiornamenti', riepilogo: 'Riepilogo', operatori: 'Operatori', impostazioni: 'Impostazioni' }`;
  - `DO.menu.dataEstesa(iso) → 'Domenica 1 novembre 2026'`;
  - `DO.menu.chi(nomeSalvato, email) → string`: il nome se c'è, altrimenti l'email, altrimenti `''`;
  - `DO.menu.segna(voci, vista, percorso) → void`: `aria-current="page"` solo sulla voce di `vista`, `percorso.textContent` con la sua etichetta;
  - `DO.menu.cassetto({ lato, velo, apri, documento }) → { apri(), chiudi(), chiudiTorna(), aperto() }`: aperto, il fuoco va su `[...lato.querySelectorAll('.voce-menu')].find((v) => !v.hidden)`; `chiudi()` non sposta il fuoco, `chiudiTorna()` lo riporta sul pulsante ☰.
  - `utente()` del supervisore: `{ admin: true, email }`.

- [ ] **Step 1: scrivi le prove che falliscono**

`test/menu.test.js`, caricando `comune.js` e `menu.js` come in `test/messaggi.test.js`. Elementi finti con `classList` (`add`, `remove`, `contains`), `hidden`, `focus()` che registra, `setAttribute`, `removeAttribute`, `dataset`, `addEventListener`. `documento` finto con `addEventListener` e `removeEventListener`.

```js
test('data per esteso', () => assert.equal(M.dataEstesa('2026-11-01'), 'Domenica 1 novembre 2026'));
test('chi è entrato: prima il nome, poi l\'email', () => {
  assert.equal(M.chi('Fulvio', 'f@x.it'), 'Fulvio');
  assert.equal(M.chi('', 'f@x.it'), 'f@x.it');
  assert.equal(M.chi(null, undefined), '');
});
```

Altre prove:

- `segna`: con le voci `griglia` e `riepilogo` e vista `griglia`, solo la prima ha `aria-current`, il percorso dice `Disponibilità`; passando a `riepilogo` l'attributo si sposta.
- `cassetto: si apre e il fuoco va sulla prima voce visibile`: `lato` ha la classe `aperto`, `velo.hidden` è `false`, `apri` ha `aria-expanded="true"`, il fuoco è sulla prima voce con `hidden` falso.
- `cassetto: Esc chiude e torna su ☰`, `cassetto: il velo chiude e torna su ☰`.
- `cassetto: chiudi() non sposta il fuoco` (scelta di una voce).
- `cassetto: chiuso, Esc non fa nulla`: dopo la chiusura `documento` non ha più l'ascoltatore e `apri.focus` non viene chiamato di nuovo.

In `test/firebase.test.js:100,173` l'atteso diventa `{ admin: true, email: 'sup@x.it' }` (controlla l'email di ciascun `archivioNuovo`). In `test/demo.test.js:412` diventa `{ admin: true, email: 'chiunque@x.it' }`. Le sessioni demo salvate senza email (`test/demo.test.js:405,410`) restano `{ admin: true }`.

- [ ] **Step 2: verifica che falliscano**

Run: `node --test test/menu.test.js test/firebase.test.js test/demo.test.js`
Expected: FAIL, `app/menu.js` non esiste e le sessioni non hanno l'email.

- [ ] **Step 3: scrivi `app/menu.js` e passa l'email**

- `app/menu.js`: IIFE su `window.DO`, come da Interfaces. `cassetto` ascolta `keydown` su `documento` solo mentre è aperto, e il click su `velo` e su `apri`.
- `app/dati-firebase.js:192`: `{ admin: true, email }` per il supervisore.
- `app/demo.js:113`: `{ admin: true, email: e }`. `app/demo.js:83`: `return s.email ? { admin: true, email: s.email } : { admin: true };`.

- [ ] **Step 4: scrivi la struttura in `admin.html`**

Sostituisci `<header class="testata con-schede">` e avvolgi `<main id="pagina">` così, lasciando `#accesso` e i `dialog` dove sono:

```html
<div class="guscio">
  <aside class="lato" id="menu-laterale">
    <div class="marchio"><!-- i due logo --><span class="marchio-nome">Disponibilità</span></div>
    <nav id="schede" aria-label="Sezioni">
      <div class="gruppo-menu"><p class="sezione-menu">Lavoro</p> <!-- 4 voci --></div>
      <div class="gruppo-menu"><p class="sezione-menu">Gestione</p> <!-- 2 voci --></div>
    </nav>
    <div class="piede-lato">
      <div class="utente-lato"><span class="avatar" id="chi-avatar" aria-hidden="true"></span>
        <div><b id="chi-nome"></b><small id="marchio-ruolo">Supervisore</small></div></div>
      <button type="button" class="voce-menu" data-interruttore-tema></button>
      <button type="button" class="voce-menu" id="btn-esci" hidden><!-- icona -->Esci</button>
    </div>
  </aside>
  <div class="velo-lato" id="velo-lato" hidden></div>
  <div class="colonna">
    <header class="barra-pagina">
      <button type="button" class="icona apri-menu" id="apri-menu" aria-label="Apri il menu" aria-controls="menu-laterale" aria-expanded="false"><!-- ☰ --></button>
      <span class="logo-barra"><!-- i due logo --></span>
      <p class="percorso">Disponibilità / <b id="percorso-voce"></b></p>
      <span class="barra-data" id="barra-data"></span>
    </header>
    <main class="contenuto" id="pagina" hidden>…</main>
  </div>
</div>
```

Le voci sono `<button type="button" class="voce-menu" data-vista="…"><svg class="ic-menu">…</svg>Nome</button>`, nell'ordine e con i `data-vista` di oggi; `#badge-conv` e `#badge` restano dentro le loro voci. Le icone sono i tracciati `i-cal`, `i-disp`, `i-agg`, `i-rie`, `i-ope`, `i-imp`, `i-esci`, `i-menu` dell'esempio approvato (`/Users/fulvioisg/Documents/Claude/Code/DisponibilitàOps/.superpowers/brainstorm/72207-1793560751/content/grafica-nuova.html`). Niente `role="tablist"`, `role="tab"`, `aria-selected`. Aggiungi `<script src="app/menu.js?v=36"></script>` prima di `app/admin.js`.

- [ ] **Step 5: collega `app/admin.js` e `app/comune.js`**

- `mostra(nome)`: al posto del `setAttribute('aria-selected', …)`, `DO.menu.segna(document.querySelectorAll('#schede [data-vista]'), nome, $('percorso-voce'))`.
- Click su `#schede`: dopo `mostra(...)`, `cassetto.chiudi()`.
- `const cassetto = DO.menu.cassetto({ lato: $('menu-laterale'), velo: $('velo-lato'), apri: $('apri-menu'), documento: document })`.
- `entra()`: all'inizio `document.body.classList.remove('entrato')` al posto di `$('schede').hidden = true`; dopo l'accesso `classList.add('entrato')` al posto di `$('schede').hidden = false`. Ricorda `emailSessione = (u && u.email) || ''`, aggiorna `#marchio-ruolo` (`Sola visualizzazione` o `Supervisore`) e chiama `aggiornaChi()` e `aggiornaData()`.
- `aggiornaChi()`: `$('chi-nome').textContent = DO.menu.chi(DO.leggi('do-nome-supervisore'), emailSessione)`, con `hidden` se è vuoto; `$('chi-avatar').textContent` è l'iniziale maiuscola del nome, oppure di `$('marchio-ruolo').textContent`. Si chiama anche in `nomeSupervisore` dopo `DO.scrivi`. Sempre `textContent`, mai `innerHTML`.
- `aggiornaData()`: `$('barra-data').textContent = DO.menu.dataEstesa(DO.oggi())`; si chiama anche su `visibilitychange` quando la pagina torna visibile.
- `mostraDemo` in `app/comune.js`: `document.querySelector('.barra-pagina, .testata').after(b)`.

- [ ] **Step 6: scrivi il CSS del menu**

Copia dalla piattaforma le regole di `.guscio`, `.lato`, `.lato::before`, `.gruppo-menu`, `.sezione-menu`, `.voce-menu`, `.piede-lato`, `.utente-lato`, `.avatar`, `.colonna`, `.barra-pagina`, `.percorso`, `.velo-lato` e le media query a `1024px` e `1023px`, con queste differenze:

- `.oggi` si chiama `.barra-data`: qui `.oggi` esiste già, su giorni e calendario. Aggiorna anche il nome nella spec.
- `.icona` qui è un bottone: le icone del menu sono `.ic-menu` (20 px, a tratto come `.ic-tema`), e `.voce-menu .ic-tema` è anch'essa di 20 px.
- `.colonna` non ha lo sfondo `--alone`, che sta già sul `body`.
- `.utente-lato small { font-size: var(--t-12); color: var(--inchiostro-2); }`.
- Le voci sono `<button>`: `border: 0; background: none; width: 100%; text-align: left; cursor: pointer;`. La voce attiva è `.voce-menu[aria-current="page"]`. `.voce-menu .badge { margin-left: auto; }`.
- `.barra-pagina` ha `max-width: 1480px`, come `.contenuto`.
- `.apri-menu`, `.logo-barra` nascosti da `1024px`; `.barra-data` nascosta sotto `760px`.
- La griglia a due colonne vale solo con `body.entrato`; `body:not(.entrato) .lato, body:not(.entrato) .barra-pagina { display: none; }`.
- `.marchio` nel menu: `padding: 14px 10px 0`, logo alto 28 px.

Togli le regole di `.schede`, `.testata.con-schede`, `.marchio-ruolo` e le media query a `1180px` e `960px`, tenendo solo ciò che serve a `.testata` della pagina operatori. `@media (max-width: 1080px)` del pannello diventa `@media (max-width: 1328px)`. `.pannello-conv { top: 16px; max-height: calc(100vh - 32px); }`.

- [ ] **Step 7: verifica che passi**

Run: `node --test test/*.test.js`
Expected: nessun fallimento.

- [ ] **Step 8: commit**

```bash
git add app/menu.js test/menu.test.js admin.html app/admin.js app/comune.js app/dati-firebase.js app/demo.js test/firebase.test.js test/demo.test.js app/stile.css docs/superpowers/specs/2026-11-01-grafica-piattaforma-design.md
git commit -m "Grafica: menu laterale dei supervisori, barra della pagina e cassetto sul telefono

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: ripasso nel browser, versione e README

**Files:**
- Modify: `app/stile.css` (solo ciò che il ripasso trova), `index.html`, `admin.html`, `README.md`

**Interfaces:**
- Consumes: tutto il lavoro dei task precedenti.
- Produces: il ramo pronto per la revisione finale.

- [ ] **Step 1: prepara la demo dal worktree**

`.superpowers/demo/prepara.sh` del checkout principale copia dal percorso scritto in `P`. Fai leggere a quella riga `P="${1:-…percorso di oggi…}"` (il file è ignorato da git) e lancia:

Run: `sh /Users/fulvioisg/Documents/Claude/Code/DisponibilitàOps/.superpowers/demo/prepara.sh "$PWD"`
Expected: `demo pronta v=…`, poi la demo risponde su `http://localhost:8765/entra.html?a=admin`. Se lo scratchpad è stato svuotato, riavvia il server «sito».

- [ ] **Step 2: ripassa le pagine e correggi**

Nei due temi (`localStorage['do-tema']`), a 1440, 1024 e 375 px, con `foto.mjs` o con la scheda di anteprima:

- accesso di operatori e supervisori, compreso *Primo accesso*;
- Convocazioni: settimana, conteggi, calendario a schermo intero, finestra dell'evento, on-site dalla piattaforma;
- Disponibilità: griglia con pannello aperto, popup della nota, scorrimento di lato della griglia (celle ferme piene);
- Aggiornamenti, Riepilogo (`.tabella.ampia`), Operatori, tutte le Impostazioni (selettore dei colori compreso);
- sola visualizzazione (`entra.html?a=admin&sola=1`): 3 voci visibili e la voce attiva corretta aprendo `#griglia`;
- cassetto: apertura, Esc, velo, scelta di una voce;
- operatori: settimana e mese, tasti di stato, convocazioni, on-site, richieste, messaggi, *Aggiungi al calendario*, barra di invio;
- finestre, avvisi, *Nuova versione*.

Per ogni pagina controlla con `javascript_tool` che `document.documentElement.scrollWidth <= innerWidth` a 375 px, e che `.ev-riga` a 1024 px resti leggibile. Se il titolo è troppo tagliato, aggiungi prima del blocco a `760px`: `@media (min-width: 761px) and (max-width: 1180px) { .ev-riga { grid-template-columns: 86px minmax(0, 1.2fr) minmax(180px, 1fr) 124px 34px; gap: 10px; } }`. Ricarica la pagina nel tema chiaro: il tema resta e non si vede un lampo di scuro. Correggi quello che trovi, sempre con variabili.

- [ ] **Step 3: alza la versione**

Run: `sed -i '' 's/?v=36"/?v=37"/g' index.html admin.html`

Run: `grep -c '?v=36' index.html admin.html`
Expected: `0` per tutti e due.

- [ ] **Step 4: aggiorna il README**

Nella tabella dei file: la riga di `app/stile.css`, `Logo/` e favicon descrive i due temi e la prova `test/stile.test.js`; righe nuove per `app/tema.js` (scelta in `localStorage`, chiave `do-tema`) e `app/menu.js` (menu laterale e cassetto); il logo bianco è copiato dalla piattaforma.

- [ ] **Step 5: verifica finale**

Run: `node --test test/*.test.js`
Expected: nessun fallimento.

- [ ] **Step 6: commit**

```bash
git add app/stile.css index.html admin.html README.md
git commit -m "Grafica: ripasso delle pagine nei due temi, versione 37 e README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
