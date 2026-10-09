// Prove delle email per le richieste di disponibilità per un evento (backend/Codice.gs): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { carica, j } = require('./gs.js');

const partita = { titolo: 'Roma-Lazio', tipo: 'partita', competizione: 'Serie A', round: '9', data: '2026-10-18', orario: '20:45', ritrovo: '16:45', fine: '22:45' };
const richiesta = (risposte) => ({ id: 'e1', destinatari: ['m', 'b'], messaggio: '', evento: partita, aperta: true, assegnato: '', risposte });

// risposte di Firestore con il gettone di chi chiama (supervisore o operatore "m")
const valoreREST = (v) => (Array.isArray(v) ? { arrayValue: { values: v.map(valoreREST) } }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valoreREST(x)])) } }
    : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) });
const docREST = (coll, o) => ({ name: 'projects/p/databases/(default)/documents/' + coll + '/' + o.id,
  fields: Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, valoreREST(v)])) });
const gettone = 'x.' + Buffer.from(JSON.stringify({ user_id: 'u1' })).toString('base64url') + '.y';
const firestoreFinto = (r) => (url) => {
  if (url.endsWith('invii?pageSize=1')) return { codice: 200, dati: {} };
  if (url.endsWith('/utenti/u1')) return { codice: 200, dati: docREST('utenti', { id: 'u1', operatoreId: 'm' }) };
  if (url.endsWith('/operatori/m')) return { codice: 200, dati: docREST('operatori', { id: 'm', nome: 'Marco Rossi', mansione: '' }) };
  if (url.endsWith('/richiesteEvento/e1') && r) return { codice: 200, dati: docREST('richiesteEvento', r) };
  return { codice: 403, dati: {} };
};
const NOTIFICHE = { EMAIL_SUPERVISORI: 's@x.it', EMAIL_ATTIVE: 'SI', URL_ADMIN: 'https://x.github.io/sito/admin.html#aggiornamenti' };

test('email di richiesta per evento', () => {
  const { gs } = carica();
  const m = gs.testoEmailRichiestaEvento({ nome: 'Marco Rossi', email: 'm@x.it' }, partita, 'Ci serve una mano', 'https://x.github.io/sito/');
  assert.equal(m.to, 'm@x.it');
  assert.equal(m.subject, 'Sei disponibile? Roma-Lazio · domenica 18 ottobre');
  ['Ciao Marco', 'Roma-Lazio', 'Serie A, giornata 9', 'domenica 18 ottobre', 'evento 20:45', 'ritrovo 16:45', 'fine 22:45', 'Ci serve una mano',
    'Rispondi sulla piattaforma', 'href="https://x.github.io/sito/"', 'Per entrare usa il tuo codice personale.'].forEach((t) => assert.ok(m.htmlBody.includes(t), t));
  const sup = gs.testoEmailRichiestaEvento({ nome: 'Marco', email: 'm@x.it' },
    { titolo: 'Supervisione', tipo: 'supervisione', competizione: 'Serie A', round: '', data: '2026-10-11', orario: '', ritrovo: '10:00', fine: '16:00' }, '', '');
  assert.equal(sup.subject, 'Sei disponibile? Turno di supervisione · domenica 11 ottobre');
  assert.ok(sup.htmlBody.includes('turno 10:00 – 16:00'));
  assert.ok(!sup.htmlBody.includes('Rispondi sulla piattaforma'));
  const strano = gs.testoEmailRichiestaEvento({ nome: 'Marco', email: 'm@x.it' }, Object.assign({}, partita, { titolo: '<b>A&B</b>' }), '"x" < y', '');
  assert.ok(strano.htmlBody.includes('&lt;b&gt;A&amp;B&lt;/b&gt;'));
  assert.ok(strano.htmlBody.includes('&quot;x&quot; &lt; y'));
});

test('richiesta per evento: solo supervisori, e chi non ha un\'email valida viene segnalato', () => {
  const t = carica({ risposte: firestoreFinto(null) });
  const r = j(t.gs.emailRichiestaEvento({
    idToken: 'supervisore', urlSito: 'https://x.github.io/sito/', evento: partita, messaggio: '',
    destinatari: [{ nome: 'Marco Rossi', email: 'm@x.it' }, { nome: 'Bruno Blu', email: 'x@' }],
  }));
  assert.deepEqual([r.email, r.nonInviate, r.quotaRestante], [1, ['Bruno Blu'], 90]);
  assert.deepEqual(t.email.map((m) => [m.to, m.name]), [['m@x.it', 'Disponibilità Ops · TGI Sport']]);
  const negato = carica({ risposte: () => ({ codice: 403, dati: {} }) });
  assert.throws(() => negato.gs.emailRichiestaEvento({ idToken: 'operatore', evento: partita, destinatari: [{ nome: 'M', email: 'm@x.it' }] }), /Accesso non consentito\./);
  assert.equal(negato.email.length, 0);
});

test('notifica di risposta sì ai supervisori', () => {
  const t = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto(richiesta({ m: { r: 'si', il: '2026-10-09T10:00:00Z' } })) });
  assert.deepEqual(j(t.gs.notificaRispostaEvento({ idToken: gettone, id: 'e1' })), { inviata: true });
  const m = t.email[0];
  assert.equal(m.to, 's@x.it');
  assert.equal(m.subject, 'Marco Rossi è disponibile per Roma-Lazio (domenica 18 ottobre)');
  ['<b>Marco Rossi</b> è disponibile per <b>Roma-Lazio</b> (domenica 18 ottobre)', 'ritrovo 16:45', 'Apri le convocazioni', 'href="https://x.github.io/sito/admin.html#convocazioni"']
    .forEach((x) => assert.ok(m.htmlBody.includes(x), x));
});

test('notifica di risposta: niente email per i no, senza risposta o con le notifiche spente', () => {
  const no = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto(richiesta({ m: { r: 'no', il: '2026-10-09T10:00:00Z' } })) });
  assert.deepEqual(j(no.gs.notificaRispostaEvento({ idToken: gettone, id: 'e1' })), { inviata: false });
  const nessuna = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto(richiesta({ b: { r: 'si', il: '2026-10-09T10:00:00Z' } })) });
  assert.deepEqual(j(nessuna.gs.notificaRispostaEvento({ idToken: gettone, id: 'e1' })), { inviata: false });
  const spente = carica({ proprieta: Object.assign({}, NOTIFICHE, { EMAIL_ATTIVE: 'NO' }), risposte: firestoreFinto(richiesta({ m: { r: 'si', il: '2026-10-09T10:00:00Z' } })) });
  assert.deepEqual(j(spente.gs.notificaRispostaEvento({ idToken: gettone, id: 'e1' })), { inviata: false });
  const altra = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto(null) });
  assert.throws(() => altra.gs.notificaRispostaEvento({ idToken: gettone, id: 'e1' }), /Accesso non consentito\./);
  assert.equal(no.email.length + nessuna.email.length + spente.email.length + altra.email.length, 0);
});
