// Prove dei promemoria automatici (backend/Codice.gs): node --test test/*.test.js
// Lo script di Google gira qui dentro un contesto vm, con le funzioni di Google simulate.
const test = require('node:test');
const assert = require('node:assert/strict');

const { carica, j, formatta } = require('./gs.js');

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

// ---------------------------------------------------------------- giro giornaliero

// Firestore simulato: risponde come l'API REST a runQuery, elenco operatori e impostazioni/operativo
const valoreREST = (v) => (v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) });
const docREST = (coll, o) => ({
  name: 'projects/tgi-availability/databases/(default)/documents/' + coll + '/' + o.id,
  fields: Object.fromEntries(Object.entries(o).filter(([k, v]) => k !== 'id' && v !== undefined).map(([k, v]) => [k, valoreREST(v)])),
});
function firestoreFinto({ eventi = [], operatori = OPS, telefono = '+39 333', codiceQuery = 200, rispostaQuery = null, erroreQuery = null } = {}) {
  return (url) => {
    if (url.endsWith(':runQuery')) {
      if (codiceQuery !== 200) return { codice: codiceQuery, dati: erroreQuery || { error: { status: 'PERMISSION_DENIED' } } };
      return { codice: 200, dati: rispostaQuery || (eventi.length ? eventi.map((e) => ({ document: docREST('eventi', e), readTime: 't' })) : [{ readTime: 't' }]) };
    }
    if (/\/operatori\?/.test(url)) return { codice: 200, dati: { documents: operatori.map((o) => docREST('operatori', o)) } };
    if (url.endsWith('/impostazioni/operativo')) return telefono === null ? { codice: 404, dati: {} } : { codice: 200, dati: docREST('impostazioni', { id: 'operativo', telefono, giorniBlocco: 3 }) };
    return { codice: 404, dati: {} };
  };
}
const ADESSO = new Date('2026-10-09T07:10:00Z');   // le 9:10 a Roma
const ATTIVI = { PROMEMORIA_ATTIVI: 'SI', PROMEMORIA_GIORNI: '3', EMAIL_SUPERVISORI: 's@x.it', URL_ADMIN: 'https://x.github.io/sito/admin.html#aggiornamenti' };
const ultimo = (t) => (t.prop.has('ULTIMO_PROMEMORIA') ? JSON.parse(t.prop.get('ULTIMO_PROMEMORIA')) : null);
const query = (t) => t.chiamate.find((c) => c.url.endsWith(':runQuery'));
const intervallo = (t) => JSON.parse(query(t).opzioni.payload).structuredQuery.where.compositeFilter.filters.map((f) => [f.fieldFilter.field.fieldPath, f.fieldFilter.op, f.fieldFilter.value.stringValue]);

test('spenti: nessuna lettura e nessuna email', () => {
  const t = carica({ risposte: firestoreFinto({ eventi: [ev({})] }) });
  assert.equal(t.gs.giroPromemoria(ADESSO).saltato, 'spenti');
  assert.equal(t.chiamate.length, 0);
  assert.equal(t.email.length, 0);
});

test('giro completo: email a operatori e riepilogo, esito salvato', () => {
  const t = carica({ proprieta: ATTIVI, risposte: firestoreFinto({ eventi: [ev({ titolo: 'Attesa' }), ev({ titolo: 'Libera', operatoreId: '', stato: 'da-assegnare', data: '2026-10-11' })] }) });
  const r = j(t.gs.giroPromemoria(ADESSO));
  assert.deepEqual(t.email.map((m) => m.to), ['anna@x.it', 's@x.it']);
  assert.equal(t.email[0].name, 'Disponibilità Ops · TGI Sport');
  assert.ok(t.email[0].htmlBody.includes('href="https://x.github.io/sito/"'));
  assert.ok(t.email[0].htmlBody.includes('+39 333'));
  assert.ok(t.email[1].htmlBody.includes('href="https://x.github.io/sito/admin.html#convocazioni"'));
  assert.deepEqual([r.oggi, r.riepilogo, r.operatori], ['2026-10-09', true, 1]);
  assert.deepEqual(ultimo(t), { giorno: '2026-10-09', quando: ADESSO.toISOString(), riepilogo: true, operatori: 1, nonInviate: 0, inSospeso: 2 });
  const q = query(t);
  assert.equal(q.opzioni.method, 'post');
  assert.equal(q.opzioni.headers.Authorization, 'Bearer gettone-prova');
  assert.equal(q.opzioni.headers['x-goog-user-project'], 'tgi-availability');
  assert.deepEqual(intervallo(t), [['data', 'GREATER_THAN_OR_EQUAL', '2026-10-09'], ['data', 'LESS_THAN_OR_EQUAL', '2026-10-12']]);
});

