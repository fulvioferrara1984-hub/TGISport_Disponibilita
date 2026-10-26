// Prove dei messaggi tra operatori e supervisori (app/messaggi.js): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
require('../app/messaggi.js');
const M = window.DO.messaggi;

const msg = (campi) => Object.assign({ id: 'm' + Math.random(), operatoreId: 'op1', tipo: 'evento', rif: 'e1', da: 'operatore', autore: 'Marco Rossi',
  testo: 'ciao', quando: '2026-10-21T16:05:00.000Z', letto: false }, campi);

test('testo valido: spazi tolti, vuoto e oltre 500 rifiutati', () => {
  assert.equal(M.TESTO_MAX, 500);
  assert.equal(M.testoValido('  ciao '), 'ciao');
  assert.equal(M.testoValido('   '), null);
  assert.equal(M.testoValido(''), null);
  assert.equal(M.testoValido(undefined), null);
  assert.equal(M.testoValido('x'.repeat(500)), 'x'.repeat(500));
  assert.equal(M.testoValido('x'.repeat(501)), null);
  assert.equal(M.testoValido(' riga uno\nriga due '), 'riga uno\nriga due');
});

test('conversazione: solo quella chiave, in ordine di tempo', () => {
  const elenco = [
    msg({ id: 'b', quando: '2026-10-21T17:00:00.000Z' }),
    msg({ id: 'a', quando: '2026-10-21T16:00:00.000Z', da: 'supervisore' }),
    msg({ id: 'altro-op', operatoreId: 'op2' }),
    msg({ id: 'altro-ev', rif: 'e2' }),
    msg({ id: 'onsite', tipo: 'onsite' }),
  ];
  assert.deepEqual(M.conversazione(elenco, 'evento', 'e1', 'op1').map((m) => m.id), ['a', 'b']);
  assert.equal(M.chiave(elenco[0]), 'evento/e1/op1');
});

test('nuovi messaggi per l\'operatore: solo dei supervisori non letti', () => {
  const elenco = [msg({ da: 'supervisore' }), msg({ da: 'supervisore', letto: true }), msg({ da: 'operatore' }), msg({ da: 'supervisore', rif: 'e2' })];
  assert.equal(M.nuoviPerOperatore(elenco, 'evento', 'e1'), 1);
  assert.equal(M.nuoviPerOperatore(elenco, 'onsite', 'e1'), 0);
});

test('conversazioni di un evento: l\'operatore attuale per primo', () => {
  const elenco = [
    msg({ operatoreId: 'vecchio1', quando: '2026-10-20T10:00:00.000Z' }),
    msg({ operatoreId: 'vecchio2', quando: '2026-10-20T12:00:00.000Z' }),
    msg({ operatoreId: 'attuale', quando: '2026-10-19T10:00:00.000Z' }),
    msg({ operatoreId: 'vecchio1', quando: '2026-10-20T09:00:00.000Z' }),
    msg({ operatoreId: 'altrove', rif: 'e9' }),
  ];
  const gruppi = M.perEvento(elenco, 'evento', 'e1', 'attuale');
  assert.deepEqual(gruppi.map((g) => g.operatoreId), ['attuale', 'vecchio2', 'vecchio1']);
  assert.deepEqual(gruppi[2].messaggi.map((m) => m.quando), ['2026-10-20T09:00:00.000Z', '2026-10-20T10:00:00.000Z']);
  assert.deepEqual(M.perEvento(elenco, 'evento', 'e1', 'nessuno').map((g) => g.operatoreId), ['vecchio2', 'vecchio1', 'attuale']);
});

test('si può scrivere: operatore', () => {
  assert.equal(M.chiusoPerOperatore('evento', { stato: 'confermato' }, 'op1'), '');
  assert.equal(M.chiusoPerOperatore('evento', { stato: 'annullato' }, 'op1'), 'Convocazione annullata: non si possono più mandare messaggi.');
  assert.equal(M.chiusoPerOperatore('onsite', { stato: 'aperta', esclusi: [] }, 'op1'), '');
  assert.equal(M.chiusoPerOperatore('onsite', { stato: 'annullata', esclusi: ['op1'] }, 'op1'), 'Deployment annullato: non si possono più mandare messaggi.');
  assert.equal(M.chiusoPerOperatore('onsite', { stato: 'chiusa', esclusi: ['op1'] }, 'op1'), 'Non fai più parte di questo deployment: non si possono più mandare messaggi.');
});

