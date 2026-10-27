// Prove dell'archivio su Firebase (app/dati-firebase.js) con un Firebase JS SDK finto: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');

register('./firebase-finto.mjs', pathToFileURL(__filename));
const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
global.localStorage = memoria();
global.sessionStorage = memoria();
global.window = { addEventListener() {}, DO_CONFIG: { FIREBASE: { apiKey: 'prova' }, SUPERVISORI: ['sup@x.it'] } };
require('../app/comune.js');
require('../app/onsite.js');
require('../app/regole.js');
require('../app/richieste-evento.js');
require('../app/messaggi.js');
require('../app/dati-firebase.js');
const DO = window.DO, FB = DO.firebase;

// Firebase finto: un collega in sola visualizzazione collegato; ogni onSnapshot ricorda il suo gestore d'errore
function firebaseFinto() {
  const ascolti = [];
  globalThis.__firebaseFinto = {
    initializeApp: () => ({}),
    initializeAuth: () => ({ currentUser: { email: 'collega@x.it', emailVerified: true, getIdToken: async () => 'gettone' }, authStateReady: async () => {} }),
    getFirestore: () => ({}), initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    doc: (db, ...p) => ({ path: p.join('/') }), collection: (db, nome) => ({ path: nome }), query: (c) => c, where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    getDoc: async (rif) => ({ exists: () => rif.path === 'visualizzatori/collega@x.it', data: () => ({}) }),
    onSnapshot: (rif, ...resto) => {
      const gestori = resto.filter((x) => typeof x === 'function');
      ascolti.push({ rif, errore: gestori[1] });
      return () => {};
    },
    // l'uscita scrive nella memoria del browser: non è immediata
    signOut: () => new Promise((fatto) => setTimeout(fatto, 20)),
  };
  return ascolti;
}

test('collega tolto con la dashboard aperta: una sola uscita anche se tutte le letture vengono negate insieme', async () => {
  const ascolti = firebaseFinto();
  const uscite = [];
  FB.configura('admin', (messaggio) => uscite.push(messaggio));
  assert.deepEqual(await FB.utente(), { admin: true, sola: true, email: 'collega@x.it' });
  FB.ascolta(() => {});
  assert.ok(!ascolti.some((a) => ['invii', 'richieste', 'visualizzatori'].includes(a.rif.path)));   // un collega non le ascolta
  // Firestore consegna ogni errore in un giro a parte (setTimeout 0)
  ascolti.forEach((a) => setTimeout(() => a.errore({ code: 'permission-denied' }), 0));
  await new Promise((fatto) => setTimeout(fatto, 120));
  assert.deepEqual(uscite, ['Questa email non ha accesso alla dashboard: chiedi a un supervisore.']);
});

// ---------------------------------------------------------------- piccoli miglioramenti
// archivio ricaricato da capo, con un Firebase finto in cui si sceglie l'utente collegato
function archivioNuovo(utente, extra) {
  delete require.cache[require.resolve('../app/dati-firebase.js')];
  require('../app/dati-firebase.js');
  const chiamate = [], ascolti = [];
  globalThis.__firebaseFinto = Object.assign({
    initializeApp: () => ({}),
    initializeAuth: () => ({ currentUser: utente, authStateReady: async () => {} }),
    getFirestore: () => { chiamate.push('getFirestore'); return {}; },
    initializeFirestore: () => { chiamate.push('initializeFirestore'); return {}; },
    persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    terminate: async () => { chiamate.push('terminate'); }, clearIndexedDbPersistence: async () => { chiamate.push('clearIndexedDbPersistence'); },
    doc: (db, ...p) => ({ path: p.join('/') }), collection: (db, nome) => ({ path: nome }), query: (c) => c, where: () => ({}), orderBy: () => ({}), limit: () => ({}),
    getDoc: async (rif) => ({ exists: () => rif.path === 'visualizzatori/collega@x.it', data: () => ({}) }),
    onSnapshot: (rif, ...resto) => { ascolti.push({ rif, errore: resto.filter((x) => typeof x === 'function')[1] }); return () => {}; },
    signOut: async () => {},
  }, extra || {});
  return { FB: window.DO.firebase, chiamate, ascolti };
}

