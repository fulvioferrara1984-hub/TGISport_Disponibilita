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
