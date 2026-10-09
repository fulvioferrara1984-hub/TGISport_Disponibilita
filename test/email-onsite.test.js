// Prove delle email on-site dello script di Google (backend/Codice.gs): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { carica, j } = require('./gs.js');

const dep = (campi) => Object.assign({
  id: 'd1', titolo: 'Sei Nazioni', luogo: 'Roma', sport: 'Rugby', note: 'Hotel vicino allo stadio', stato: 'aperta', da: '2026-10-12', a: '2026-10-15',
  giorni: [{ data: '2026-10-12', attivita: 'Travel Day', partita: '' }, { data: '2026-10-13', attivita: 'MD-1', partita: '' },
    { data: '2026-10-14', attivita: 'MD', partita: 'Italia-Francia' }, { data: '2026-10-15', attivita: 'Travel Day', partita: '' }],
  posti: { TL: 1, OP: 2 }, accettatiTL: ['m'], accettatiOP: ['b', 'c'], rifiuti: [], esclusi: [], destinatari: ['m', 'b', 'c'],
}, campi);

// risposte di Firestore con il gettone di chi chiama (supervisore o operatore "m")
const valoreREST = (v) => (Array.isArray(v) ? { arrayValue: { values: v.map(valoreREST) } }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valoreREST(x)])) } }
    : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) });
const docREST = (coll, o) => ({ name: 'projects/p/databases/(default)/documents/' + coll + '/' + o.id,
  fields: Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, valoreREST(v)])) });
const gettone = 'x.' + Buffer.from(JSON.stringify({ user_id: 'u1' })).toString('base64url') + '.y';
const firestoreFinto = (d) => (url) => {
  if (url.endsWith('invii?pageSize=1')) return { codice: 200, dati: {} };
  if (url.endsWith('/utenti/u1')) return { codice: 200, dati: docREST('utenti', { id: 'u1', operatoreId: 'm' }) };
  if (url.endsWith('/operatori/m')) return { codice: 200, dati: docREST('operatori', { id: 'm', nome: 'Marco Rossi', mansione: '' }) };
  if (url.endsWith('/onsite/d1')) return { codice: 200, dati: docREST('onsite', d) };
  return { codice: 403, dati: {} };
};
const NOTIFICHE = { EMAIL_SUPERVISORI: 's@x.it', EMAIL_ATTIVE: 'SI', URL_ADMIN: 'https://x.github.io/sito/admin.html#aggiornamenti' };

test('email di richiesta on-site', () => {
  const { gs } = carica();
  const m = gs.testoEmailOnsite({ nome: 'Marco Rossi', email: 'm@x.it', ruolo: 'TL' }, dep(), 'https://x.github.io/sito/');
  assert.equal(m.to, 'm@x.it');
  assert.equal(m.subject, 'Richiesta on-site: Roma · 12–15 ottobre');
  ['Ciao Marco', 'lunedì 12 ottobre', 'Travel Day', 'MD · Italia-Francia', 'Roma', 'Rugby', 'Sei Nazioni', 'on-site TL', 'Hotel vicino allo stadio',
    'Rispondi sulla piattaforma', 'href="https://x.github.io/sito/"', 'Per entrare usa il tuo codice personale.'].forEach((t) => assert.ok(m.htmlBody.includes(t), t));
  assert.equal(/€|compens/i.test(m.subject + m.htmlBody), false);
  const strano = gs.testoEmailOnsite({ nome: 'Marco', email: 'm@x.it', ruolo: 'OP' }, dep({ titolo: '<b>A&B</b>', note: '"x" < y' }), '');
  assert.ok(strano.htmlBody.includes('&lt;b&gt;A&amp;B&lt;/b&gt;'));
  assert.ok(strano.htmlBody.includes('&quot;x&quot; &lt; y'));
  assert.ok(!strano.htmlBody.includes('Rispondi sulla piattaforma'));
});

test('richiesta on-site: chi non ha un\'email valida viene segnalato', () => {
  const t = carica({ risposte: firestoreFinto(dep()) });
  const r = j(t.gs.emailOnsite({
    idToken: 'supervisore', urlSito: 'https://x.github.io/sito/', deployment: dep(),
    destinatari: [{ nome: 'Marco Rossi', email: 'm@x.it', ruolo: 'TL' }, { nome: 'Bruno Blu', email: 'x@', ruolo: 'OP' }],
  }));
  assert.deepEqual([r.email, r.nonInviate], [1, ['Bruno Blu']]);
  assert.deepEqual(t.email.map((m) => [m.to, m.name]), [['m@x.it', 'Disponibilità Ops · TGI Sport']]);
});

test('notifica di accettazione ai supervisori', () => {
  const t = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto(dep()) });
  assert.deepEqual(j(t.gs.notificaOnsite({ idToken: gettone, id: 'd1' })), { inviata: true });
  const m = t.email[0];
  assert.equal(m.to, 's@x.it');
  assert.equal(m.subject, 'On-site accettato: Marco Rossi · Roma 12–15 ottobre');
  ['Marco Rossi', 'on-site TL', 'TL 1/1 · OP 2/2 · completo', 'Apri le convocazioni', 'href="https://x.github.io/sito/admin.html#convocazioni"']
    .forEach((x) => assert.ok(m.htmlBody.includes(x), x));
  assert.equal(/€|compens/i.test(m.htmlBody), false);
});

test('notifica di accettazione: solo chi ha davvero accettato, solo con le notifiche attive', () => {
  const estraneo = carica({ proprieta: NOTIFICHE, risposte: firestoreFinto(dep({ accettatiTL: [] })) });
  assert.throws(() => estraneo.gs.notificaOnsite({ idToken: gettone, id: 'd1' }), /Accesso non consentito\./);
  assert.equal(estraneo.email.length, 0);
  const spente = carica({ proprieta: Object.assign({}, NOTIFICHE, { EMAIL_ATTIVE: 'NO' }), risposte: firestoreFinto(dep()) });
  assert.deepEqual(j(spente.gs.notificaOnsite({ idToken: gettone, id: 'd1' })), { inviata: false });
  assert.equal(spente.email.length, 0);
});

test('periodo breve ed etichetta dei posti dello script', () => {
  const { gs } = carica();
  assert.equal(gs.periodoBreve('2026-10-12', '2026-10-12'), '12 ottobre');
  assert.equal(gs.periodoBreve('2026-10-12', '2026-10-15'), '12–15 ottobre');
  assert.equal(gs.periodoBreve('2026-10-30', '2026-11-02'), '30 ottobre – 2 novembre');
  assert.equal(gs.etichettaPosti(dep({ accettatiOP: ['b'] })), 'TL 1/1 · OP 1/2');
  assert.equal(gs.etichettaPosti(dep({ posti: { TL: 0, OP: 2 }, accettatiTL: [], accettatiOP: ['b'] })), 'OP 1/2');
});