test('collega tolto: si cancella anche la copia dei dati sul dispositivo', async () => {
  const { FB, chiamate, ascolti } = archivioNuovo({ email: 'collega@x.it', emailVerified: true, getIdToken: async () => 'g' });
  DO.avviaPagina('admin', () => {});
  DO.ricorda(true);   // «Ricorda su questo dispositivo»: la dashboard tiene la copia dei dati
  assert.equal((await FB.utente()).sola, true);
  assert.ok(chiamate.includes('initializeFirestore'));
  FB.ascolta(() => {});
  ascolti[0].errore({ code: 'permission-denied' });
  await new Promise((fatto) => setTimeout(fatto, 30));
  assert.ok(chiamate.includes('terminate') && chiamate.includes('clearIndexedDbPersistence'), chiamate.join());
  assert.equal(DO.ricordato(), false);
  DO.ricorda(false);
});

test('modifica di un deployment: posti controllati sui dati letti nella transazione', async () => {
  const dep = { da: '2026-11-12', a: '2026-11-13', posti: { TL: 1, OP: 2 }, destinatari: ['x', 'y'], accettatiTL: [], accettatiOP: [], stato: 'aperta' };
  const scritte = [];
  const { FB } = archivioNuovo({ email: 'sup@x.it', emailVerified: true, getIdToken: async () => 'g' }, {
    getDoc: async () => ({ exists: () => true, data: () => dep }),   // lettura fuori dalla transazione: nessuno ha accettato
    runTransaction: async (db, lavoro) => lavoro({
      // nel frattempo due operatori hanno accettato
      get: async () => ({ exists: () => true, data: () => Object.assign({}, dep, { accettatiOP: ['x', 'y'] }) }),
      update: (rif, campi) => scritte.push(campi), set: (rif, campi) => scritte.push(campi),
    }),
  });
  DO.avviaPagina('admin', () => {});
  assert.deepEqual(await FB.utente(), { admin: true });
  await assert.rejects(FB.modificaOnsite('d1', { posti: { TL: 1, OP: 1 } }, {}), /I posti non possono essere meno di chi ha già accettato\./);
  assert.equal(scritte.length, 0);
});

test('importazione: gli operatori nuovi arrivano con i loro dati', async () => {
  const scritte = [];
  const { FB } = archivioNuovo({ email: 'sup@x.it', emailVerified: true, getIdToken: async () => 'g' }, {
    writeBatch: () => ({ set: (rif, dati) => scritte.push(dati), commit: async () => {} }),
  });
  DO.avviaPagina('admin', () => {});
  await FB.utente();
  await FB.importa({ operatori: [{ id: 'xls-z', nome: 'Zeno', ruolo: 'SUP', contratto: 'Coop', email: 'z@x.it', telefono: '+39 1', onsite: 'TL', attivo: false }], eventi: [], disponibilita: [], regole: null });
  const z = scritte[0];
  assert.deepEqual([z.email, z.telefono, z.onsite, z.attivo, z.ruolo], ['z@x.it', '+39 1', 'TL', false, 'SUP']);
});


test('regole per gli operatori: lettura non riuscita → errore (la pagina tiene il valore già noto), documento assente → predefinite', async () => {
  const { FB } = archivioNuovo({ email: 'sup@x.it', emailVerified: true, getIdToken: async () => 'g' }, {
    getDoc: async (rif) => { if (rif.path === 'impostazioni/operativo') throw Object.assign(new Error('offline'), { code: 'unavailable' }); return { exists: () => false, data: () => ({}) }; },
  });
  DO.avviaPagina('admin', () => {});
  await assert.rejects(FB.leggiOperativo());
  const { FB: FB2 } = archivioNuovo({ email: 'sup@x.it', emailVerified: true, getIdToken: async () => 'g' }, {
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  });
  assert.deepEqual(await FB2.leggiOperativo(), { telefono: '', giorniBlocco: 3 });
});

test('collega tolto con gli emulatori: il Firestore riaperto resta sull\'emulatore', async () => {
  DO.CONFIG.EMULATORI = true;
  try {
    const { FB, chiamate, ascolti } = archivioNuovo({ email: 'collega@x.it', emailVerified: true, getIdToken: async () => 'g' }, {
      connectAuthEmulator: () => chiamate.push('connectAuthEmulator'),
      connectFirestoreEmulator: () => chiamate.push('connectFirestoreEmulator'),
    });
    DO.avviaPagina('admin', () => {});
    DO.ricorda(true);
    await FB.utente();
    FB.ascolta(() => {});
    ascolti[0].errore({ code: 'permission-denied' });
    await new Promise((fatto) => setTimeout(fatto, 30));
    assert.equal(chiamate.filter((c) => c === 'connectFirestoreEmulator').length, 2, chiamate.join());
  } finally { DO.CONFIG.EMULATORI = false; DO.ricorda(false); }
});

