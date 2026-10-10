/* Disponibilità Ops — archivio dati su Firebase: Firestore per i dati, Authentication per gli accessi.
 * Chi può leggere e scrivere cosa lo decidono le regole in firebase/firestore.rules. */
(function (DO) {
  'use strict';

  const SDK = 'https://www.gstatic.com/firebasejs/12.3.0/';
  // Ogni codice operatore è un account Firebase: email ricavata dal codice (dominio riservato, non riceve posta)
  // e password uguale al codice. Nella console di Firebase si vedono solo impronte, non i codici.
  const DOMINIO_OPERATORI = 'operatori.tgi-disponibilita.example.com';
  const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // senza 0/O e 1/I
  const GIORNI_CONSERVATI = 120;                          // i giorni più vecchi vengono tolti a ogni invio

  let ruolo = '', alloScadere = null;
  let F = null, app = null, auth = null, db = null, cachePersistente = false;
  let operatoreCorrente = null, secondaria = null;
  let accessoSola = false;   // dashboard di un collega in sola visualizzazione
  const NO_ACCESSO = 'Questa email non ha accesso alla dashboard: chiedi a un supervisore.';

  function configura(r, scaduta) {
    ruolo = r;
    alloScadere = scaduta;
  }

  // ---------- avvio ----------
  async function avvia() {
    if (db) return;
    const [a, au, fs] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map((f) => import(SDK + f)));
    F = Object.assign({}, a, au, fs);
    const cfg = DO.CONFIG;
    // nome diverso per le due pagine: un supervisore può provare il link di un operatore senza uscire dalla dashboard
    app = F.initializeApp(cfg.FIREBASE, ruolo === 'admin' ? 'supervisori' : 'operatori');
    // come getAuth ma senza i componenti per l'accesso con Google (popup/redirect), che qui non si usa:
    // sui telefoni getAuth li scarica (apis.google.com e una pagina nascosta) prima di dire se si è già dentro
    auth = F.initializeAuth(app, { persistence: [F.indexedDBLocalPersistence, F.browserLocalPersistence, F.browserSessionPersistence] });
    auth.languageCode = 'it';   // le email di Firebase (conferma indirizzo, nuova password) in italiano
    // la dashboard tiene una copia dei dati sul computer (solo con "Ricorda"): si apre subito, poi si aggiorna
    cachePersistente = ruolo === 'admin' && DO.ricordato();
    db = cachePersistente
      ? F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) })
      : F.getFirestore(app);
    if (cfg.EMULATORI) {
      F.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    await auth.authStateReady();
  }

  function traduci(e, predefinito) {
    const codice = (e && e.code) || '';
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/invalid-login-credentials'].includes(codice)) return new Error(predefinito);
    if (codice === 'auth/too-many-requests') return new Error('Troppi tentativi: riprova tra qualche minuto.');
    if (codice === 'auth/network-request-failed' || codice === 'unavailable') return new Error('Connessione non riuscita: controlla la rete e riprova.');
    if (codice === 'auth/weak-password') return new Error('La password deve avere almeno 8 caratteri.');
    if (codice === 'permission-denied') return new Error('Operazione non consentita.');
    return new Error((e && e.message) || predefinito || 'Errore sconosciuto.');
  }

  // Codice cambiato, operatore disattivato, password supervisori cambiata: si torna all'accesso.
  async function negato(e, messaggio, avvisa = true) {
    if (!e || e.code !== 'permission-denied') throw traduci(e);
    await F.signOut(auth).catch(() => {});
    operatoreCorrente = null;
    // collega tolto dall'elenco: via anche la copia dei dati sul dispositivo (compensi compresi), come con «Esci»
    if (messaggio === NO_ACCESSO) await cancellaCopiaLocale();
    if (avvisa && alloScadere) alloScadere(messaggio);
    throw new Error(messaggio);
  }

  // ---------- codici operatore ----------
  const normalizza = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formato = (c) => c.slice(0, 4) + '-' + c.slice(4);

  async function emailDaCodice(c) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tgi-disponibilita:' + c)));
    return 'op-' + Array.from(hash.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('') + '@' + DOMINIO_OPERATORI;
  }

  function generaCodice() {
    const byte = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(byte, (b) => ALFABETO[b % 32]).join('');
  }

  // Gli account si creano con una seconda istanza di Firebase, per non far uscire il supervisore.
  async function creaAccount() {
    if (!secondaria) {
      const istanza = F.initializeApp(DO.CONFIG.FIREBASE, 'creazione-account');
      secondaria = F.initializeAuth(istanza, { persistence: F.inMemoryPersistence });
      if (DO.CONFIG.EMULATORI) F.connectAuthEmulator(secondaria, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    for (let i = 0; i < 5; i++) {
      const codice = generaCodice();
      try {
        const cred = await F.createUserWithEmailAndPassword(secondaria, await emailDaCodice(codice), codice);
        await F.signOut(secondaria);
        return { codice, uid: cred.user.uid };
      } catch (e) {
        if (e.code !== 'auth/email-already-in-use') throw traduci(e);
      }
    }
    throw new Error('Non riesco a creare il codice, riprova.');
  }

  const pubblico = (id, o) => ({
    id, nome: o.nome || '', mansione: o.mansione || '', email: o.email || '', telefono: o.telefono || '',
    attivo: o.attivo !== false, ultimoInvio: o.ultimoInvio || '', contratto: o.contratto || '', ruolo: o.ruolo || 'OP',
    onsite: ['TL', 'OP'].includes(o.onsite) ? o.onsite : '',
  });

  // ---------- sessione ----------
  async function utente() {
    await avvia();
    const u = auth.currentUser;
    if (!u) return null;
    if (ruolo === 'admin') {
      const accesso = await accessoDashboard(u);
      if (accesso) return accesso;
      await F.signOut(auth);
      return null;
    }
    if (!u.email || !u.email.endsWith('@' + DOMINIO_OPERATORI)) { await F.signOut(auth); return null; }
    try {
      return { operatore: await caricaOperatore(false) };
    } catch (e) {
      return null;
    }
  }

  // avvisa = false all'avvio e all'accesso: lì l'errore si mostra nella scheda di accesso
  async function caricaOperatore(avvisa = true) {
    const scaduto = 'Il tuo codice non è più valido: chiedine uno nuovo ai supervisori.';
    let mappa;
    try {
      mappa = await F.getDoc(F.doc(db, 'utenti', auth.currentUser.uid));
    } catch (e) {
      return negato(e, scaduto, avvisa);
    }
    if (!mappa.exists()) return negato({ code: 'permission-denied' }, scaduto, avvisa);
    const id = mappa.data().operatoreId;
    try {
      const o = await F.getDoc(F.doc(db, 'operatori', id));
      operatoreCorrente = pubblico(id, o.data());
      return operatoreCorrente;
    } catch (e) {
      return negato(e, 'Il tuo accesso è disattivato: contatta i supervisori.', avvisa);
    }
  }

  async function accediOperatore(testo, ricorda) {
    await avvia();
    const codice = normalizza(testo);
    if (codice.length !== 8) throw new Error('Il codice ha 8 caratteri, es. K7QM-4XPA.');
    const email = await emailDaCodice(codice);
    // link personale riaperto da chi è già dentro con lo stesso codice: l'accesso non si ripete
    if (operatoreCorrente && auth.currentUser && auth.currentUser.email === email) return operatoreCorrente;
    await F.setPersistence(auth, ricorda ? F.browserLocalPersistence : F.browserSessionPersistence);
    try {
      await F.signInWithEmailAndPassword(auth, email, codice);
    } catch (e) {
      throw traduci(e, 'Codice non valido.');
    }
    DO.ricorda(ricorda);
    return caricaOperatore(false);
  }

  // ---------- supervisori: ognuno con il proprio account ----------
  const normalizzaEmail = (e) => String(e || '').trim().toLowerCase();
  const eSupervisore = (e) => (DO.CONFIG.SUPERVISORI || []).map(normalizzaEmail).includes(normalizzaEmail(e));
  // un messaggio che non è un errore (es. "controlla la posta"): la scheda di accesso lo mostra in blu
  const informa = (testo) => Object.assign(new Error(testo), { info: true });

  // l'accesso si decide dopo l'ingresso (supervisori nel codice, colleghi nell'elenco): qui solo il formato
  function controllaEmail(email) {
    const e = normalizzaEmail(email);
    if (!/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(e)) throw new Error('Scrivi un\'email valida.');
    return e;
  }

  // Supervisore, collega in sola visualizzazione (visualizzatori/{email}) o nessun accesso
  async function accessoDashboard(u) {
    const email = normalizzaEmail(u.email);
    let inElenco = false;
    if (u.emailVerified && !eSupervisore(email)) {
      try {
        inElenco = (await F.getDoc(F.doc(db, 'visualizzatori', email))).exists();
      } catch (e) {
        if (e.code !== 'permission-denied') throw traduci(e);
      }
    }
    const tipo = DO.tipoAccesso({ email, verificata: u.emailVerified, supervisori: DO.CONFIG.SUPERVISORI, inElenco });
    accessoSola = tipo === 'sola';
    return tipo === 'supervisore' ? { admin: true } : tipo === 'sola' ? { admin: true, sola: true, email } : null;
  }

  // Si entra solo dopo aver confermato l'indirizzo: nessuno può spacciarsi per un supervisore
  // registrandosi con la sua email, perché il link di conferma arriva solo a lui.
  async function accediSupervisore(email, password, ricorda) {
    await avvia();
    email = controllaEmail(email);
    await F.setPersistence(auth, ricorda ? F.browserLocalPersistence : F.browserSessionPersistence);
    try {
      await F.signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      throw traduci(e, 'Email o password errata.');
    }
    if (!auth.currentUser.emailVerified) {
      try { await F.sendEmailVerification(auth.currentUser); } catch (e) { /* già inviata da poco */ }
      await F.signOut(auth);
      throw informa('Prima di entrare conferma il tuo indirizzo: ti abbiamo mandato un\'email con il link (guarda anche nello spam), poi entra di nuovo.');
    }
    await auth.currentUser.getIdToken(true);
    const accesso = await accessoDashboard(auth.currentUser);
    if (!accesso) { await F.signOut(auth); throw new Error(NO_ACCESSO); }
    DO.ricorda(ricorda);
    return accesso;
  }

  async function creaSupervisore(email, password) {
    await avvia();
    email = controllaEmail(email);
    if (String(password).length < 8) throw new Error('La password deve avere almeno 8 caratteri.');
    try {
      await F.createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') throw new Error('Hai già un account: entra con la tua password, oppure usa "Password dimenticata?".');
      throw traduci(e);
    }
    try { await F.sendEmailVerification(auth.currentUser); } finally { await F.signOut(auth); }
    throw informa('Account creato. Ti abbiamo mandato un\'email: clicca il link per confermare l\'indirizzo, poi entra con la tua password.');
  }

  async function recuperaPassword(email) {
    await avvia();
    email = controllaEmail(email);
    try { await F.sendPasswordResetEmail(auth, email); } catch (e) { throw traduci(e); }
    throw informa('Se l\'account esiste, ti abbiamo mandato un\'email per scegliere una nuova password.');
  }

  async function esci() {
    await avvia();
    accessoSola = false;
    await F.signOut(auth).catch(() => {});
    // la copia dei dati sul computer se ne va con l'uscita
    await cancellaCopiaLocale();
  }

  // Copia di Firestore salvata sul dispositivo: si chiude, si cancella e si riparte senza copia
  async function cancellaCopiaLocale() {
    accessoSola = false;
    DO.dimentica();
    if (!cachePersistente) return;
    await F.terminate(db).catch(() => {});
    await F.clearIndexedDbPersistence(db).catch(() => {});
    cachePersistente = false;
    db = F.getFirestore(app);
    if (DO.CONFIG.EMULATORI) F.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  // Le email partono dallo script Google, che verifica chi le chiede con il gettone di Firebase.
  async function email(azione, dati) {
    const idToken = await auth.currentUser.getIdToken();
    return DO.inviaEmail(azione, Object.assign({ idToken }, dati));
  }

  // ---------- operatore ----------
  async function mieDisponibilita() {
    // la scheda dell'operatore è appena stata letta all'accesso o all'apertura della pagina: non si rilegge
    const op = operatoreCorrente || await caricaOperatore();
    const oggi = DO.oggi();
    try {
      const [d, r] = await Promise.all([
        F.getDoc(F.doc(db, 'disponibilita', op.id)),
        F.getDocs(F.query(F.collection(db, 'richieste'), F.where('attiva', '==', true))),
      ]);
      const richieste = r.docs.map((x) => Object.assign({ id: x.id }, x.data()))
        .filter((x) => x.a >= oggi && (x.destinatari || []).includes(op.id))
        .map((x) => ({ id: x.id, da: x.da, a: x.a, messaggio: x.messaggio || '', creata: x.creata }));
      return { operatore: op, giorni: (d.exists() && d.data().giorni) || {}, richieste, oggi, limite: DO.limite() };
    } catch (e) {
      return negato(e, 'Il tuo accesso non è più valido: contatta i supervisori.');
    }
  }

  async function inviaDisponibilita(giorni) {
    const op = operatoreCorrente || await caricaOperatore();
    const min = DO.oggi(), max = DO.limite(), adesso = new Date().toISOString();
    const date = Object.keys(giorni).filter((d) => d >= min && d <= max).sort();
    let modifiche = [];
    try {
      await F.runTransaction(db, async (t) => {
        modifiche = [];
        const rif = F.doc(db, 'disponibilita', op.id);
        const snap = await t.get(rif);
        const tutti = Object.assign({}, snap.exists() ? snap.data().giorni : {});
        date.forEach((d) => {
          const s = giorni[d].s || '', n = String(giorni[d].n || '').trim().slice(0, 200);
          const prima = tutti[d] || {};
          if ((prima.s || '') === s && (prima.n || '') === n) return;
          modifiche.push({ d, da: prima.s || '', a: s, n });
          if (!s && !n) delete tutti[d];
          else tutti[d] = { s, n, t: adesso };
        });
        const soglia = DO.aggiungi(min, -GIORNI_CONSERVATI);
        Object.keys(tutti).forEach((d) => { if (d < soglia) delete tutti[d]; });
        t.set(rif, { giorni: tutti });
        t.update(F.doc(db, 'operatori', op.id), { ultimoInvio: adesso });
        t.set(F.doc(F.collection(db, 'invii')), { quando: adesso, operatoreId: op.id, nome: op.nome, modifiche, letto: false });
      });
    } catch (e) {
      return negato(e, 'Il tuo accesso non è più valido: contatta i supervisori.');
    }
    op.ultimoInvio = adesso;
    // l'email ai supervisori parte in sottofondo: l'operatore non aspetta Google
    email('notificaInvio', { modifiche }).catch((e) => console.warn('Email ai supervisori non inviata:', e.message));
    return { inviatoIl: adesso, modifiche: modifiche.length };
  }

  // ---------- supervisori ----------
  // Ascolto in tempo reale: alla prima lettura arrivano tutti i dati, poi solo ciò che cambia.
  function ascolta(cb) {
    const stato = { operatori: null, disponibilita: null, invii: null, richieste: null, eventi: null, regole: null, operativo: null, onsite: null, compensiOnsite: null, richiesteEvento: null, visualizzatori: null };
    // un collega in sola visualizzazione non legge Aggiornamenti, richieste per periodo e l'elenco dei colleghi
    if (accessoSola) Object.assign(stato, { invii: [], richieste: [], visualizzatori: [] });
    // eventi e richieste per evento arrivati dal server (non solo dalla copia sul computer): solo allora la dashboard le allinea
    // (anche le regole: ritrovo e fine della copia per gli operatori si calcolano da lì)
    const dalServer = { eventi: false, richiesteEvento: false, regole: false };
    let ultimeRegole = '';
    const pronto = () => { if (Object.values(stato).every((v) => v !== null)) cb(Object.assign({ sincronizzato: dalServer.eventi && dalServer.richiesteEvento && dalServer.regole }, stato)); };
    let fermo = false;
    const errore = (e) => {
      if (fermo) return;
      // tutte le letture negate insieme (accesso tolto, sessione scaduta): si esce una volta sola
      if (e.code === 'permission-denied') { fermo = true; negato(e, accessoSola ? NO_ACCESSO : 'Sessione scaduta: accedi di nuovo.').catch(() => {}); }
      else DO.avviso('Aggiornamento in tempo reale interrotto: ' + traduci(e).message, 'errore');
    };
    // Eventi e regole sono arrivati dopo: se le regole di Firestore non sono ancora aggiornate
    // il resto della dashboard funziona lo stesso, con un avviso invece di far uscire.
    const erroreNuovo = (chiave, vuoto, messaggio = 'Convocazioni non disponibili: pubblica le nuove regole di Firestore (vedi README).') => (e) => {
      if (fermo) return;
      // per un collega una lettura negata vuol dire accesso tolto: esce
      if (e.code !== 'permission-denied' || accessoSola) { errore(e); return; }
      stato[chiave] = vuoto;
      pronto();
      if (!avvisati.has(messaggio)) { avvisati.add(messaggio); DO.avviso(messaggio, 'errore', 12000); }
    };
    const avvisati = new Set();
    const SENZA_ONSITE = 'On-site non disponibile: pubblica le nuove regole di Firestore (vedi README).';
    const ferma = [
      F.onSnapshot(F.collection(db, 'operatori'), (s) => {
        stato.operatori = s.docs.map((d) => Object.assign(pubblico(d.id, d.data()), { uid: d.data().uid }));
        pronto();
      }, errore),
      F.onSnapshot(F.collection(db, 'disponibilita'), (s) => {
        const m = {};
        s.docs.forEach((d) => { m[d.id] = d.data().giorni || {}; });
        stato.disponibilita = m;
        pronto();
      }, errore),
      ...(accessoSola ? [] : [
        F.onSnapshot(F.query(F.collection(db, 'invii'), F.orderBy('quando', 'desc'), F.limit(60)), (s) => {
          stato.invii = s.docs.map((d) => Object.assign({ id: d.id }, d.data()));
          pronto();
        }, errore),
        F.onSnapshot(F.query(F.collection(db, 'richieste'), F.where('attiva', '==', true)), (s) => {
          stato.richieste = s.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.creata < b.creata ? 1 : -1));
          pronto();
        }, errore),
        F.onSnapshot(F.collection(db, 'visualizzatori'), (s) => {
          stato.visualizzatori = s.docs.map((d) => d.data()).sort((a, b) => String(a.email).localeCompare(String(b.email)));
          pronto();
        }, erroreNuovo('visualizzatori', [], 'Accessi in sola visualizzazione non disponibili: pubblica le nuove regole di Firestore (vedi README).')),
      ]),
      // eventi e turni della stagione in corso (da agosto): calendario e riepilogo senza altre letture
      F.onSnapshot(F.query(F.collection(db, 'eventi'), F.where('data', '>=', DO.regole.stagione(DO.oggi()).da)), { includeMetadataChanges: true }, (s) => {
        if (stato.eventi !== null && DO.soloMetadati(s, dalServer.eventi)) return;
        stato.eventi = s.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        dalServer.eventi = !s.metadata.fromCache;
        pronto();
      }, erroreNuovo('eventi', [])),
      F.onSnapshot(F.doc(db, 'impostazioni', 'regole'), { includeMetadataChanges: true }, (d) => {
        const daServer = !d.metadata.fromCache, testo = JSON.stringify(d.exists() ? d.data() : null);
        if (stato.regole !== null && daServer === dalServer.regole && testo === ultimeRegole) return;
        ultimeRegole = testo;
        dalServer.regole = daServer;
        stato.regole = DO.regole.complete(d.exists() ? d.data() : null);
        pronto();
      }, erroreNuovo('regole', DO.regole.complete(null))),
      F.onSnapshot(F.doc(db, 'impostazioni', 'operativo'), (d) => {
        stato.operativo = operativoDa(d);
        pronto();
      }, erroreNuovo('operativo', Object.assign({}, DO.OPERATIVO_PREDEFINITO))),
      F.onSnapshot(F.query(F.collection(db, 'onsite'), F.where('a', '>=', DO.regole.stagione(DO.oggi()).da)), (s) => {
        stato.onsite = s.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        pronto();
      }, erroreNuovo('onsite', [], SENZA_ONSITE)),
      F.onSnapshot(F.collection(db, 'onsiteRiservato'), (s) => {
        const m = {};
        s.docs.forEach((d) => { m[d.id] = d.data().compenso; });
        stato.compensiOnsite = m;
        pronto();
      }, erroreNuovo('compensiOnsite', {}, SENZA_ONSITE)),
      F.onSnapshot(F.query(F.collection(db, 'richiesteEvento'), F.where('evento.data', '>=', DO.regole.stagione(DO.oggi()).da)), { includeMetadataChanges: true }, (s) => {
        if (stato.richiesteEvento !== null && DO.soloMetadati(s, dalServer.richiesteEvento)) return;
        stato.richiesteEvento = s.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        dalServer.richiesteEvento = !s.metadata.fromCache;
        pronto();
      }, erroreNuovo('richiesteEvento', [], 'Richieste per evento non disponibili: pubblica le nuove regole di Firestore (vedi README).')),
    ];
    return () => { fermo = true; ferma.forEach((f) => f()); };
  }

  async function scrivi(lavoro) {
    try { return await lavoro(); } catch (e) { return negato(e, 'Sessione scaduta: accedi di nuovo.'); }
  }

  function segnaLetti(ids) {
    return scrivi(async () => {
      const batch = F.writeBatch(db);
      ids.slice(0, 450).forEach((id) => batch.update(F.doc(db, 'invii', id), { letto: true }));
      await batch.commit();
    });
  }

  async function salvaOperatore(o) {
    const campi = {
      nome: String(o.nome || '').trim().slice(0, 80), mansione: String(o.mansione || '').trim().slice(0, 60),
      email: String(o.email || '').trim().slice(0, 120), telefono: String(o.telefono || '').trim().slice(0, 30), attivo: o.attivo !== false,
      contratto: ['P.IVA', 'Coop'].includes(o.contratto) ? o.contratto : '', ruolo: ['TL', 'SUP'].includes(o.ruolo) ? o.ruolo : 'OP',
      onsite: ['TL', 'OP'].includes(o.onsite) ? o.onsite : '',
    };
    if (!campi.nome) throw new Error('Il nome è obbligatorio.');
    if (o.id) {
      await scrivi(() => F.updateDoc(F.doc(db, 'operatori', o.id), campi));
      return { operatore: Object.assign({ id: o.id }, campi) };
    }
    const { codice, uid } = await creaAccount();
    const rif = F.doc(F.collection(db, 'operatori'));
    await scrivi(async () => {
      const batch = F.writeBatch(db);
      batch.set(rif, Object.assign({}, campi, { uid, ultimoInvio: '', creato: new Date().toISOString() }));
      batch.set(F.doc(db, 'utenti', uid), { operatoreId: rif.id });
      await batch.commit();
    });
    return { operatore: pubblico(rif.id, campi), codice: formato(codice) };
  }

  // Il vecchio codice smette subito di funzionare: le regole guardano l'abbinamento account → operatore.
  async function nuovoCodice(id) {
    const o = await F.getDoc(F.doc(db, 'operatori', id));
    if (!o.exists()) throw new Error('Operatore non trovato.');
    const { codice, uid } = await creaAccount();
    await scrivi(async () => {
      const batch = F.writeBatch(db);
      if (o.data().uid) batch.delete(F.doc(db, 'utenti', o.data().uid));
      batch.set(F.doc(db, 'utenti', uid), { operatoreId: id });
      batch.update(F.doc(db, 'operatori', id), { uid });
      await batch.commit();
    });
    return { codice: formato(codice) };
  }

  async function eliminaOperatore(id) {
    const o = await F.getDoc(F.doc(db, 'operatori', id));
    await scrivi(async () => {
      const batch = F.writeBatch(db);
      if (o.exists() && o.data().uid) batch.delete(F.doc(db, 'utenti', o.data().uid));
      batch.delete(F.doc(db, 'operatori', id));
      batch.delete(F.doc(db, 'disponibilita', id));
      await batch.commit();
    });
  }

  // La richiesta è subito visibile agli operatori; le email partono dopo, e "inviate" dice com'è andata.
  async function creaRichiesta(r) {
    if (!r.da || !r.a || r.da > r.a) throw new Error('Periodo non valido.');
    if (r.a < DO.oggi()) throw new Error('Il periodo è già passato.');
    if (!r.destinatari.length) throw new Error('Scegli almeno un operatore.');
    const doc = { creata: new Date().toISOString(), da: r.da, a: r.a, messaggio: String(r.messaggio || '').trim().slice(0, 500), destinatari: r.destinatari, attiva: true };
    const rif = await scrivi(() => F.addDoc(F.collection(db, 'richieste'), doc));
    const conEmail = r.email ? r.contatti.filter((c) => c.email) : [];
    const inviate = conEmail.length
      ? email('emailRichiesta', { destinatari: conEmail, da: r.da, a: r.a, messaggio: doc.messaggio, urlSito: r.urlSito })
      : Promise.resolve({ email: 0 });
    return { id: rif.id, senzaEmail: r.email ? r.contatti.filter((c) => !c.email).map((c) => c.nome) : [], inviate };
  }

  function chiudiRichiesta(id) {
    return scrivi(() => F.updateDoc(F.doc(db, 'richieste', id), { attiva: false }));
  }

  // ---------- eventi e convocazioni (supervisori) ----------
  const voce = (testo) => ({ quando: new Date().toISOString(), testo });

  function pulisciEvento(e) {
    return {
      tipo: DO.tipoEvento(e.tipo),
      competizione: String(e.competizione || '').slice(0, 80), round: String(e.round == null ? '' : e.round).slice(0, 40),
      sport: String(e.sport || '').slice(0, 40), data: e.data, titolo: String(e.titolo || '').trim().slice(0, 120),
      orario: e.orario || '', convocazione: e.convocazione || '', note: String(e.note || '').slice(0, 300),
      // orario di ritrovo già calcolato: gli operatori non leggono le regole (anticipo, tariffe)
      convocazioneCalcolata: e.convocazioneCalcolata || '',
      fine: e.fine || '', fineCalcolata: e.fineCalcolata || '',
      gettone: e.gettone === 'maggiorato' ? 'maggiorato' : '', daSostituire: !!e.daSostituire,
    };
  }

  function creaEventi(lista) {
    return scrivi(async () => {
      for (let i = 0; i < lista.length; i += 400) {
        const batch = F.writeBatch(db);
        lista.slice(i, i + 400).forEach((e) => {
          batch.set(F.doc(F.collection(db, 'eventi')), Object.assign(pulisciEvento(e), {
            operatoreId: e.operatoreId || '', stato: e.operatoreId ? 'assegnato' : 'da-assegnare', inviata: false,
            risposta: '', rispostaIl: '', storico: [voce('Creato')], creato: new Date().toISOString(),
          }));
        });
        await batch.commit();
      }
    });
  }

  // campi: modifiche ai dati dell'evento; nota: riga da aggiungere allo storico
  function aggiornaEvento(id, campi, nota) {
    const dati = Object.assign({}, campi);
    if (nota) dati.storico = F.arrayUnion(voce(nota));
    return scrivi(() => F.updateDoc(F.doc(db, 'eventi', id), dati));
  }

  const eliminaEvento = (id) => scrivi(() => F.deleteDoc(F.doc(db, 'eventi', id)));

  // Le convocazioni diventano visibili agli operatori; le email partono in sottofondo.
  async function inviaConvocazioni(eventi, contatti, urlSito) {
    await scrivi(async () => {
      for (let i = 0; i < eventi.length; i += 400) {
        const batch = F.writeBatch(db);
        eventi.slice(i, i + 400).forEach((e) => batch.update(F.doc(db, 'eventi', e.id), {
          inviata: true, stato: 'convocato', risposta: '', rispostaIl: '', convocazioneCalcolata: e.convocazioneCalcolata || '', fineCalcolata: e.fineCalcolata || '',
          storico: F.arrayUnion(voce('Convocazione inviata')),
        }));
        await batch.commit();
      }
    });
    const conEmail = contatti.filter((c) => c.email);
    // dentro un oggetto: restituire direttamente la promessa farebbe aspettare l'invio delle email
    return { inviate: conEmail.length ? email('emailConvocazioni', { convocazioni: conEmail, urlSito }) : Promise.resolve({ email: 0 }) };
  }

  const salvaRegole = (r) => scrivi(() => F.setDoc(F.doc(db, 'impostazioni', 'regole'), r));

  // Regole per gli operatori: le leggono anche loro (niente tariffe qui dentro).
  function operativoDa(d) {
    const x = d && d.exists() ? d.data() : {};
    const giorni = Number(x.giorniBlocco);
    return { telefono: String(x.telefono || ''), giorniBlocco: Number.isInteger(giorni) && giorni >= 0 ? giorni : DO.OPERATIVO_PREDEFINITO.giorniBlocco };
  }
  // documento assente: valori predefiniti; lettura non riuscita: errore, e la pagina tiene il valore che conosce già
  async function leggiOperativo() {
    await avvia();
    return operativoDa(await F.getDoc(F.doc(db, 'impostazioni', 'operativo')));
  }
  const salvaOperativo = (o) => scrivi(() => F.setDoc(F.doc(db, 'impostazioni', 'operativo'), { telefono: String(o.telefono || ''), giorniBlocco: o.giorniBlocco }));

  // Importazione dal file Excel: identificativi fissi, così ripeterla aggiorna senza duplicare.
  async function importa(p) {
    await scrivi(async () => {
      const scritture = [];
      p.operatori.forEach((o) => scritture.push(['set', F.doc(db, 'operatori', o.id), {
        nome: o.nome, mansione: o.mansione || '', email: o.email || '', telefono: o.telefono || '', attivo: o.attivo !== false, contratto: o.contratto, ruolo: o.ruolo,
        onsite: ['TL', 'OP'].includes(o.onsite) ? o.onsite : '',
        uid: '', ultimoInvio: '', creato: new Date().toISOString(),
      }]));
      p.eventi.forEach((e) => scritture.push(['set', F.doc(db, 'eventi', e.id), Object.assign(pulisciEvento(e), {
        operatoreId: e.operatoreId, stato: e.stato, inviata: e.inviata, risposta: String(e.risposta || '').slice(0, 200), rispostaIl: '',
        storico: e.storico, creato: new Date().toISOString(), fonte: 'excel',
      })]));
      p.disponibilita.forEach((d) => scritture.push(['set', F.doc(db, 'disponibilita', d.id), { giorni: d.giorni }]));
      if (p.regole) scritture.push(['set', F.doc(db, 'impostazioni', 'regole'), p.regole]);
      for (let i = 0; i < scritture.length; i += 400) {
        const batch = F.writeBatch(db);
        scritture.slice(i, i + 400).forEach(([, rif, dati]) => batch.set(rif, dati));
        await batch.commit();
      }
    });
  }

  // ---------- convocazioni (operatore) ----------
  async function mieConvocazioni() {
    const op = operatoreCorrente || await caricaOperatore();
    try {
      const s = await F.getDocs(F.query(F.collection(db, 'eventi'), F.where('operatoreId', '==', op.id), F.where('inviata', '==', true)));
      // all'operatore arrivano solo i dati operativi: niente note interne né gettoni
      return s.docs.map((d) => {
        const e = d.data();
        return { id: d.id, tipo: e.tipo, competizione: e.competizione, round: e.round, sport: e.sport, data: e.data, titolo: e.titolo,
          orario: e.orario, convocazione: e.convocazione, convocazioneCalcolata: e.convocazioneCalcolata || '',
          fine: e.fine || '', fineCalcolata: e.fineCalcolata || '', stato: e.stato, risposta: e.risposta || '' };
      });
    } catch (e) {
      // un accesso revocato lo segnala già mieDisponibilita: qui, nel dubbio, nessuna convocazione
      if (e.code === 'permission-denied') return [];
      throw traduci(e);
    }
  }

  async function rispondiConvocazione(ev, stato, motivo) {
    const op = operatoreCorrente || await caricaOperatore();
    const adesso = new Date().toISOString();
    // per i turni remoti il nome della mansione (i vecchi turni di supervisione hanno ancora il titolo «Supervisione»)
    const voce = { titolo: DO.mansione(ev.tipo) || ev.titolo, tipo: DO.tipoEvento(ev.tipo), data: ev.data, competizione: DO.turnoRemoto(ev.tipo) ? '' : ev.competizione || '' };
    try {
      const batch = F.writeBatch(db);
      batch.update(F.doc(db, 'eventi', ev.id), { stato, risposta: String(motivo || '').slice(0, 200), rispostaIl: adesso });
      batch.set(F.doc(F.collection(db, 'invii')), {
        quando: adesso, operatoreId: op.id, nome: op.nome, modifiche: [], letto: false, tipo: 'convocazione',
        evento: Object.assign({ id: ev.id }, voce, { stato, motivo: String(motivo || '').slice(0, 200) }),
      });
      await batch.commit();
    } catch (e) {
      // Le regole rifiutano una rinuncia nella finestra di blocco: se l'accesso è ancora valido
      // non si esce, si chiede di telefonare. Solo un accesso davvero revocato riporta al login.
      if (e && e.code === 'permission-denied' && stato === 'rifiutato') {
        let valido = true;
        try { await caricaOperatore(false); } catch (x) { valido = false; }
        if (valido) throw new Error(DO.NON_PIU_RINUNCIABILE);
      }
      return negato(e, 'Il tuo accesso non è più valido: contatta i supervisori.');
    }
    if (stato === 'rifiutato') {
      email('notificaRisposta', { evento: voce, stato, motivo })
        .catch((e) => console.warn('Email ai supervisori non inviata:', e.message));
    }
  }

  // ---------- deployment on-site ----------
  // Supervisori: scheda in onsite/{id}, compenso a parte in onsiteRiservato/{id} (gli operatori non lo leggono).
  const contattiEmail = (extra) => {
    const contatti = extra && extra.email ? extra.contatti || [] : [];
    return { senzaEmail: contatti.filter((c) => !c.email).map((c) => c.nome), conEmail: contatti.filter((c) => c.email) };
  };
  const mandaRichiestaOnsite = (scheda, conEmail, urlSito) => (conEmail.length
    ? email('emailOnsite', {
      destinatari: conEmail.map((c) => ({ nome: c.nome, email: c.email, ruolo: c.ruolo || '' })),
      deployment: { titolo: scheda.titolo, luogo: scheda.luogo, sport: scheda.sport, note: scheda.note, giorni: scheda.giorni, da: scheda.da, a: scheda.a, posti: scheda.posti },
      urlSito,
    })
    : Promise.resolve({ email: 0 }));

  async function creaOnsite(d, extra) {
    const scheda = DO.onsite.normalizza(d, DO.oggi());
    const destinatari = Array.from(new Set(d.destinatari || []));
    if (!destinatari.length) throw new Error('Scegli almeno un operatore.');
    const compenso = DO.onsite.compensoValido(extra && extra.compenso);
    const rif = F.doc(F.collection(db, 'onsite'));
    const completa = Object.assign({ creato: new Date().toISOString() }, scheda,
      { destinatari, accettatiTL: [], accettatiOP: [], rifiuti: [], esclusi: [], stato: 'aperta' });
    await scrivi(async () => {
      const batch = F.writeBatch(db);
      batch.set(rif, completa);
      batch.set(F.doc(db, 'onsiteRiservato', rif.id), { compenso });
      await batch.commit();
    });
    const { senzaEmail, conEmail } = contattiEmail(extra);
    return { id: rif.id, senzaEmail, inviate: mandaRichiestaOnsite(completa, conEmail, extra.urlSito) };
  }

  async function leggiOnsite(id) {
    const d = await scrivi(() => F.getDoc(F.doc(db, 'onsite', id)));
    if (!d.exists()) throw new Error('Deployment non trovato.');
    return Object.assign({ id }, d.data());
  }

  // In una transazione: posti e destinatari si controllano sui dati di quel momento (un'accettazione
  // appena arrivata o un altro supervisore che aggiunge destinatari non si perdono)
  async function modificaOnsite(id, campi, extra) {
    const compenso = extra && extra.compenso !== undefined ? DO.onsite.compensoValido(extra.compenso) : undefined;
    let d, nuovi;
    const lavoro = async (t) => {
      const doc = await t.get(F.doc(db, 'onsite', id));
      if (!doc.exists()) throw new Error('Deployment non trovato.');
      d = Object.assign({ id }, doc.data());
      if (d.stato === 'annullata') throw new Error('Il deployment è annullato.');
      nuovi = DO.onsite.modifiche(d, campi || {});
      if (Object.keys(nuovi).length) t.update(F.doc(db, 'onsite', id), nuovi);
      if (compenso !== undefined) t.set(F.doc(db, 'onsiteRiservato', id), { compenso });
    };
    try {
      await F.runTransaction(db, lavoro);
    } catch (e) {
      if (!e || !e.code) throw e;   // errori di controllo (posti, annullato…): così come sono
      return negato(e, 'Sessione scaduta: accedi di nuovo.');
    }
    const { senzaEmail, conEmail } = contattiEmail(extra);
    return { senzaEmail, inviate: mandaRichiestaOnsite(Object.assign({}, d, nuovi), conEmail, extra && extra.urlSito) };
  }

  const togliOnsite = (id, idOperatore) => scrivi(() => F.updateDoc(F.doc(db, 'onsite', id), {
    accettatiTL: F.arrayRemove(idOperatore), accettatiOP: F.arrayRemove(idOperatore), esclusi: F.arrayUnion(idOperatore),
  }));

  async function statoOnsite(id, stato) {
    if (!['aperta', 'chiusa', 'annullata'].includes(stato)) throw new Error('Stato non valido.');
    const d = await leggiOnsite(id);
    if (d.stato === 'annullata' && stato !== 'annullata') throw new Error('Il deployment è annullato.');
    await scrivi(() => F.updateDoc(F.doc(db, 'onsite', id), { stato }));
  }

  // Operatori: solo i deployment mandati a loro (le regole lo pretendono anche nella ricerca)
  async function mieiOnsite() {
    const op = operatoreCorrente || await caricaOperatore();
    try {
      const s = await F.getDocs(F.query(F.collection(db, 'onsite'), F.where('destinatari', 'array-contains', op.id)));
      return s.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    } catch (e) {
      // regole non ancora pubblicate: la pagina funziona senza on-site
      if (e.code === 'permission-denied') return [];
      throw traduci(e);
    }
  }

  async function rispondiOnsite(id, accetto) {
    const op = operatoreCorrente || await caricaOperatore();
    const leggi = async () => {
      const d = await F.getDoc(F.doc(db, 'onsite', id));
      if (!d.exists() || !(d.data().destinatari || []).includes(op.id)) throw new Error('Richiesta non trovata.');
      return Object.assign({ id }, d.data());
    };
    // prima si controlla come faranno le regole, così il messaggio è quello giusto
    const controlla = (d, chi = op) => {
      const stato = DO.onsite.statoPerOperatore(d, chi, DO.oggi());
      if (accetto && !['da-rispondere', 'rifiutato'].includes(stato)) throw new Error(DO.onsite.MESSAGGI[stato]);
      if (!accetto && ['accettato', 'annullato', 'escluso', 'scaduta'].includes(stato)) throw new Error(DO.onsite.MESSAGGI[stato]);
      if (!accetto && (d.rifiuti || []).includes(op.id)) throw new Error('Hai già risposto.');
    };
    let d;
    try { d = await leggi(); } catch (e) { if (e.code) throw traduci(e); throw e; }
    controlla(d);
    const adesso = new Date().toISOString();
    try {
      const batch = F.writeBatch(db);
      batch.update(F.doc(db, 'onsite', id), accetto
        ? { ['accettati' + op.onsite]: F.arrayUnion(op.id), rifiuti: F.arrayRemove(op.id) }
        : { rifiuti: F.arrayUnion(op.id) });
      batch.set(F.doc(F.collection(db, 'invii')), {
        quando: adesso, operatoreId: op.id, nome: op.nome, modifiche: [], letto: false, tipo: 'onsite',
        evento: { id, luogo: d.luogo, da: d.da, a: d.a, stato: accetto ? 'accettato' : 'rifiutato', ruolo: accetto ? op.onsite : '' },
      });
      await batch.commit();
    } catch (e) {
      // posto preso da un altro un attimo prima, abilitazione cambiata…: si spiega senza far uscire,
      // a meno che l'accesso non sia davvero revocato
      if (e && e.code === 'permission-denied') {
        let valido = true;
        try { await caricaOperatore(false); } catch (x) { valido = false; }
        if (valido) {
          controlla(await leggi(), operatoreCorrente || op);
          throw new Error('Risposta non registrata: ricarica la pagina e riprova.');
        }
      }
      return negato(e, 'Il tuo accesso non è più valido: contatta i supervisori.');
    }
    if (accetto) email('notificaOnsite', { id }).catch((e) => console.warn('Email ai supervisori non inviata:', e.message));
  }

  // ---------- richieste di disponibilità per un evento ----------
  const SENZA_REGOLE_EVENTO = 'Pubblica le nuove regole di Firestore (vedi README).';

  async function chiediPerEvento(evento, copia, destinatari, extra) {
    const dest = Array.from(new Set(destinatari || []));
    if (!dest.length) throw new Error('Scegli almeno un operatore.');
    const motivo = DO.richiesteEvento.chiedibile(evento, DO.oggi());
    if (motivo) throw new Error(motivo);
    const messaggio = String((extra && extra.messaggio) || '').trim().slice(0, 300);
    const rif = F.doc(db, 'richiesteEvento', evento.id);
    try {
      // in una transazione: due supervisori che chiedono insieme per lo stesso evento si sommano, non si sovrascrivono
      await F.runTransaction(db, async (t) => {
        const d = await t.get(rif);
        if (!d.exists()) {
          t.set(rif, { destinatari: dest, messaggio, evento: copia, aggiornata: F.serverTimestamp(), risposte: {}, aperta: true, assegnato: '', creata: new Date().toISOString() });
          return;
        }
        const cambiata = DO.richiesteEvento.copiaDiversa(d.data().evento, copia);
        t.update(rif, Object.assign({ destinatari: F.arrayUnion(...dest), evento: copia, aperta: true, assegnato: '' },
          messaggio ? { messaggio } : {}, cambiata ? { aggiornata: F.serverTimestamp() } : {}));
      });
    } catch (e) {
      // regole non ancora pubblicate (le impostazioni si leggono ancora) oppure sessione davvero scaduta
      if (e && e.code === 'permission-denied' && await F.getDoc(F.doc(db, 'impostazioni', 'regole')).then(() => true, () => false)) throw new Error(SENZA_REGOLE_EVENTO);
      return negato(e, 'Sessione scaduta: accedi di nuovo.');
    }
    const { senzaEmail, conEmail } = contattiEmail(extra);
    const inviate = conEmail.length
      ? email('emailRichiestaEvento', { destinatari: conEmail.map((c) => ({ nome: c.nome, email: c.email })), evento: copia, messaggio, urlSito: extra.urlSito })
      : Promise.resolve({ email: 0 });
    return { senzaEmail, inviate };
  }

  // Correzione calcolata da DO.richiesteEvento.allineamento, riletta in una transazione: se un'altra dashboard
  // l'ha già scritta non si scrive niente. Chi chiama mostra gli errori solo in console.
  function allineaRichiestaEvento(id, campi) {
    const rif = F.doc(db, 'richiesteEvento', id);
    return F.runTransaction(db, async (t) => {
      const d = await t.get(rif);
      const nuovi = d.exists() && DO.richiesteEvento.campiDaScrivere(d.data(), campi);
      if (nuovi) t.update(rif, Object.assign(nuovi, nuovi.aggiornata ? { aggiornata: F.serverTimestamp() } : {}));
    });
  }

  // Operatori: solo le richieste mandate a loro (le regole lo pretendono anche nella ricerca)
  async function mieRichiesteEvento() {
    const op = operatoreCorrente || await caricaOperatore();
    const oggi = DO.oggi();
    const mie = F.query(F.collection(db, 'richiesteEvento'), F.where('destinatari', 'array-contains', op.id));
    try {
      let s;
      try {
        // con l'indice composto destinatari + evento.data (vedi README) si leggono solo quelle da oggi in poi
        s = await F.getDocs(F.query(mie, F.where('evento.data', '>=', oggi)));
      } catch (e) {
        if (e.code !== 'failed-precondition') throw e;
        s = await F.getDocs(mie);
      }
      return s.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((r) => ((r.evento || {}).data || '') >= oggi);
    } catch (e) {
      // regole non ancora pubblicate: la pagina funziona senza richieste per evento
      if (e.code === 'permission-denied') return [];
      throw traduci(e);
    }
  }

  async function rispondiRichiestaEvento(id, risposta) {
    if (!['si', 'no'].includes(risposta)) throw new Error('Risposta non valida.');
    const op = operatoreCorrente || await caricaOperatore();
    const leggi = async () => {
      let d;
      try { d = await F.getDoc(F.doc(db, 'richiesteEvento', id)); } catch (e) { if (e.code === 'permission-denied') throw new Error('Richiesta non trovata.'); throw traduci(e); }
      if (!d.exists() || !(d.data().destinatari || []).includes(op.id)) throw new Error('Richiesta non trovata.');
      return d.data();
    };
    // prima si controlla come faranno le regole, così il messaggio è quello giusto
    const controlla = (r) => {
      if (((r.evento || {}).data || '') < DO.oggi()) throw new Error('La partita è già passata.');
      if (!r.aperta) throw new Error('La richiesta è chiusa: il posto è già stato coperto.');
    };
    const r = await leggi();
    controlla(r);
    try {
      const batch = F.writeBatch(db);
      batch.update(F.doc(db, 'richiesteEvento', id), new F.FieldPath('risposte', op.id), { r: risposta, il: F.serverTimestamp() });
      batch.set(F.doc(F.collection(db, 'invii')), {
        quando: new Date().toISOString(), operatoreId: op.id, nome: op.nome, modifiche: [], letto: false, tipo: 'risposta-evento',
        evento: { id, titolo: r.evento.titolo || '', data: r.evento.data, risposta },
      });
      await batch.commit();
    } catch (e) {
      // richiesta chiusa un attimo prima: si spiega senza far uscire, a meno che l'accesso non sia davvero revocato
      if (e && e.code === 'permission-denied') {
        let valido = true;
        try { await caricaOperatore(false); } catch (x) { valido = false; }
        if (valido) {
          controlla(await leggi());
          throw new Error('Risposta non registrata: ricarica la pagina e riprova.');
        }
      }
      return negato(e, 'Il tuo accesso non è più valido: contatta i supervisori.');
    }
    if (risposta === 'si') email('notificaRispostaEvento', { id }).catch((e) => console.warn('Email ai supervisori non inviata:', e.message));
  }

  // ---------- accessi in sola visualizzazione (solo supervisori) ----------
  async function scriviElenco(lavoro) {
    try { return await lavoro(); } catch (e) {
      // regole non ancora pubblicate (le impostazioni si leggono ancora) oppure sessione davvero scaduta
      if (e && e.code === 'permission-denied' && await F.getDoc(F.doc(db, 'impostazioni', 'regole')).then(() => true, () => false)) throw new Error(SENZA_REGOLE_EVENTO);
      return negato(e, 'Sessione scaduta: accedi di nuovo.');
    }
  }

  async function aggiungiVisualizzatore(email) {
    const r = DO.controllaVisualizzatore(email, [], DO.CONFIG.SUPERVISORI);
    if (r.errore) throw new Error(r.errore);
    const rif = F.doc(db, 'visualizzatori', r.email);
    await scriviElenco(async () => {
      if ((await F.getDoc(rif)).exists()) throw new Error('È già nell\'elenco.');
      await F.setDoc(rif, { email: r.email, aggiunto: new Date().toISOString(), da: normalizzaEmail(auth.currentUser.email) });
    });
    return r.email;
  }

  const togliVisualizzatore = (email) => scriviElenco(() => F.deleteDoc(F.doc(db, 'visualizzatori', normalizzaEmail(email))));

  const leggiImpostazioni = () => email('leggiImpostazioni');
  const inviaBackupOra = () => email('inviaBackupOra');
  const salvaImpostazioni = (x) => email('salvaImpostazioni', x);

  async function cambiaPassword(attuale, nuova) {
    if (String(nuova).length < 8) throw new Error('La nuova password deve avere almeno 8 caratteri.');
    try {
      await F.reauthenticateWithCredential(auth.currentUser, F.EmailAuthProvider.credential(auth.currentUser.email, attuale));
    } catch (e) {
      throw traduci(e, 'La password attuale non è corretta.');
    }
    try {
      await F.updatePassword(auth.currentUser, nuova);
    } catch (e) {
      throw traduci(e);
    }
  }

  DO.firebase = {
    configura, utente, accediOperatore, accediSupervisore, creaSupervisore, recuperaPassword, esci,
    mieDisponibilita, inviaDisponibilita, mieConvocazioni, rispondiConvocazione,
    ascolta, segnaLetti, salvaOperatore, nuovoCodice, eliminaOperatore, creaRichiesta, chiudiRichiesta,
    creaEventi, aggiornaEvento, eliminaEvento, inviaConvocazioni, salvaRegole, importa, leggiOperativo, salvaOperativo,
    leggiImpostazioni, salvaImpostazioni, cambiaPassword,
    creaOnsite, modificaOnsite, togliOnsite, statoOnsite, mieiOnsite, rispondiOnsite,
    chiediPerEvento, allineaRichiestaEvento, mieRichiesteEvento, rispondiRichiestaEvento,
    aggiungiVisualizzatore, togliVisualizzatore, inviaBackupOra,
  };
})(window.DO = window.DO || {});
