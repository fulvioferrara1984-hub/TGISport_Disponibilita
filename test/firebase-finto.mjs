// Aggancio per le prove: i moduli del Firebase JS SDK (scaricati da gstatic nel browser) diventano moduli finti
// che girano le chiamate a globalThis.__firebaseFinto, preparato da ogni prova.
const COSTANTI = ['browserLocalPersistence', 'browserSessionPersistence', 'indexedDBLocalPersistence', 'inMemoryPersistence'];
const FUNZIONI = ['addDoc', 'arrayRemove', 'arrayUnion', 'clearIndexedDbPersistence', 'collection', 'connectAuthEmulator', 'connectFirestoreEmulator',
  'createUserWithEmailAndPassword', 'deleteDoc', 'doc', 'getDoc', 'getDocs', 'getFirestore', 'initializeApp', 'initializeAuth', 'initializeFirestore',
  'limit', 'onSnapshot', 'orderBy', 'persistentLocalCache', 'persistentMultipleTabManager', 'query', 'reauthenticateWithCredential', 'runTransaction',
  'sendEmailVerification', 'sendPasswordResetEmail', 'serverTimestamp', 'setDoc', 'setPersistence', 'signInWithEmailAndPassword', 'signOut', 'terminate',
  'updateDoc', 'updatePassword', 'where', 'writeBatch'];
const SORGENTE = COSTANTI.map((n) => 'export const ' + n + ' = ' + JSON.stringify(n) + ';')
  .concat(FUNZIONI.map((n) => 'export const ' + n + ' = (...a) => globalThis.__firebaseFinto.' + n + '(...a);'))
  .concat(['export class FieldPath { constructor(...parti) { this.parti = parti; } }',
    'export const EmailAuthProvider = { credential: (...a) => ({ credenziale: a }) };'])
  .join('\n');

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('https://www.gstatic.com/firebasejs/')) return { url: 'firebase-finto:' + specifier.split('/').pop(), shortCircuit: true };
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith('firebase-finto:')) return { format: 'module', source: SORGENTE, shortCircuit: true };
  return next(url, context);
}
