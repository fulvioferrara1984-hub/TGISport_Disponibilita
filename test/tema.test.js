// Prove del tema scuro e chiaro (app/tema.js) e del suo aggancio alle due pagine: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const memoria = (iniziale = {}) => ({
  dati: { ...iniziale },
  getItem(k) { return k in this.dati ? this.dati[k] : null; },
  setItem(k, v) { this.dati[k] = String(v); },
});

// ricarica il modulo su una pagina nuova, come all'apertura della pagina
function carica(archivio = memoria()) {
  global.window = {};
  Object.defineProperty(window, 'localStorage', { value: archivio, configurable: true });
  global.document = { documentElement: { dataset: {} }, querySelectorAll: () => [], addEventListener() {} };
  delete require.cache[require.resolve('../app/tema.js')];
  require('../app/tema.js');
  return window.DO.tema;
}

const interruttore = () => ({
  innerHTML: '', attributi: {}, ascolti: {},
  setAttribute(k, v) { this.attributi[k] = v; },
  addEventListener(tipo, f) { this.ascolti[tipo] = f; },
});

const T = carica();

test('temaDa: solo «chiaro» è chiaro', () => {
  assert.equal(T.temaDa('chiaro'), 'chiaro');
  for (const v of ['scuro', 'blu', '', null, undefined]) assert.equal(T.temaDa(v), 'scuro');
});

test('altroTema', () => {
  assert.equal(T.altroTema('scuro'), 'chiaro');
  assert.equal(T.altroTema('chiaro'), 'scuro');
});

test('archivio che lancia errori: si legge scuro e si salva senza lanciare', () => {
  const rotto = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  assert.equal(T.leggi(rotto), 'scuro');
  assert.doesNotThrow(() => T.salva(rotto, 'chiaro'));
  assert.equal(T.leggi(null), 'scuro');
});

test('al caricamento applica il tema salvato', () => {
  const t = carica(memoria({ 'do-tema': 'chiaro' }));
  assert.equal(document.documentElement.dataset.tema, 'chiaro');
  assert.equal(t.attuale(), 'chiaro');
});

test('senza niente in memoria parte dallo scuro', () => {
  const t = carica();
  assert.equal(document.documentElement.dataset.tema, 'scuro');
  assert.equal(t.attuale(), 'scuro');
});

test('localStorage che lancia alla sola lettura non blocca la pagina', () => {
  global.window = {};
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloccato'); }, configurable: true });
  global.document = { documentElement: { dataset: {} }, querySelectorAll: () => [], addEventListener() {} };
  delete require.cache[require.resolve('../app/tema.js')];
  assert.doesNotThrow(() => require('../app/tema.js'));
  assert.equal(document.documentElement.dataset.tema, 'scuro');
  window.DO.tema.cambia();
  assert.equal(document.documentElement.dataset.tema, 'chiaro');
});

test('cambia: tema, memoria e tutti gli interruttori', () => {
  const archivio = memoria();
  const t = carica(archivio);
  const conTesto = interruttore(), soloIcona = interruttore();
  t.collega(conTesto, false);
  t.collega(soloIcona, true);
  assert.ok(conTesto.innerHTML.includes('<span>Tema chiaro</span>'));
  t.cambia();
  assert.equal(document.documentElement.dataset.tema, 'chiaro');
  assert.equal(archivio.dati['do-tema'], 'chiaro');
  assert.ok(conTesto.innerHTML.includes('<span>Tema scuro</span>'));
  assert.ok(!soloIcona.innerHTML.includes('<span>'));
  assert.ok(soloIcona.innerHTML.includes('class="ic-tema"'));
  for (const el of [conTesto, soloIcona]) {
    assert.equal(el.attributi['aria-label'], 'Tema scuro');
    assert.equal(el.attributi.title, 'Tema scuro');
  }
});

test('il click sull\'interruttore cambia tema', () => {
  const t = carica();
  const el = interruttore();
  t.collega(el, false);
  el.ascolti.click();
  assert.equal(t.attuale(), 'chiaro');
  el.ascolti.click();
  assert.equal(t.attuale(), 'scuro');
});

test('al caricamento della pagina collega ogni interruttore segnato', () => {
  global.window = {};
  Object.defineProperty(window, 'localStorage', { value: memoria(), configurable: true });
  const ascolti = {};
  const a = Object.assign(interruttore(), { hasAttribute: () => false });
  const b = Object.assign(interruttore(), { hasAttribute: (n) => n === 'data-sola-icona' });
  global.document = {
    documentElement: { dataset: {} },
    querySelectorAll: (s) => (s === '[data-interruttore-tema]' ? [a, b] : []),
    addEventListener(tipo, f) { ascolti[tipo] = f; },
  };
  delete require.cache[require.resolve('../app/tema.js')];
  require('../app/tema.js');
  ascolti.DOMContentLoaded();
  assert.ok(a.innerHTML.includes('<span>Tema chiaro</span>'));
  assert.ok(!b.innerHTML.includes('<span>'));
});

const pagine = ['index.html', 'admin.html'].map((nome) => [nome, fs.readFileSync(path.join(__dirname, '..', nome), 'utf8')]);

test('le due pagine caricano il tema nel head, senza defer', () => {
  for (const [nome, html] of pagine) {
    const tag = html.match(/<script[^>]*app\/tema\.js[^>]*>/);
    assert.ok(tag, nome + ': manca lo script del tema');
    assert.ok(tag.index < html.indexOf('</head>'), nome + ': lo script non è nel head');
    assert.ok(!/defer|async/.test(tag[0]), nome + ': lo script non deve aspettare');
  }
});

test('ogni logo ha le due versioni', () => {
  for (const [nome, html] of pagine) {
    const scuri = html.match(/<img\b[^>]*class="[^"]*logo-scuro[^>]*>/g) || [];
    const chiari = html.match(/<img\b[^>]*class="[^"]*logo-chiaro[^>]*>/g) || [];
    assert.ok(scuri.length >= 2, nome + ': loghi per lo scuro ' + scuri.length);
    assert.equal(scuri.length, chiari.length, nome);
    for (const img of scuri) assert.ok(img.includes('src="Logo/TGI-Sport_white.png"'), img);
    for (const img of chiari) assert.ok(img.includes('src="Logo/TGI-Sport_black.png"'), img);
  }
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'Logo', 'TGI-Sport_white.png')));
});

test('interruttori nelle pagine: icona in testata per gli operatori, nei moduli di accesso con il testo', () => {
  for (const [nome, html] of pagine) {
    const modulo = html.slice(html.indexOf('id="accesso-form"'), html.indexOf('</form>'));
    assert.ok(/<button type="button" class="link accesso-tema" data-interruttore-tema><\/button>\s*$/.test(modulo), nome + ': interruttore in fondo al modulo');
  }
  const operatori = pagine[0][1];
  assert.ok(/data-interruttore-tema data-sola-icona><\/button>\s*<button[^>]*id="btn-esci"/.test(operatori));
});