test('si può scrivere: supervisore', () => {
  const NON_INVIATA = 'Potrai scrivere dopo l\'invio della convocazione.';
  assert.equal(M.chiusoPerSupervisore({ operatoreId: '', inviata: false }), NON_INVIATA);
  assert.equal(M.chiusoPerSupervisore({ operatoreId: 'op1', inviata: false }), NON_INVIATA);
  assert.equal(M.chiusoPerSupervisore({ operatoreId: 'op1', inviata: true }), '');
});

test('etichetta del tasto', () => {
  assert.equal(M.etichetta(0, 0), '💬 Scrivi ai supervisori');
  assert.equal(M.etichetta(3, 0), '💬 Messaggi (3)');
  assert.equal(M.etichetta(3, 1), '💬 1 nuovo messaggio');
  assert.equal(M.etichetta(3, 2), '💬 2 nuovi messaggi');
});

test('segni 💬 e voci da segnare come lette', () => {
  const voce = (campi, evento) => Object.assign({ id: 'v' + Math.random(), tipo: 'messaggio', letto: false, operatoreId: 'op1',
    evento: Object.assign({ tipo: 'evento', rif: 'e1' }, evento) }, campi);
  const invii = [
    voce({ id: 'v1' }),
    voce({ id: 'v2', letto: true }),
    voce({ id: 'v3', operatoreId: 'op2' }),
    voce({ id: 'v4' }, { tipo: 'onsite', rif: 'd1' }),
    voce({ id: 'v5', tipo: 'convocazione' }, { id: 'e7', rif: undefined }),
    voce({ id: 'v6', modifiche: [], tipo: undefined, evento: undefined }),
  ];
  assert.deepEqual([...M.segniDaLeggere(invii)].sort(), ['evento/e1', 'onsite/d1']);
  assert.deepEqual(M.inviiDellaConversazione(invii, 'evento', 'e1', 'op1'), ['v1']);
  assert.deepEqual(M.inviiDellaConversazione(invii, 'onsite', 'd1', 'op1'), ['v4']);
});

test('documenti da scrivere: messaggio e voce di Aggiornamenti', () => {
  const adesso = '2026-10-21T16:05:00.000Z';
  const m = M.nuovoMessaggio({ tipo: 'evento', rif: 'e1', operatoreId: 'op1', da: 'operatore', autore: 'Marco Rossi', testo: 'Porto il PC?' }, adesso);
  assert.deepEqual(Object.keys(m).sort(), ['autore', 'da', 'letto', 'operatoreId', 'quando', 'rif', 'testo', 'tipo']);
  assert.deepEqual(m, { operatoreId: 'op1', tipo: 'evento', rif: 'e1', da: 'operatore', autore: 'Marco Rossi', testo: 'Porto il PC?', quando: adesso, letto: false });
  const v = M.voceAggiornamenti(m, { id: 'op1', nome: 'Marco Rossi' }, { titolo: 'Milan-Inter', data: '2026-10-24' }, adesso);
  assert.deepEqual(v, { quando: adesso, operatoreId: 'op1', nome: 'Marco Rossi', modifiche: [], letto: false, tipo: 'messaggio',
    evento: { tipo: 'evento', rif: 'e1', titolo: 'Milan-Inter', data: '2026-10-24', testo: 'Porto il PC?' } });
});

