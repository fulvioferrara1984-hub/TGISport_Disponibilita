// Prove dei promemoria automatici (backend/Codice.gs): node --test test/*.test.js
// Lo script di Google gira qui dentro un contesto vm, con le funzioni di Google simulate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODICE = fs.readFileSync(path.join(__dirname, '../backend/Codice.gs'), 'utf8');

// Utilities.formatDate di Google, per i soli formati usati dallo script
function formatta(data, fuso, formato) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data).map((x) => [x.type, x.value]));
  return formato.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
}

// stub: { proprieta: {}, risposte: (url, opzioni) => ({ codice, dati }), erroreEmail: (email) => boolean, attivatori: [nomi funzione] }
function carica(stub = {}) {
  const prop = new Map(Object.entries(stub.proprieta || {}));
  const email = [], chiamate = [], registro = [];
  const attivatori = (stub.attivatori || []).map((nome) => ({ getHandlerFunction: () => nome }));
  const creati = [], tolti = [];
  const catena = (nome) => {
    const c = { impostazioni: {} };
    ['timeBased', 'everyDays', 'atHour', 'inTimezone'].forEach((m) => { c[m] = (v) => { c.impostazioni[m] = v === undefined ? true : v; return c; }; });
    c.create = () => { const t = { getHandlerFunction: () => nome, impostazioni: c.impostazioni }; creati.push(t); attivatori.push(t); return t; };
    return c;
  };
  const gs = {
    console: { log: (...a) => registro.push(a.join(' ')), error: (...a) => registro.push(a.join(' ')) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => Object.fromEntries(prop),
        getProperty: (k) => (prop.has(k) ? prop.get(k) : null),
        setProperty: (k, v) => { prop.set(k, String(v)); },
        setProperties: (o) => { Object.entries(o).forEach(([k, v]) => prop.set(k, String(v))); },
        deleteProperty: (k) => { prop.delete(k); },
      }),
    },
    MailApp: {
      sendEmail: (m) => { if (stub.erroreEmail && stub.erroreEmail(m)) throw new Error('Invio non riuscito'); email.push(m); },
      getRemainingDailyQuota: () => 90,
    },
    UrlFetchApp: {
      fetch: (url, opzioni = {}) => {
        chiamate.push({ url, opzioni });
        const r = (stub.risposte || (() => ({ codice: 404, dati: {} })))(url, opzioni);
        return { getResponseCode: () => r.codice, getContentText: () => JSON.stringify(r.dati) };
      },
    },
    ScriptApp: {
      getOAuthToken: () => 'gettone-prova',
      getProjectTriggers: () => attivatori.slice(),
      deleteTrigger: (t) => { tolti.push(t); attivatori.splice(attivatori.indexOf(t), 1); },
      newTrigger: (nome) => catena(nome),
    },
    Utilities: { formatDate: formatta },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  };
  vm.createContext(gs);
  vm.runInContext(CODICE, gs);
  return { gs, prop, email, chiamate, registro, attivatori, creati, tolti };
}

// gli oggetti creati nel contesto vm hanno prototipi diversi: si confrontano dopo un passaggio in JSON
const j = (x) => JSON.parse(JSON.stringify(x));

const OGGI = '2026-10-09';
const OPS = [
  { id: 'a', nome: 'Anna Neri', email: 'anna@x.it' },
  { id: 'b', nome: 'Bruno Blu', email: '' },
  { id: 'c', nome: 'Carla Verdi', email: 'carla@x.it', attivo: false },
];
let progressivo = 0;
const ev = (campi) => Object.assign({
  id: 'e' + (++progressivo), tipo: 'partita', competizione: 'Serie A', titolo: 'Partita ' + progressivo,
  data: '2026-10-10', orario: '20:45', operatoreId: 'a', stato: 'convocato',
}, campi);
const { gs } = carica();
const sel = (eventi, ops = OPS) => j(gs.selezionaPromemoria(eventi, ops, OGGI, 3));
const titoli = (righe) => righe.map((r) => r.evento.titolo);

