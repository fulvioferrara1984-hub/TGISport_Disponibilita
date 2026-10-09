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