test('niente in sospeso: nessuna email, giro registrato', () => {
  const t = carica({ proprieta: ATTIVI, risposte: firestoreFinto({ eventi: [ev({ stato: 'confermato' })] }) });
  t.gs.giroPromemoria(ADESSO);
  assert.equal(t.email.length, 0);
  assert.deepEqual(ultimo(t), { giorno: '2026-10-09', quando: ADESSO.toISOString(), riepilogo: false, operatori: 0, nonInviate: 0, inSospeso: 0 });
});

test('secondo giro nello stesso giorno non spedisce', () => {
  const t = carica({ proprieta: ATTIVI, risposte: firestoreFinto({ eventi: [ev({})] }) });
  t.gs.giroPromemoria(ADESSO);
  const email = t.email.length, letture = t.chiamate.length;
  assert.equal(t.gs.giroPromemoria(new Date('2026-10-09T15:00:00Z')).saltato, 'già fatto');
  assert.equal(t.email.length, email);
  assert.equal(t.chiamate.length, letture);
  t.gs.giroPromemoria(new Date('2026-10-10T07:00:00Z'));
  assert.ok(t.email.length > email);
});

test('senza indirizzi supervisori: solo agli operatori', () => {
  const t = carica({ proprieta: Object.assign({}, ATTIVI, { EMAIL_SUPERVISORI: '' }), risposte: firestoreFinto({ eventi: [ev({}), ev({ operatoreId: '', stato: 'da-assegnare' })] }) });
  const r = t.gs.giroPromemoria(ADESSO);
  assert.deepEqual(t.email.map((m) => m.to), ['anna@x.it']);
  assert.equal(r.riepilogo, false);
});

test('un\'email che non parte non ferma le altre', () => {
  const ops = [OPS[0], { id: 'b', nome: 'Bruno Blu', email: 'bruno@x.it' }];
  const t = carica({ proprieta: ATTIVI, erroreEmail: (m) => m.to === 'anna@x.it', risposte: firestoreFinto({ operatori: ops, eventi: [ev({ operatoreId: 'a' }), ev({ operatoreId: 'b' })] }) });
  const r = t.gs.giroPromemoria(ADESSO);
  assert.deepEqual(t.email.map((m) => m.to), ['bruno@x.it', 's@x.it']);
  assert.equal(r.operatori, 1);
  assert.equal(ultimo(t).operatori, 1);
});

test('lettura negata: niente email né registrazione', () => {
  const t = carica({ proprieta: ATTIVI, risposte: firestoreFinto({ codiceQuery: 403 }) });
  assert.throws(() => t.gs.giroPromemoria(ADESSO), /aggiungilo come Editor/);
  assert.equal(t.email.length, 0);
  assert.equal(ultimo(t), null);
  const altro = carica({ proprieta: ATTIVI, risposte: firestoreFinto({ codiceQuery: 500 }) });
  assert.throws(() => altro.gs.giroPromemoria(ADESSO), /Lettura di Firebase non riuscita \(500\)\./);
});

test('anteprima: niente email né registrazione, anche se già fatto oggi', () => {
  const prima = { giorno: '2026-10-09', quando: 'x', riepilogo: true, operatori: 2 };
  const t = carica({
    proprieta: Object.assign({}, ATTIVI, { PROMEMORIA_ATTIVI: 'NO', ULTIMO_PROMEMORIA: JSON.stringify(prima) }),
    risposte: firestoreFinto({ eventi: [ev({}), ev({ operatoreId: '', stato: 'da-assegnare' })] }),
  });
  const r = j(t.gs.giroPromemoria(ADESSO, { anteprima: true }));
  assert.equal(t.email.length, 0);
  assert.deepEqual([r.riepilogo, r.operatori, r.destinatari], [true, 1, ['anna@x.it', 's@x.it']]);
  assert.deepEqual(ultimo(t), prima);
});

test('il giorno è quello di Roma', () => {
  const t = carica({ proprieta: ATTIVI, risposte: firestoreFinto() });
  assert.equal(t.gs.giroPromemoria(new Date('2026-10-09T22:30:00Z')).oggi, '2026-10-10');
  assert.deepEqual(intervallo(t).map((f) => f[2]), ['2026-10-10', '2026-10-13']);
});