test('soggetto: partita, turno remoto, on-site', () => {
  assert.deepEqual(M.soggetto('evento', { tipo: 'partita', titolo: 'Milan-Inter', data: '2026-10-24' }), { titolo: 'Milan-Inter', data: '2026-10-24' });
  assert.deepEqual(M.soggetto('evento', { tipo: 'supervisione', titolo: 'Supervisione', data: '2026-10-25' }), { titolo: 'Turno Remote TL', data: '2026-10-25' });
  assert.deepEqual(M.soggetto('onsite', { luogo: 'Roma', titolo: 'Six Nations', da: '2026-11-12', a: '2026-11-13' }), { titolo: 'On-site Roma · Six Nations', data: '2026-11-12' });
  assert.deepEqual(M.soggetto('onsite', { luogo: 'Roma', titolo: '', da: '2026-11-12' }), { titolo: 'On-site Roma', data: '2026-11-12' });
});

test('conversazione in HTML: testo protetto e a capo', () => {
  const elenco = [msg({ testo: '<b>&"x\ny', da: 'operatore', autore: 'Marco <Rossi>' }), msg({ testo: 'ok', da: 'supervisore', autore: 'Giulia' })];
  const op = M.htmlConversazione(elenco, 'operatore');
  assert.ok(op.includes('&lt;b&gt;&amp;&quot;x<br>y'), op);
  assert.ok(!op.includes('<b>'));
  assert.match(op, /^<ol class="msg-elenco">/);
  assert.equal((op.match(/class="msg msg-mio"/g) || []).length, 1);
  assert.equal((op.match(/class="msg msg-altro"/g) || []).length, 1);
  assert.ok(op.includes('Giulia'));          // nome di chi scrive dall'altra parte
  assert.ok(!op.includes('Marco &lt;Rossi&gt;'));   // il proprio nome no
  const sup = M.htmlConversazione(elenco, 'supervisore');
  assert.ok(sup.includes('Marco &lt;Rossi&gt;'));
  // nella dashboard anche i messaggi dei supervisori hanno il nome: i supervisori sono più di uno
  assert.ok(sup.includes('<span class="msg-chi">Giulia</span>'), sup);
  assert.equal((sup.match(/class="msg msg-mio"/g) || []).length, 1);
  assert.equal(M.htmlConversazione([], 'operatore'), '<p class="msg-vuoto">Nessun messaggio.</p>');
});

// ---------------------------------------------------------------- pannello della conversazione
// pagina finta: il dialogo restituisce sempre lo stesso nodo per un selettore, finché non se ne riscrive il contenuto
function domFinto() {
  const nodo = (extra) => Object.assign({ value: '', disabled: false, hidden: false, textContent: '', scrollTop: 0, scrollHeight: 100,
    focus() {}, setAttribute() {}, appendChild() {} }, extra);
  let cache = {}, html = '';
  const dialogo = nodo({ open: false, showModal() { this.open = true; }, close() { this.open = false; }, querySelector: (sel) => (cache[sel] = cache[sel] || nodo({ innerHTML: '' })) });
  Object.defineProperty(dialogo, 'innerHTML', { set(v) { html = v; cache = {}; }, get() { return html; } });
  global.document = { body: nodo(), getElementById: (id) => (id === 'dlg-messaggi' ? dialogo : null), createElement: () => dialogo };
  return { dialogo, el: (sel) => dialogo.querySelector(sel) };
}