test('importazione: disponibilità unite ai giorni presenti, on-site per intero con il compenso a parte', async () => {
  const scritte = [];
  const { FB } = archivioNuovo({ email: 'sup@x.it', emailVerified: true, getIdToken: async () => 'g' }, {
    writeBatch: () => ({ set: (rif, dati, opzioni) => scritte.push([rif.path, dati, opzioni]), commit: async () => {} }),
  });
  DO.avviaPagina('admin', () => {});
  await FB.utente();
  await FB.importa({ operatori: [], eventi: [], disponibilita: [], regole: null,
    disponibilitaBackup: [{ id: 'luca', giorni: { '2026-10-18': { s: 'D', n: '' } } }],
    onsite: [{ id: 'd7', luogo: 'Torino', giorni: [], destinatari: ['luca'], stato: 'aperta', compenso: 250 }] });
  assert.deepEqual(scritte, [
    ['disponibilita/luca', { giorni: { '2026-10-18': { s: 'D', n: '' } } }, { merge: true }],
    ['onsite/d7', { luogo: 'Torino', giorni: [], destinatari: ['luca'], stato: 'aperta' }, undefined],
    ['onsiteRiservato/d7', { compenso: 250 }, undefined],
  ]);
});

// ---------------------------------------------------------------- messaggi
test('risposta del supervisore: messaggio e voci lette nella stessa scrittura', async () => {
  const scritte = [];
  let commit = 0;
  const { FB } = archivioNuovo({ email: 'sup@x.it', emailVerified: true, getIdToken: async () => 'g' }, {
    doc: (a, ...p) => (p.length ? { path: p.join('/'), id: p[p.length - 1] } : { path: a.path + '/nuovo1', id: 'nuovo1' }),
    writeBatch: () => ({ set: (r, d) => scritte.push(['set', r.path, d]), update: (r, d) => scritte.push(['update', r.path, d]), commit: async () => { commit++; } }),
  });
  DO.avviaPagina('admin', () => {});
  assert.deepEqual(await FB.utente(), { admin: true });
  await assert.rejects(FB.messaggioSupervisore({ tipo: 'evento', rif: 'e1', operatoreId: 'op1', testo: '  ', autore: 'Giulia' }, { nome: 'Luca', email: '' }, '', []),
    /Scrivi un messaggio \(al massimo 500 caratteri\)\./);
  const r = await FB.messaggioSupervisore({ tipo: 'evento', rif: 'e1', operatoreId: 'op1', testo: ' Sì, portalo ', autore: 'Giulia' }, { nome: 'Luca', email: '' }, 'https://x/', ['v1', 'v2']);
  assert.equal(commit, 1);
  assert.deepEqual([r.id, r.senzaEmail], ['nuovo1', true]);
  const [tipo, percorso, doc] = scritte[0];
  assert.deepEqual([tipo, percorso], ['set', 'messaggi/nuovo1']);
  assert.deepEqual(Object.keys(doc).sort(), ['autore', 'da', 'letto', 'operatoreId', 'quando', 'rif', 'testo', 'tipo']);
  assert.deepEqual([doc.da, doc.testo, doc.autore, doc.letto], ['supervisore', 'Sì, portalo', 'Giulia', false]);
  assert.deepEqual(scritte.slice(1), [['update', 'invii/v1', { letto: true }], ['update', 'invii/v2', { letto: true }]]);
});

test('dashboard: ascolta anche i messaggi della stagione', async () => {
  const sup = archivioNuovo({ email: 'sup@x.it', emailVerified: true, getIdToken: async () => 'g' });
  DO.avviaPagina('admin', () => {});
  await sup.FB.utente();
  sup.FB.ascolta(() => {});
  assert.ok(sup.ascolti.some((a) => a.rif.path === 'messaggi'));
  // anche un collega in sola visualizzazione: le conversazioni si leggono
  const collega = archivioNuovo({ email: 'collega@x.it', emailVerified: true, getIdToken: async () => 'g' });
  DO.avviaPagina('admin', () => {});
  assert.equal((await collega.FB.utente()).sola, true);
  collega.FB.ascolta(() => {});
  assert.ok(collega.ascolti.some((a) => a.rif.path === 'messaggi'));
  assert.ok(!collega.ascolti.some((a) => a.rif.path === 'invii'));
});