// ---------------------------------------------------------------- selezione

test('finestra: oggi e oggi + X inclusi, dopo e passati esclusi', () => {
  const r = sel([ev({ data: '2026-10-08', titolo: '08' }), ev({ data: '2026-10-09', titolo: '09' }), ev({ data: '2026-10-12', titolo: '12' }), ev({ data: '2026-10-13', titolo: '13' })]);
  assert.deepEqual(titoli(r.gruppi.inAttesa), ['09', '12']);
});

test('solo remoti e non annullati', () => {
  const r = sel([
    ev({ tipo: 'onsite', titolo: 'on-site' }),
    ev({ tipo: undefined, titolo: 'senza tipo' }),
    ev({ tipo: 'supervisione', titolo: 'supervisione', orario: '', convocazione: '10:00' }),
    ev({ stato: 'annullato', titolo: 'annullata' }),
  ]);
  assert.deepEqual(titoli(r.gruppi.inAttesa), ['supervisione', 'senza tipo']);
});

test('un solo gruppo per evento', () => {
  const r = sel([
    ev({ titolo: 'da sostituire', stato: 'confermato', daSostituire: true }),
    ev({ titolo: 'rifiutata', stato: 'rifiutato' }),
    ev({ titolo: 'libera', stato: 'da-assegnare', operatoreId: '' }),
    ev({ titolo: 'da inviare', stato: 'assegnato' }),
    ev({ titolo: 'in attesa', stato: 'convocato' }),
    ev({ titolo: 'confermata', stato: 'confermato' }),
  ]);
  const perGruppo = Object.fromEntries(Object.entries(r.gruppi).map(([k, v]) => [k, titoli(v)]));
  assert.deepEqual(perGruppo, { sostituire: ['da sostituire', 'rifiutata'], senzaOperatore: ['libera'], daInviare: ['da inviare'], inAttesa: ['in attesa'] });
});

test('operatore eliminato conta come senza operatore', () => {
  const r = sel([ev({ titolo: 'orfana', operatoreId: 'zzz' })]);
  assert.deepEqual(titoli(r.gruppi.senzaOperatore), ['orfana']);
  assert.deepEqual(r.gruppi.inAttesa, []);
  assert.deepEqual(r.operatori, []);
});

test('una sola email per operatore, eventi in ordine', () => {
  const r = sel([ev({ titolo: 'dopo', data: '2026-10-11', orario: '18:00' }), ev({ titolo: 'prima', data: '2026-10-10', orario: '20:45' })]);
  assert.equal(r.operatori.length, 1);
  assert.deepEqual([r.operatori[0].id, r.operatori[0].nome, r.operatori[0].email], ['a', 'Anna Neri', 'anna@x.it']);
  assert.deepEqual(r.operatori[0].eventi.map((e) => e.titolo), ['prima', 'dopo']);
  assert.deepEqual(titoli(r.gruppi.inAttesa), ['prima', 'dopo']);
});

test('senza email o disattivati: segnalati e non avvisati', () => {
  const ops = OPS.concat([{ id: 'd', nome: 'Dario Rosa', email: 'x@' }]);
  const r = sel([ev({ titolo: 'b', operatoreId: 'b' }), ev({ titolo: 'c', operatoreId: 'c' }), ev({ titolo: 'd', operatoreId: 'd' }), ev({ titolo: 'a', operatoreId: 'a' })], ops);
  assert.deepEqual(r.gruppi.inAttesa.map((x) => [x.evento.titolo, x.nota]), [['b', '(senza email)'], ['c', '(disattivato)'], ['d', '(senza email)'], ['a', '']]);
  assert.equal(r.gruppi.inAttesa[3].operatore.nome, 'Anna Neri');
  assert.deepEqual(r.operatori.map((o) => o.id), ['a']);
});