test('l\'attivatore non scambia l\'evento per la data', () => {
  const t = carica({ proprieta: ATTIVI, risposte: firestoreFinto() });
  t.gs.inviaPromemoria({ triggerUid: '1', authMode: 'FULL' });
  const oggi = formatta(new Date(), 'Europe/Rome', 'yyyy-MM-dd');
  assert.equal(intervallo(t)[0][2], oggi);
  assert.equal(ultimo(t).giorno, oggi);
});

test('risposta runQuery con voci senza documento', () => {
  const t = carica({ proprieta: ATTIVI, risposte: firestoreFinto({ rispostaQuery: [{ readTime: '2026-10-09T07:10:00Z' }] }) });
  assert.doesNotThrow(() => t.gs.giroPromemoria(ADESSO));
  assert.equal(t.email.length, 0);
});

test('operatori su più pagine', () => {
  const base = firestoreFinto({ eventi: [ev({ operatoreId: 'z' })] });
  const t = carica({
    proprieta: ATTIVI,
    risposte: (url) => {
      if (/\/operatori\?/.test(url)) {
        return url.includes('pageToken=p2')
          ? { codice: 200, dati: { documents: [docREST('operatori', { id: 'z', nome: 'Zeno Bianchi', email: 'zeno@x.it' })] } }
          : { codice: 200, dati: { documents: [docREST('operatori', OPS[0])], nextPageToken: 'p2' } };
      }
      return base(url);
    },
  });
  t.gs.giroPromemoria(ADESSO);
  assert.deepEqual(t.email.map((m) => m.to), ['zeno@x.it', 's@x.it']);
});

// ---------------------------------------------------------------- impostazioni e attivazione

test('impostazioni: valori predefiniti e attivatore', () => {
  const t = carica();
  const imp = j(t.gs.leggiImpostazioni());
  assert.deepEqual([imp.promemoriaAttivi, imp.promemoriaGiorni, imp.ultimoPromemoria], [false, 3, null]);
  assert.equal(t.gs.impostazioniDashboard().promemoriaProgrammato, false);
  assert.equal(carica({ attivatori: ['inviaPromemoria'] }).gs.impostazioniDashboard().promemoriaProgrammato, true);
  const rotte = carica({ proprieta: { PROMEMORIA_GIORNI: '12', ULTIMO_PROMEMORIA: '{rotto' } }).gs.leggiImpostazioni();
  assert.deepEqual([rotte.promemoriaGiorni, rotte.ultimoPromemoria], [3, null]);
});

test('salvataggio da dashboard vecchia non tocca i promemoria', () => {
  const t = carica({ proprieta: { PROMEMORIA_ATTIVI: 'SI', PROMEMORIA_GIORNI: '5' } });
  const imp = t.gs.salvaImpostazioni({ emailSupervisori: 's@x.it', emailAttive: true, urlAdmin: '' });
  assert.deepEqual([imp.promemoriaAttivi, imp.promemoriaGiorni, imp.emailSupervisori], [true, 5, 's@x.it']);
  const nuove = t.gs.salvaImpostazioni({ emailSupervisori: 's@x.it', emailAttive: true, urlAdmin: '', promemoriaAttivi: false, promemoriaGiorni: 2 });
  assert.deepEqual([nuove.promemoriaAttivi, nuove.promemoriaGiorni, nuove.promemoriaProgrammato], [false, 2, false]);
});

test('giorni fuori limite rifiutati', () => {
  const t = carica({ proprieta: { PROMEMORIA_GIORNI: '4' } });
  [0, 8, 2.5, '', null].forEach((g) => assert.throws(() => t.gs.salvaImpostazioni({ emailSupervisori: '', promemoriaAttivi: true, promemoriaGiorni: g }), /I giorni del promemoria vanno da 1 a 7\./, String(g)));
  assert.equal(t.prop.get('PROMEMORIA_GIORNI'), '4');
  assert.equal(t.gs.salvaImpostazioni({ emailSupervisori: '', promemoriaAttivi: true, promemoriaGiorni: 7 }).promemoriaGiorni, 7);
});