// operatore collegato (account del codice) con un Firebase finto in cui si sceglie come va la scrittura
function archivioOperatore(commit, operatoreValido = () => true) {
  const scritte = [], uscite = [];
  let uscito = false;
  const { FB } = archivioNuovo({ uid: 'u1', email: 'demo0001@' + DO_DOMINIO, emailVerified: true, getIdToken: async () => 'g' }, {
    doc: (a, ...p) => (p.length ? { path: p.join('/'), id: p[p.length - 1] } : { path: a.path + '/nuovo-' + a.path, id: 'nuovo-' + a.path }),
    getDoc: async (rif) => {
      if (!operatoreValido()) { const e = new Error('negato'); e.code = 'permission-denied'; throw e; }
      if (rif.path === 'utenti/u1') return { exists: () => true, data: () => ({ operatoreId: 'op1' }) };
      return { exists: () => true, data: () => ({ nome: 'Marco Rossi', attivo: true }) };
    },
    writeBatch: () => ({ set: (r, d) => scritte.push(['set', r.path, d]), update: (r, d) => scritte.push(['update', r.path, d]), commit }),
    signOut: async () => { uscito = true; },
  });
  DO.avviaPagina('operatore', (m) => uscite.push(m));
  return { FB, scritte, uscite, uscito: () => uscito };
}
const DO_DOMINIO = 'operatori.tgi-disponibilita.example.com';
const evento = { id: 'e1', tipo: 'partita', titolo: 'Milan-Inter', data: '2026-10-24' };

test('messaggio dell\'operatore: messaggio e voce di Aggiornamenti nella stessa scrittura', async () => {
  let commit = 0;
  const a = archivioOperatore(async () => { commit++; });
  assert.equal((await a.FB.utente()).operatore.id, 'op1');
  const m = await a.FB.scriviMessaggio({ tipo: 'evento', rif: 'e1', testo: ' Porto il PC? ' }, evento);
  assert.equal(commit, 1);
  assert.deepEqual(a.scritte.map(([t, p]) => t + ' ' + p), ['set messaggi/nuovo-messaggi', 'set invii/nuovo-invii']);
  const [, , doc] = a.scritte[0], [, , voce] = a.scritte[1];
  assert.deepEqual(Object.keys(doc).sort(), ['autore', 'da', 'letto', 'operatoreId', 'quando', 'rif', 'testo', 'tipo']);
  assert.deepEqual([doc.da, doc.operatoreId, doc.autore, doc.testo], ['operatore', 'op1', 'Marco Rossi', 'Porto il PC?']);
  assert.deepEqual(Object.keys(voce).sort(), ['evento', 'letto', 'modifiche', 'nome', 'operatoreId', 'quando', 'tipo']);
  assert.deepEqual([voce.tipo, voce.evento.titolo, voce.evento.testo, voce.modifiche], ['messaggio', 'Milan-Inter', 'Porto il PC?', []]);
  assert.equal(m.id, 'nuovo-messaggi');
});

test('messaggio dell\'operatore rifiutato dalle regole: convocazione cambiata (si resta dentro) o accesso tolto (si esce)', async () => {
  const negato = async () => { const e = new Error('negato'); e.code = 'permission-denied'; throw e; };
  const cambiata = archivioOperatore(negato);
  await cambiata.FB.utente();
  await assert.rejects(cambiata.FB.scriviMessaggio({ tipo: 'evento', rif: 'e1', testo: 'ciao' }, evento), /La convocazione è cambiata: ricarica la pagina\./);
  assert.equal(cambiata.uscito(), false);
  let valido = true;
  const tolto = archivioOperatore(negato, () => valido);
  await tolto.FB.utente();
  valido = false;
  await assert.rejects(tolto.FB.scriviMessaggio({ tipo: 'evento', rif: 'e1', testo: 'ciao' }, evento), /Il tuo accesso non è più valido: contatta i supervisori\./);
  assert.equal(tolto.uscito(), true);
});