test('daFirestore: tutti i tipi di valore', () => {
  const doc = {
    name: 'projects/p/databases/(default)/documents/eventi/abc',
    fields: {
      data: { stringValue: '2026-10-10' }, inviata: { booleanValue: true }, n: { integerValue: '3' }, d: { doubleValue: 2.5 },
      x: { nullValue: null }, t: { timestampValue: '2026-10-09T08:00:00Z' },
      m: { mapValue: { fields: { a: { stringValue: 'b' } } } }, mVuota: { mapValue: {} },
      l: { arrayValue: { values: [{ stringValue: 'z' }, { integerValue: '1' }] } }, lVuota: { arrayValue: {} },
    },
  };
  assert.deepEqual(j(gs.daFirestore(doc)), {
    id: 'abc', data: '2026-10-10', inviata: true, n: 3, d: 2.5, x: null, t: '2026-10-09T08:00:00Z', m: { a: 'b' }, mVuota: {}, l: ['z', 1], lVuota: [],
  });
});

test('aggiungiGiorni attraversa mesi e cambio d\'ora', () => {
  assert.equal(gs.aggiungiGiorni('2026-10-30', 3), '2026-11-02');
  assert.equal(gs.aggiungiGiorni('2026-03-28', 2), '2026-03-30');
});

// ---------------------------------------------------------------- email

const sassuolo = (campi) => ev(Object.assign({
  titolo: 'Sassuolo-Lazio', round: '9', data: '2026-10-10', orario: '18:30', convocazioneCalcolata: '14:30', fineCalcolata: '20:30',
}, campi));
const marco = { id: 'm', nome: 'Marco Rossi', email: 'm@x.it' };
const CTX_OP = { oggi: OGGI, telefono: '+39 333', sito: 'https://x.github.io/sito/' };

test('oggetto operatore al singolare e al plurale', () => {
  assert.equal(gs.emailOperatore(marco, [sassuolo({ data: '2026-10-11' })], CTX_OP).subject, 'Promemoria: conferma la convocazione di domenica 11 ottobre');
  const due = gs.emailOperatore(marco, [sassuolo(), sassuolo({ data: '2026-10-11' })], CTX_OP);
  assert.equal(due.subject, 'Promemoria: 2 convocazioni da confermare');
  assert.ok(due.htmlBody.includes('queste convocazioni aspettano ancora la tua conferma'));
});

test('email operatore', () => {
  const m = gs.emailOperatore(marco, [sassuolo()], CTX_OP);
  assert.equal(m.to, 'm@x.it');
  ['Ciao Marco', 'questa convocazione aspetta ancora la tua conferma', '(domani)', 'Sassuolo-Lazio', 'Serie A · 9', 'evento 18:30',
    'ritrovo <b>14:30</b>', 'fine <b>20:30</b>', 'Conferma sulla piattaforma', 'href="https://x.github.io/sito/"',
    'chiama il supervisore al <b>+39 333</b>', 'Per entrare usa il tuo codice personale.'].forEach((t) => assert.ok(m.htmlBody.includes(t), t));
  assert.ok(!gs.emailOperatore(marco, [sassuolo()], Object.assign({}, CTX_OP, { telefono: '' })).htmlBody.includes('chiama'));
  assert.ok(!gs.emailOperatore(marco, [sassuolo()], Object.assign({}, CTX_OP, { sito: '' })).htmlBody.includes('Conferma sulla piattaforma'));
  assert.ok(gs.emailOperatore(marco, [sassuolo({ data: OGGI })], CTX_OP).htmlBody.includes('(oggi)'));
});

test('supervisione nell\'email operatore', () => {
  const m = gs.emailOperatore(marco, [ev({ tipo: 'supervisione', titolo: 'Supervisione', orario: '', convocazione: '10:00' })], CTX_OP);
  assert.ok(m.htmlBody.includes('inizio turno <b>10:00</b>'));
  assert.ok(!m.htmlBody.includes('fine'));
});