test('attivazione senza doppioni', () => {
  const t = carica({ attivatori: ['inviaPromemoria', 'altro'], proprieta: { PROMEMORIA_ATTIVI: 'NO', PROMEMORIA_GIORNI: '5' }, risposte: firestoreFinto({ eventi: [ev({})] }) });
  t.gs.attivaPromemoria();
  assert.equal(t.tolti.length, 1);
  assert.equal(t.creati.length, 1);
  assert.equal(t.creati[0].getHandlerFunction(), 'inviaPromemoria');
  assert.deepEqual(t.creati[0].impostazioni, { timeBased: true, everyDays: 1, atHour: 8, inTimezone: 'Europe/Rome' });
  assert.deepEqual(t.attivatori.map((a) => a.getHandlerFunction()).sort(), ['altro', 'inviaPromemoria']);
  assert.deepEqual([t.prop.get('PROMEMORIA_ATTIVI'), t.prop.get('PROMEMORIA_GIORNI')], ['NO', '5']);
  assert.equal(t.email.length, 0);
  const nuovo = carica({ risposte: firestoreFinto() });
  nuovo.gs.attivaPromemoria();
  assert.deepEqual([nuovo.prop.get('PROMEMORIA_ATTIVI'), nuovo.prop.get('PROMEMORIA_GIORNI')], ['SI', '3']);
  assert.ok(nuovo.registro.some((r) => r.includes('lettura riuscita')));
});

test('attivazione con lettura negata: nessun attivatore, messaggio chiaro', () => {
  const t = carica({ risposte: firestoreFinto({ codiceQuery: 403 }) });
  assert.throws(() => t.gs.attivaPromemoria(), /aggiungilo come Editor/);
  assert.equal(t.creati.length, 0);
  assert.equal(t.prop.has('PROMEMORIA_ATTIVI'), false);
  assert.ok(t.registro.some((r) => r.includes('NON attivato')));
});

// ---------------------------------------------------------------- correzioni dalla revisione finale

test('email non partite: contate, e se non parte nulla il giro risulta fallito e si può ripetere', () => {
  let guasto = true;
  const t = carica({ proprieta: ATTIVI, erroreEmail: () => guasto, risposte: firestoreFinto({ eventi: [ev({}), ev({ operatoreId: '', stato: 'da-assegnare' })] }) });
  assert.throws(() => t.gs.giroPromemoria(ADESSO), /Nessun promemoria è partito: Invio non riuscito/);
  assert.deepEqual(ultimo(t), { giorno: '2026-10-09', quando: ADESSO.toISOString(), riepilogo: false, operatori: 0, nonInviate: 2, inSospeso: 2, fallito: true });
  guasto = false;
  const r = t.gs.giroPromemoria(new Date('2026-10-09T09:00:00Z'));
  assert.equal(r.saltato, undefined);
  assert.deepEqual(t.email.map((m) => m.to), ['anna@x.it', 's@x.it']);
  assert.equal(ultimo(t).fallito, undefined);
  assert.equal(t.gs.giroPromemoria(new Date('2026-10-09T10:00:00Z')).saltato, 'già fatto');
});

test('email in parte non partite: giro fatto, conteggio salvato', () => {
  const t = carica({ proprieta: ATTIVI, erroreEmail: (m) => m.to === 's@x.it', risposte: firestoreFinto({ eventi: [ev({}), ev({ operatoreId: '', stato: 'da-assegnare' })] }) });
  t.gs.giroPromemoria(ADESSO);
  assert.deepEqual([ultimo(t).operatori, ultimo(t).riepilogo, ultimo(t).nonInviate, ultimo(t).fallito], [1, false, 1, undefined]);
});

test('anteprima con eventi da sistemare ma nessun destinatario lo dice', () => {
  const t = carica({ risposte: firestoreFinto({ eventi: [ev({ operatoreId: '', stato: 'da-assegnare' })] }) });
  t.gs.attivaPromemoria();
  assert.ok(t.registro.some((r) => r.includes('1 evento da sistemare ma nessun destinatario')), t.registro.join('\n'));
});

test('errori di Firebase: si riporta anche la risposta di Google', () => {
  const scopi = carica({ proprieta: ATTIVI, risposte: firestoreFinto({ codiceQuery: 403, erroreQuery: { error: { code: 403, message: 'Request had insufficient authentication scopes.' } } }) });
  assert.throws(() => scopi.gs.giroPromemoria(ADESSO), /aggiungilo come Editor del progetto \(vedi README\)\. Risposta di Google: Request had insufficient authentication scopes\./);
  const serie = carica({ proprieta: ATTIVI, risposte: firestoreFinto({ codiceQuery: 500, erroreQuery: [{ error: { message: 'Backend non disponibile' } }] }) });
  assert.throws(() => serie.gs.giroPromemoria(ADESSO), /Lettura di Firebase non riuscita \(500\)\. Risposta di Google: Backend non disponibile/);
});