test('messaggi letti dall\'operatore: solo il campo letto', async () => {
  const a = archivioOperatore(async () => {});
  await a.FB.utente();
  await a.FB.segnaMessaggiLetti(['m1', 'm2']);
  assert.deepEqual(a.scritte, [['update', 'messaggi/m1', { letto: true }], ['update', 'messaggi/m2', { letto: true }]]);
  await a.FB.segnaMessaggiLetti([]);
  assert.equal(a.scritte.length, 2);
});

// ---------------------------------------------------------------- building dalla piattaforma
const SUP = { email: 'sup@x.it', emailVerified: true, getIdToken: async () => 'g' };

test('building: eventi della piattaforma a gruppi di 30 giorni', async () => {
  const letture = [];
  const date = Array.from({ length: 31 }, (_, i) => '2026-11-' + String(i + 1).padStart(2, '0'));
  const { FB } = archivioNuovo(SUP, {
    where: (...a) => a, query: (c, ...w) => ({ c, w }),
    getDocs: async (q) => {
      letture.push(q);
      const gruppo = q.w[0][2];
      return { docs: gruppo.slice(0, 1).map((d) => ({ id: 'p' + d.slice(-2), data: () => ({ data: d, squadraA: 'Milan' }) })) };
    },
  });
  DO.avviaPagina('admin', () => {});
  await FB.utente();
  const eventi = await FB.leggiProgettiDelleDate(date);
  assert.deepEqual(letture.map((q) => [q.c.path, q.w[0][0], q.w[0][1], q.w[0][2].length]), [['progetti', 'data', 'in', 30], ['progetti', 'data', 'in', 1]]);
  assert.deepEqual(letture[0].w[0][2], date.slice(0, 30));
  assert.deepEqual(letture[1].w[0][2], ['2026-11-31']);
  assert.deepEqual(eventi, [{ id: 'p01', data: '2026-11-01', squadraA: 'Milan' }, { id: 'p31', data: '2026-11-31', squadraA: 'Milan' }]);
});

test('building: lettura negata o non riuscita → nessun evento', async () => {
  let letture = 0;
  const avvisi = [];
  const avvisoOriginale = console.warn;
  console.warn = (...a) => avvisi.push(a.join(' '));
  try {
    for (const errore of [Object.assign(new Error('negato'), { code: 'permission-denied' }), new Error('rete')]) {
      const { FB } = archivioNuovo(SUP, { where: (...a) => a, query: (c, ...w) => ({ c, w }), getDocs: async () => { letture++; throw errore; } });
      DO.avviaPagina('admin', () => {});
      await FB.utente();
      assert.deepEqual(await FB.leggiProgettiDelleDate(['2026-11-01']), []);
    }
    assert.equal(letture, 2);
    // permesso negato in silenzio (regole non ancora pubblicate), ogni altro errore in console
    assert.equal(avvisi.length, 1);
    assert.match(avvisi[0], /rete/);
    const { FB } = archivioNuovo(SUP, { getDocs: async () => { letture++; return { docs: [] }; } });
    DO.avviaPagina('admin', () => {});
    await FB.utente();
    assert.deepEqual(await FB.leggiProgettiDelleDate([]), []);
    assert.equal(letture, 2);
  } finally { console.warn = avvisoOriginale; }
});

// transazione finta su un solo documento: restituisce le scritture fatte
function transazioneSu(dati) {
  const scritte = [];
  return {
    scritte,
    extra: {
      arrayUnion: (...v) => ({ unione: v }),
      runTransaction: async (db, lavoro) => lavoro({
        get: async () => ({ exists: () => !!dati, data: () => dati }),
        update: (rif, campi) => scritte.push([rif.path, campi]),
      }),
    },
  };
}

test('building cambiato: da rimandare una volta sola', async () => {
  const letta = transazioneSu({ inviata: true, stato: 'confermato', building: 'T1' });
  const { FB } = archivioNuovo(SUP, letta.extra);
  DO.avviaPagina('admin', () => {});
  await FB.utente();
  assert.equal(await FB.scriviBuilding('c1', 'T1', 'T3', true), true);
  assert.equal(letta.scritte.length, 1);
  const [percorso, campi] = letta.scritte[0];
  assert.equal(percorso, 'eventi/c1');
  assert.deepEqual(Object.keys(campi).sort(), ['building', 'inviata', 'risposta', 'stato', 'storico']);
  assert.deepEqual([campi.building, campi.inviata, campi.stato, campi.risposta], ['T3', false, 'assegnato', '']);
  assert.equal(campi.storico.unione.length, 1);
  assert.equal(campi.storico.unione[0].testo, 'Building cambiato nella piattaforma: T1 → T3: convocazione da rimandare');
  // già rimessa da inviare da un altro supervisore: niente di nuovo
  const rimessa = transazioneSu({ inviata: false, stato: 'assegnato', building: 'T3' });
  const { FB: FB2 } = archivioNuovo(SUP, rimessa.extra);
  DO.avviaPagina('admin', () => {});
  await FB2.utente();
  assert.equal(await FB2.scriviBuilding('c1', 'T1', 'T3', true), false);
  assert.equal(rimessa.scritte.length, 0);
});

