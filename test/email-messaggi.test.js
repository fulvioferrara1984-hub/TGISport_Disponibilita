// Prove delle email dei messaggi tra operatori e supervisori (backend/Codice.gs): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { carica, j } = require('./gs.js');

// documenti di Firestore nel formato REST; gettone dell'operatore "m" (Marco Rossi)
const valoreREST = (v) => (Array.isArray(v) ? { arrayValue: { values: v.map(valoreREST) } }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valoreREST(x)])) } }
    : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) });
const docREST = (coll, o) => ({ name: 'projects/p/databases/(default)/documents/' + coll + '/' + o.id,
  fields: Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, valoreREST(v)])) });
const gettone = 'x.' + Buffer.from(JSON.stringify({ user_id: 'u1' })).toString('base64url') + '.y';
const firestoreFinto = (documenti) => (url) => {
  if (url.endsWith('invii?pageSize=1')) return { codice: 200, dati: {} };
  if (url.endsWith('/utenti/u1')) return { codice: 200, dati: docREST('utenti', { id: 'u1', operatoreId: 'm' }) };
  if (url.endsWith('/operatori/m')) return { codice: 200, dati: docREST('operatori', { id: 'm', nome: 'Marco Rossi', mansione: '' }) };
  for (const [percorso, o] of Object.entries(documenti)) if (url.endsWith('/' + percorso)) return { codice: 200, dati: docREST(percorso.split('/')[0], o) };
  return { codice: 403, dati: {} };
};
const NOTIFICHE = { EMAIL_SUPERVISORI: 's@x.it', EMAIL_ATTIVE: 'SI', URL_ADMIN: 'https://x.github.io/sito/admin.html#convocazioni' };
const messaggio = (campi) => Object.assign({ id: 'msg1', operatoreId: 'm', tipo: 'evento', rif: 'e1', da: 'operatore', autore: 'Marco Rossi',
  testo: 'Porto il PC?', quando: '2026-10-21T16:05:00.000Z', letto: false }, campi);
const partita = { id: 'e1', tipo: 'partita', titolo: 'Roma-Lazio', data: '2026-10-18' };
const deployment = { id: 'd1', luogo: 'Roma', titolo: 'Six Nations', da: '2026-11-12', a: '2026-11-13' };

test('notificaMessaggio: email ai supervisori con il testo', () => {
  const t = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto({ 'messaggi/msg1': messaggio({ testo: 'Porto il PC?\nE il mouse?' }), 'eventi/e1': partita }) });
  assert.deepEqual(j(t.gs.notificaMessaggio({ idToken: gettone, id: 'msg1' })), { inviata: true });
  const m = t.email[0];
  assert.equal(m.to, 's@x.it');
  assert.equal(m.subject, 'Messaggio da Marco Rossi · Roma-Lazio');
  ['Marco Rossi', 'Roma-Lazio', 'domenica 18 ottobre', 'Porto il PC?<br>E il mouse?', 'Rispondi sulla piattaforma',
    'href="https://x.github.io/sito/admin.html#aggiornamenti"'].forEach((x) => assert.ok(m.htmlBody.includes(x), x));
  // turno remoto: il nome del turno
  const turno = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto({ 'messaggi/msg1': messaggio(), 'eventi/e1': { id: 'e1', tipo: 'supervisione', titolo: 'Supervisione', data: '2026-10-18' } }) });
  turno.gs.notificaMessaggio({ idToken: gettone, id: 'msg1' });
  assert.equal(turno.email[0].subject, 'Messaggio da Marco Rossi · Turno Remote TL');
  // evento non leggibile: il messaggio arriva lo stesso
  const senza = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto({ 'messaggi/msg1': messaggio() }) });
  senza.gs.notificaMessaggio({ idToken: gettone, id: 'msg1' });
  assert.equal(senza.email[0].subject, 'Messaggio da Marco Rossi · una convocazione');
});