test('pannello: aggiorna senza perdere la bozza', () => {
  const { el } = domFinto();
  try {
    const p = M.apriConversazione({ titolo: 'Milan-Inter', sotto: 'Sabato 24 ottobre', messaggi: [msg({ testo: 'primo' })], mio: 'operatore', chiuso: '', invia: async () => {} });
    assert.ok(el('.msg-lista').innerHTML.includes('primo'));
    el('textarea').value = 'sto scrivendo';
    p.aggiorna([msg({ testo: 'primo' }), msg({ testo: 'risposta', da: 'supervisore', autore: 'Giulia' })]);
    assert.ok(el('.msg-lista').innerHTML.includes('risposta'));
    assert.equal(el('textarea').value, 'sto scrivendo');
    // aperto per un'altra conversazione: il vecchio pannello non lo tocca più
    M.apriConversazione({ titolo: 'Altro', messaggi: [msg({ testo: 'nuova' })], mio: 'operatore', chiuso: '', invia: async () => {} });
    p.aggiorna([msg({ testo: 'vecchia' })]);
    assert.ok(el('.msg-lista').innerHTML.includes('nuova'));
    // sola lettura: niente campo
    M.apriConversazione({ titolo: 'Annullata', messaggi: [], mio: 'operatore', chiuso: 'Convocazione annullata: non si possono più mandare messaggi.', invia: async () => {} });
    assert.ok(!/<textarea/.test(document.getElementById('dlg-messaggi').innerHTML));
    assert.ok(document.getElementById('dlg-messaggi').innerHTML.includes('Convocazione annullata'));
    // nota vuota: la riga c'è (nascosta) e si può riempire dopo, per esempio con il nome del supervisore
    M.apriConversazione({ titolo: 'x', messaggi: [], mio: 'supervisore', chiuso: '', nota: '', invia: async () => {} });
    assert.ok(document.getElementById('dlg-messaggi').innerHTML.includes('<p class="msg-nota" hidden></p>'));
    M.apriConversazione({ titolo: 'x', messaggi: [], mio: 'operatore', chiuso: '', invia: async () => {} });
    assert.ok(!document.getElementById('dlg-messaggi').innerHTML.includes('msg-nota'));
  } finally { delete global.document; }
});

test('invio: un solo messaggio con tocchi ripetuti', async () => {
  const { el } = domFinto();
  try {
    let chiamate = 0, fatto = null;
    M.apriConversazione({ titolo: 'x', messaggi: [], mio: 'operatore', chiuso: '',
      invia: (t) => { chiamate++; assert.equal(t, 'ciao'); return new Promise((r) => { fatto = r; }); } });
    el('textarea').value = ' ciao ';
    const evento = { preventDefault() {} };
    const primo = el('form').onsubmit(evento);
    el('form').onsubmit(evento);
    assert.equal(chiamate, 1);
    assert.equal(el('[data-invia]').disabled, true);
    fatto();
    await primo;
    assert.equal(el('textarea').value, '');
    assert.equal(el('[data-invia]').disabled, false);
    // campo vuoto: nessun invio
    await el('form').onsubmit(evento);
    assert.equal(chiamate, 1);
  } finally { delete global.document; }
});

test('pannello: esito dell\'invio dentro il pannello (sul telefono gli avvisi della pagina restano sotto)', async () => {
  const { el } = domFinto();
  try {
    let risposta = Promise.reject(new Error('La convocazione è cambiata: ricarica la pagina.'));
    risposta.catch(() => {});
    M.apriConversazione({ titolo: 'x', messaggi: [], mio: 'operatore', chiuso: '', invia: () => risposta });
    el('textarea').value = 'ciao';
    await el('form').onsubmit({ preventDefault() {} });
    assert.equal(el('.msg-esito').textContent, 'La convocazione è cambiata: ricarica la pagina.');
    assert.equal(el('.msg-esito').hidden, false);
    assert.match(el('.msg-esito').className, /errore/);
    assert.equal(el('textarea').value, 'ciao');
    risposta = Promise.resolve('Messaggio inviato ai supervisori.');
    await el('form').onsubmit({ preventDefault() {} });
    assert.equal(el('.msg-esito').textContent, 'Messaggio inviato ai supervisori.');
    assert.match(el('.msg-esito').className, /ok/);
    assert.equal(el('textarea').value, '');
  } finally { delete global.document; }
});

test('messaggi della pagina operatori: quelli mandati da qui non si perdono con i dati arrivati dopo', () => {
  const server = [msg({ id: 'a' }), msg({ id: 'b', da: 'supervisore' })];
  const locali = [msg({ id: 'b', da: 'supervisore' }), msg({ id: 'c', testo: 'mandato durante il caricamento' })];
  assert.deepEqual(M.unisci(server, locali).map((m) => m.id), ['a', 'b', 'c']);
  assert.deepEqual(M.unisci(server, []).map((m) => m.id), ['a', 'b']);
});
