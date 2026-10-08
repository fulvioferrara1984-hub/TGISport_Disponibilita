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
    auth = F.getAuth(app);
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
      secondaria = F.getAuth(istanza);
      await F.setPersistence(secondaria, F.inMemoryPersistence);
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
    attivo: o.attivo !== false, ultimoInvio: o.ultimoInvio || '',
  });

  // ---------- sessione ----------
  async function utente() {
    await avvia();
    const u = auth.currentUser;
    if (!u) return null;
    if (ruolo === 'admin') {
      if (u.email === DO.CONFIG.SUPERVISORI_EMAIL) return { admin: true };
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
    await F.setPersistence(auth, ricorda ? F.browserLocalPersistence : F.browserSessionPersistence);
    try {
      await F.signInWithEmailAndPassword(auth, await emailDaCodice(codice), codice);
    } catch (e) {
      throw traduci(e, 'Codice non valido.');
    }
    DO.ricorda(ricorda);
    return caricaOperatore(false);
  }

  async function accediSupervisore(password, ricorda) {
    await avvia();
    if (!DO.CONFIG.SUPERVISORI_EMAIL) throw new Error('Manca SUPERVISORI_EMAIL in app/config.js.');
    await F.setPersistence(auth, ricorda ? F.browserLocalPersistence : F.browserSessionPersistence);
    try {
      await F.signInWithEmailAndPassword(auth, DO.CONFIG.SUPERVISORI_EMAIL, password);
    } catch (e) {
      throw traduci(e, 'Password errata.');
    }
    DO.ricorda(ricorda);
    return { admin: true };
  }

  async function esci() {
    await avvia();
    await F.signOut(auth).catch(() => {});
    // la copia dei dati sul computer se ne va con l'uscita
    if (cachePersistente) {
      await F.terminate(db).catch(() => {});
      await F.clearIndexedDbPersistence(db).catch(() => {});
    }
  }

  // Le email partono dallo script Google, che verifica chi le chiede con il gettone di Firebase.
  async function email(azione, dati) {
    const idToken = await auth.currentUser.getIdToken();
    return DO.inviaEmail(azione, Object.assign({ idToken }, dati));
  }

  // ---------- operatore ----------
  async function mieDisponibilita() {
    const op = await caricaOperatore();
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
    const stato = { operatori: null, disponibilita: null, invii: null, richieste: null };
    const pronto = () => { if (Object.values(stato).every((v) => v !== null)) cb(Object.assign({}, stato)); };
    let fermo = false;
    const errore = (e) => {
      if (fermo) return;
      if (e.code === 'permission-denied') negato(e, 'Sessione scaduta: accedi di nuovo.').catch(() => {});
      else DO.avviso('Aggiornamento in tempo reale interrotto: ' + traduci(e).message, 'errore');
    };
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
      F.onSnapshot(F.query(F.collection(db, 'invii'), F.orderBy('quando', 'desc'), F.limit(60)), (s) => {
        stato.invii = s.docs.map((d) => Object.assign({ id: d.id }, d.data()));
        pronto();
      }, errore),
      F.onSnapshot(F.query(F.collection(db, 'richieste'), F.where('attiva', '==', true)), (s) => {
        stato.richieste = s.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.creata < b.creata ? 1 : -1));
        pronto();
      }, errore),
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

  const leggiImpostazioni = () => email('leggiImpostazioni');
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
    configura, utente, accediOperatore, accediSupervisore, esci,
    mieDisponibilita, inviaDisponibilita,
    ascolta, segnaLetti, salvaOperatore, nuovoCodice, eliminaOperatore, creaRichiesta, chiudiRichiesta,
    leggiImpostazioni, salvaImpostazioni, cambiaPassword,
  };
})(window.DO = window.DO || {});