test('notificaMessaggio: email spente, senza indirizzo, messaggio di un altro', () => {
  const doc = { 'messaggi/msg1': messaggio(), 'eventi/e1': partita };
  const spente = carica({ proprieta: Object.assign({}, NOTIFICHE, { EMAIL_ATTIVE: 'NO' }), risposte: firestoreFinto(doc) });
  assert.deepEqual(j(spente.gs.notificaMessaggio({ idToken: gettone, id: 'msg1' })), { inviata: false });
  const senzaIndirizzo = carica({ proprieta: Object.assign({}, NOTIFICHE, { EMAIL_SUPERVISORI: '' }), risposte: firestoreFinto(doc) });
  assert.deepEqual(j(senzaIndirizzo.gs.notificaMessaggio({ idToken: gettone, id: 'msg1' })), { inviata: false });
  const altro = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto({ 'messaggi/msg1': messaggio({ operatoreId: 'b' }), 'eventi/e1': partita }) });
  assert.throws(() => altro.gs.notificaMessaggio({ idToken: gettone, id: 'msg1' }), /Accesso non consentito\./);
  const delSupervisore = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto({ 'messaggi/msg1': messaggio({ da: 'supervisore' }), 'eventi/e1': partita }) });
  assert.throws(() => delSupervisore.gs.notificaMessaggio({ idToken: gettone, id: 'msg1' }), /Accesso non consentito\./);
  const mancante = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto({}) });
  assert.throws(() => mancante.gs.notificaMessaggio({ idToken: gettone, id: 'msg1' }), /Accesso non consentito\./);
  assert.equal(spente.email.length + senzaIndirizzo.email.length + altro.email.length + delSupervisore.email.length + mancante.email.length, 0);
});

test('notificaMessaggio su un on-site', () => {
  const t = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto({ 'messaggi/msg1': messaggio({ tipo: 'onsite', rif: 'd1', testo: 'Hotel?' }), 'onsite/d1': deployment }) });
  t.gs.notificaMessaggio({ idToken: gettone, id: 'msg1' });
  assert.equal(t.email[0].subject, 'Messaggio da Marco Rossi · On-site Roma · Six Nations');
  assert.ok(t.email[0].htmlBody.includes('dal 12 al 13 novembre'));
  assert.ok(t.email[0].htmlBody.includes('Hotel?'));
});

test('emailMessaggio: email all\'operatore', () => {
  const doc = { 'messaggi/msg2': messaggio({ id: 'msg2', da: 'supervisore', autore: 'Giulia', testo: 'Sì, portalo' }), 'eventi/e1': partita };
  const t = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto(doc) });
  assert.deepEqual(j(t.gs.emailMessaggio({ idToken: gettone, id: 'msg2', email: 'm@x.it', nome: 'Marco Rossi', urlSito: 'https://x.github.io/sito/' })), { inviata: true });
  const m = t.email[0];
  assert.equal(m.to, 'm@x.it');
  assert.equal(m.subject, 'Nuovo messaggio dai supervisori · Roma-Lazio');
  ['Ciao Marco,', 'Giulia', 'ti ha scritto su', 'Roma-Lazio', 'domenica 18 ottobre', 'Sì, portalo', 'Rispondi sulla piattaforma',
    'href="https://x.github.io/sito/"', 'Per entrare usa il tuo codice personale.'].forEach((x) => assert.ok(m.htmlBody.includes(x), x));
  // un messaggio dell'operatore non si rimanda all'operatore
  const suo = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto({ 'messaggi/msg1': messaggio(), 'eventi/e1': partita }) });
  assert.throws(() => suo.gs.emailMessaggio({ idToken: gettone, id: 'msg1', email: 'm@x.it', nome: 'Marco' }), /Accesso non consentito\./);
  assert.equal(suo.email.length, 0);
});

test('emailMessaggio: indirizzo mancante', () => {
  const doc = { 'messaggi/msg2': messaggio({ id: 'msg2', da: 'supervisore', autore: 'Giulia' }), 'eventi/e1': partita };
  const t = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto(doc) });
  assert.deepEqual(j(t.gs.emailMessaggio({ idToken: gettone, id: 'msg2', email: '', nome: 'Marco' })), { inviata: false });
  assert.deepEqual(j(t.gs.emailMessaggio({ idToken: gettone, id: 'msg2', email: 'non-valida', nome: 'Marco' })), { inviata: false });
  assert.equal(t.email.length, 0);
});

test('emailMessaggio: testo con caratteri HTML', () => {
  const doc = { 'messaggi/msg2': messaggio({ id: 'msg2', da: 'supervisore', autore: 'Giulia <b>', testo: '<script>alert(1)</script>\nciao & "basta"' }), 'eventi/e1': partita };
  const t = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto(doc) });
  t.gs.emailMessaggio({ idToken: gettone, id: 'msg2', email: 'm@x.it', nome: 'Marco', urlSito: 'javascript:alert(1)' });
  const corpo = t.email[0].htmlBody;
  assert.ok(corpo.includes('&lt;script&gt;alert(1)&lt;/script&gt;<br>ciao &amp; &quot;basta&quot;'), corpo);
  assert.ok(corpo.includes('Giulia &lt;b&gt;'));
  assert.ok(!corpo.includes('<script>'));
  assert.ok(!corpo.includes('javascript:'));   // un indirizzo del sito non https non diventa un tasto
});