test('caratteri HTML resi come testo', () => {
  const e = sassuolo({ titolo: '<b>A&B</b>' });
  assert.ok(gs.emailOperatore(marco, [e], CTX_OP).htmlBody.includes('&lt;b&gt;A&amp;B&lt;/b&gt;'));
  const gruppi = { sostituire: [], senzaOperatore: [{ evento: e, operatore: null, nota: '' }], daInviare: [], inAttesa: [] };
  const s = gs.emailSupervisori(gruppi, { oggi: OGGI, giorni: 3, a: 's@x.it', convocazioni: '' });
  assert.ok(s.htmlBody.includes('&lt;b&gt;A&amp;B&lt;/b&gt;'));
  assert.ok(!s.htmlBody.includes('<b>A&B</b>'));
});

const righe = (n, campi) => Array.from({ length: n }, () => ({ evento: sassuolo(campi), operatore: OPS[0], nota: '' }));
const CTX_SUP = { oggi: OGGI, giorni: 3, a: 's1@x.it,s2@x.it', convocazioni: 'https://x.github.io/sito/admin.html#convocazioni' };

test('oggetto supervisori', () => {
  const vuoti = { sostituire: [], senzaOperatore: [], daInviare: [], inAttesa: [] };
  const oggetto = (g, ctx = CTX_SUP) => gs.emailSupervisori(Object.assign({}, vuoti, g), ctx).subject;
  assert.equal(oggetto({ senzaOperatore: righe(2), inAttesa: righe(3) }), 'Promemoria convocazioni · prossimi 3 giorni: 2 senza operatore, 3 in attesa');
  assert.equal(oggetto({ sostituire: righe(1), senzaOperatore: righe(1), daInviare: righe(1), inAttesa: righe(1) }),
    'Promemoria convocazioni · prossimi 3 giorni: 1 da sostituire, 1 senza operatore, 1 da inviare, 1 in attesa');
  assert.equal(oggetto({ inAttesa: righe(1) }, Object.assign({}, CTX_SUP, { giorni: 1 })), 'Promemoria convocazioni · oggi e domani: 1 in attesa');
});

test('riepilogo supervisori', () => {
  const gruppi = {
    sostituire: righe(1, { titolo: 'Rinuncia' }),
    senzaOperatore: [{ evento: sassuolo({ titolo: 'Libera', operatoreId: '' }), operatore: null, nota: '' }],
    daInviare: [],
    inAttesa: [{ evento: sassuolo({ titolo: 'Attesa' }), operatore: OPS[1], nota: '(senza email)' }],
  };
  const s = gs.emailSupervisori(gruppi, CTX_SUP);
  assert.equal(s.to, 's1@x.it,s2@x.it');
  const posizione = (t) => s.htmlBody.indexOf(t);
  assert.ok(posizione('Rifiutate o da sostituire (1)') >= 0);
  assert.ok(posizione('Senza operatore (1)') > posizione('Rifiutate o da sostituire (1)'));
  assert.ok(posizione('In attesa di risposta (1)') > posizione('Senza operatore (1)'));
  assert.equal(posizione('Assegnate ma non inviate'), -1);
  assert.ok(s.htmlBody.includes('Bruno Blu (senza email)'));
  assert.ok(s.htmlBody.includes('Anna Neri'));
  assert.ok(s.htmlBody.includes('Apri le convocazioni'));
  assert.ok(s.htmlBody.includes('href="https://x.github.io/sito/admin.html#convocazioni"'));
});

test('indirizzi dei link ricavati dalla dashboard', () => {
  assert.deepEqual(j(gs.indirizzi('https://x.github.io/TGISport_Disponibilita/admin.html#aggiornamenti')), {
    convocazioni: 'https://x.github.io/TGISport_Disponibilita/admin.html#convocazioni', sito: 'https://x.github.io/TGISport_Disponibilita/',
  });
  assert.deepEqual(j(gs.indirizzi('')), { convocazioni: '', sito: '' });
  assert.deepEqual(j(gs.indirizzi('javascript:alert(1)')), { convocazioni: '', sito: '' });
});
