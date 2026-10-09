# Blocco 7 — Accessi in sola visualizzazione: piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:subagent-driven-development (consigliata) oppure superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** colleghi aggiunti dai supervisori entrano nella dashboard e vedono solo Convocazioni, Riepilogo e Operatori, senza poter modificare nulla.

**Architettura:** decisioni pure (chi entra e come, controlli dell'elenco, testo dell'invito) in `app/comune.js`, provate con `node --test`; elenco `visualizzatori/{email}` in Firestore gestito da `dati-firebase.js` / `demo.js` con le stesse funzioni; regole di Firestore con `visualizzatore()`; dashboard in sola lettura con la classe `sola-lettura` sul `body` che nasconde gli elementi `.solo-modifica`, menu e campi disattivati in JavaScript.

**Tecnologie:** JavaScript nel browser senza framework, Firebase JS SDK 12.3.0, Firestore Security Rules v2, Node 26 (`node:test`).

**Spec:** `docs/superpowers/specs/2026-10-09-sola-visualizzazione-design.md`

## Vincoli globali

- Id di `visualizzatori/{email}` = email in minuscolo e senza spazi; campi esattamente `email` (uguale all'id), `aggiunto` (ISO), `da` (email del supervisore).
- Schede per i colleghi: `convocazioni`, `riepilogo`, `operatori` (si apre su `convocazioni`).
- Testi: «Accessi in sola visualizzazione», «Sola visualizzazione», «Scrivi un'email valida.», «È già un supervisore.», «È già nell'elenco.», «Togliere l'accesso a <email>?», «Questa email non ha accesso alla dashboard: chiedi a un supervisore.», «Pubblica le nuove regole di Firestore (vedi README).», «Accessi in sola visualizzazione non disponibili: pubblica le nuove regole di Firestore (vedi README).»; invito: oggetto «TGI Sport · accesso alla dashboard in sola visualizzazione», testo della spec §1.
- Un collega non scrive mai nulla e la sua dashboard non legge `invii` né `richieste`.
- Demo: `collega@esempio.it` nell'elenco iniziale; nella demo un'email non in elenco entra come supervisore (come oggi).
- Prove: `node --test test/*.test.js`. Pubblicazione: `?v=23` → `?v=24`. Il controllo `pre-commit` deve passare.

## Punti da sorvegliare in revisione

1. **Collega tolto con la dashboard aperta**: esce con «Questa email non ha accesso…», non con «Sessione scaduta» e senza ciclo di riaccesso — prova nel Task 2 (demo: `utente()` → `null` dopo la tolta).
2. **Email con maiuscole o spazi** («Mario.Rossi@TGIsport.com ») aggiunta, creata come account e usata per entrare: stesso id ovunque — prova nel Task 1 (`controllaVisualizzatore` restituisce l'email normalizzata) e nel Task 2.
3. **Collega che apre la pagina con `#impostazioni` o `#griglia` nell'indirizzo**: finisce sulle Convocazioni — verifica nel browser nel Task 3.
4. **Dashboard del collega e scritture nascoste** (allineamento richieste, «segna letto», salvataggio regole/operatori da un tasto rimasto visibile): nessuna scrittura parte — prova nel Task 2 (`ascolta` del collega senza `invii`/`richieste`) e verifica nel browser nel Task 3 (nessun tasto di modifica, console senza permessi negati).
5. **Supervisore il cui indirizzo è anche nell'elenco**: entra da supervisore — prova nel Task 1 (`tipoAccesso`).

---

### Task 1: Decisioni pure (`app/comune.js`)

**File:**
- Modifica: `app/comune.js`, `test/comune.test.js`

**Interfacce:**
- Produce in `DO`:
  - `normalizzaEmail(email) → string` (trim + minuscolo);
  - `tipoAccesso({ email, verificata, supervisori, inElenco }) → 'supervisore' | 'sola' | 'nessuno'`: non verificata → `nessuno`; email tra i supervisori → `supervisore`; `inElenco` → `sola`; altrimenti `nessuno`;
  - `controllaVisualizzatore(email, elenco, supervisori) → { email } | { errore }` con i messaggi dei vincoli globali (`elenco` = lista di email già presenti);
  - `invitoVisualizzatore(email, link) → string` (indirizzo `mailto:` con `DO.mailto`).
- [ ] **Passo 1: scrivere le prove** in `test/comune.test.js`:
  - `chi entra nella dashboard`: verificata + supervisore → `supervisore`; verificata + in elenco → `sola`; supervisore anche in elenco → `supervisore`; non verificata (anche supervisore) → `nessuno`; verificata, né l'uno né l'altro → `nessuno`; email del supervisore con maiuscole → `supervisore`.
  - `controlli dell'elenco in sola visualizzazione`: `' Mario.Rossi@TGIsport.com '` → `{ email: 'mario.rossi@tgisport.com' }`; `'mario'` → `{ errore: 'Scrivi un\'email valida.' }`; email di un supervisore → `{ errore: 'È già un supervisore.' }`; già in elenco (anche con maiuscole) → `{ errore: 'È già nell\'elenco.' }`.
  - `invito in sola visualizzazione`: `decodeURIComponent` dell'indirizzo contiene il destinatario, l'oggetto della spec, il link e l'email nel testo.
- [ ] **Passo 2: eseguire** `node --test test/comune.test.js` → atteso FAIL.
- [ ] **Passo 3: implementare** in `comune.js`.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: commit** `git add app/comune.js test/comune.test.js && git commit -m "Sola visualizzazione: chi entra, controlli dell'elenco e invito"`.

### Task 2: Archivio, accesso, regole, demo

**File:**
- Modifica: `app/dati-firebase.js`, `app/demo.js`, `firebase/firestore.rules`, `test/demo.test.js`

**Interfacce:**
- Consuma: Task 1.
- Produce (stessa firma in Firebase e demo):
  - `utente()` per la dashboard → `{ admin: true }` | `{ admin: true, sola: true, email }` | `null`; `accediSupervisore(email, password, ricorda)` → stesso risultato o errore «Questa email non ha accesso alla dashboard: chiedi a un supervisore.» (Firebase: `tipoAccesso` con la lettura di `visualizzatori/{email}`; lettura negata = non in elenco);
  - `creaSupervisore(email, password)`: qualunque email valida (controllo solo del formato);
  - `aggiungiVisualizzatore(email) → email` e `togliVisualizzatore(email)` (solo supervisori; con `controllaVisualizzatore`; permesso negato con le impostazioni ancora leggibili → «Pubblica le nuove regole di Firestore (vedi README).»);
  - `ascolta(cb)`: per i supervisori lo stato ha `visualizzatori` (lista di `{ email, aggiunto, da }`, lettura negata → `[]` con l'avviso dei vincoli); per un collega niente ascolto di `invii`, `richieste`, `visualizzatori` (liste vuote) e un permesso negato lo fa uscire con «Questa email non ha accesso…».
- Regole (aggiunte e modifiche):

```
    function visualizzatore() {
      return request.auth != null && request.auth.token.email_verified == true
        && exists(/databases/$(database)/documents/visualizzatori/$(request.auth.token.email));
    }
    function lettore() { return supervisore() || visualizzatore(); }
    // lettura anche per i colleghi in sola visualizzazione: operatori, disponibilita, eventi, onsite,
    // onsiteRiservato (scrittura solo supervisori), richiesteEvento, impostazioni/regole e /operativo
    match /visualizzatori/{email} {
      allow read: if supervisore() || (request.auth != null && request.auth.token.email == email);
      allow create, update: if supervisore() && request.resource.data.keys().hasOnly(['email', 'aggiunto', 'da'])
        && request.resource.data.email == email;
      allow delete: if supervisore();
    }
```

- [ ] **Passo 1: scrivere le prove** in `test/demo.test.js`: `sola visualizzazione: elenco` (aggiunta con email normalizzata, già presente, di un supervisore della demo → errori; tolta); `sola visualizzazione: accesso del collega` (`accediSupervisore('collega@esempio.it', 'demo')` → `{ admin: true, sola: true }`, `utente()` uguale, `ascolta` con `invii` e `richieste` vuoti e senza `visualizzatori`; dopo `togliVisualizzatore` → `utente()` `null`); `sola visualizzazione: supervisore` (`ascolta` di un supervisore con `visualizzatori` che contiene `collega@esempio.it`).
- [ ] **Passo 2: eseguire** `node --test test/demo.test.js` → atteso FAIL.
- [ ] **Passo 3: implementare** in `demo.js` (elenco iniziale `['collega@esempio.it']`, supervisori della demo = `DO.CONFIG.SUPERVISORI` se presenti), `dati-firebase.js` e regole.
- [ ] **Passo 4: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 5: commit** `git add app/dati-firebase.js app/demo.js firebase/firestore.rules test/demo.test.js && git commit -m "Sola visualizzazione: elenco dei colleghi, accesso, regole di Firestore e demo"`.

### Task 3: Dashboard in sola lettura, Impostazioni, istruzioni

**File:**
- Modifica: `admin.html` (cartellino `#sola-etichetta`; classe `solo-modifica` su `#ev-onsite`, `#ev-nuovo-tl`, `#ev-nuovo-support`, `#ev-nuove`, `#ev-invia`, `#btn-nuovo-op`, `#evd-elimina`, `#evd-annulla-evento`, Salva della finestra dell'evento, `#evd-chiedi`, `#onss-annulla`, `#onss-stato`, `#onss-modifica-apri`; riquadro «Accessi in sola visualizzazione» in Impostazioni con `#vis-email`, `#vis-aggiungi`, `#vis-elenco`; nota della demo), `app/admin.js`, `app/convocazioni.js`, `app/onsite-admin.js`, `app/impostazioni.js`, `app/stile.css`, `README.md`, `index.html` e `admin.html` (`?v=24`)

**Interfacce:**
- Consuma: Task 1 e 2. Produce: `DO.admin.solaLettura` (boolean), `DO.admin.visualizzatori` (lista), `DO.admin.linkDashboard()` (indirizzo di `admin.html`, senza `#`).

- [ ] **Passo 1: implementare**:
  - `admin.js`: dopo l'accesso `solaLettura = !!u.sola`, `body.sola-lettura`, cartellino, schede visibili e `mostra()` limitati a convocazioni/riepilogo/operatori (indirizzo con un'altra scheda → convocazioni); in `aggiorna` niente allineamento delle richieste per evento in sola lettura; nella tabella operatori i tasti Modifica / codice / Elimina con `solo-modifica`; getter `solaLettura` e `visualizzatori`;
  - `convocazioni.js`: tasti dei giorni con `solo-modifica`; menu operatore disattivato in sola lettura; finestra dell'evento con tutti i campi disattivati in sola lettura (riattivati per i supervisori);
  - `onsite-admin.js`: «Togli» nella scheda con `solo-modifica`;
  - `impostazioni.js`: riquadro dell'elenco (aggiungi con `DO.dati.aggiungiVisualizzatore`, «Invia mail» con `DO.invitoVisualizzatore(email, A.linkDashboard())`, «Togli» con conferma);
  - `stile.css`: `body.sola-lettura .solo-modifica { display: none !important; }` e cartellino;
  - README: Uso quotidiano (colleghi in sola visualizzazione), Messa in linea (sito → regole → ricarica); nota della demo «collega@esempio.it»; `?v=24`.
- [ ] **Passo 2: eseguire** `node --test test/*.test.js` → atteso PASS.
- [ ] **Passo 3: provare nel browser in demo**: aggiunta, invito e tolta di un collega da Impostazioni; accesso come `collega@esempio.it`: tre schede, cartellino, nessun tasto di modifica nelle Convocazioni, menu disattivati, finestra dell'evento in sola lettura, scheda on-site senza azioni, Riepilogo con Excel, Operatori senza tasti; indirizzo `#impostazioni` → Convocazioni; console senza errori; formato telefono.
- [ ] **Passo 4: commit** `git add admin.html index.html app/ README.md && git commit -m "Sola visualizzazione: dashboard in sola lettura, elenco in Impostazioni, istruzioni"`.