test('inviata prima del building: solo il campo', async () => {
  const vecchia = transazioneSu({ inviata: true, stato: 'convocato' });
  const { FB } = archivioNuovo(SUP, vecchia.extra);
  DO.avviaPagina('admin', () => {});
  await FB.utente();
  assert.equal(await FB.scriviBuilding('c1', undefined, 'T1', false), true);
  const [percorso, campi] = vecchia.scritte[0];
  assert.equal(percorso, 'eventi/c1');
  assert.deepEqual(Object.keys(campi).sort(), ['building', 'storico']);
  assert.equal(campi.building, 'T1');
  assert.equal(campi.storico.unione[0].testo, 'Building dalla piattaforma: T1');
  // inviata senza building (campo vuoto, non assente): non si tocca
  const senza = transazioneSu({ inviata: true, stato: 'convocato', building: '' });
  const { FB: FB2 } = archivioNuovo(SUP, senza.extra);
  DO.avviaPagina('admin', () => {});
  await FB2.utente();
  assert.equal(await FB2.scriviBuilding('c1', undefined, 'T1', false), false);
  assert.equal(senza.scritte.length, 0);
});

test('building: convocazione cambiata nel frattempo (non più inviata, rifiutata, building diverso) → nessuna scrittura', async () => {
  for (const dati of [
    { inviata: false, stato: 'assegnato', building: 'T1' },
    { inviata: true, stato: 'rifiutato', building: 'T1' },
    { inviata: true, stato: 'confermato', building: 'T2' },
    null,
  ]) {
    const t = transazioneSu(dati);
    const { FB } = archivioNuovo(SUP, t.extra);
    DO.avviaPagina('admin', () => {});
    await FB.utente();
    assert.equal(await FB.scriviBuilding('c1', 'T1', 'T3', true), false, JSON.stringify(dati));
    assert.equal(t.scritte.length, 0);
  }
});

test('invio: building sulle partite, non sui turni', async () => {
  const aggiornate = {};
  const { FB } = archivioNuovo(SUP, {
    arrayUnion: (...v) => ({ unione: v }),
    writeBatch: () => ({ update: (rif, campi) => { aggiornate[rif.path] = campi; }, commit: async () => {} }),
  });
  DO.avviaPagina('admin', () => {});
  await FB.utente();
  await FB.inviaConvocazioni([{ id: 'c1', tipo: 'partita', building: 'T1' }, { id: 'c2', tipo: 'partita' }, { id: 't1', tipo: 'supervisione', building: 'T1' }], [], '');
  assert.equal(aggiornate['eventi/c1'].building, 'T1');
  assert.equal(aggiornate['eventi/c2'].building, '');
  assert.ok(!('building' in aggiornate['eventi/t1']));
  assert.equal(aggiornate['eventi/t1'].stato, 'convocato');
});

test('importazione: building conservato solo se c\'è', async () => {
  const scritte = {};
  const { FB } = archivioNuovo(SUP, { writeBatch: () => ({ set: (rif, dati) => { scritte[rif.path] = dati; }, commit: async () => {} }) });
  DO.avviaPagina('admin', () => {});
  await FB.utente();
  const base = { tipo: 'partita', data: '2026-11-10', titolo: 'Milan-Inter', operatoreId: 'op1', stato: 'convocato', inviata: true, storico: [] };
  await FB.importa({ operatori: [], eventi: [Object.assign({ id: 'a', building: 'T3' }, base), Object.assign({ id: 'b' }, base)], disponibilita: [], regole: null });
  assert.equal(scritte['eventi/a'].building, 'T3');
  assert.ok(!('building' in scritte['eventi/b']));
});
