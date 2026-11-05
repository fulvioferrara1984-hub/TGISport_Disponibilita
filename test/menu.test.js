// Prove del menu laterale dei supervisori (app/menu.js), con elementi finti: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
require('../app/menu.js');
const M = window.DO.menu;

function elemento(campi = {}) {
  const classi = new Set();
  return {
    hidden: false, dataset: {}, attributi: {}, ascolti: {}, fuoco: 0,
    classList: { add: (c) => classi.add(c), remove: (c) => classi.delete(c), contains: (c) => classi.has(c) },
    setAttribute(k, v) { this.attributi[k] = v; },
    removeAttribute(k) { delete this.attributi[k]; },
    addEventListener(tipo, f) { this.ascolti[tipo] = f; },
    focus() { this.fuoco += 1; },
    ...campi,
  };
}

function preparaCassetto(voci = [elemento(), elemento()]) {
  const lato = elemento({ querySelectorAll: (s) => (s === '.voce-menu' ? voci : []) });
  const velo = elemento({ hidden: true });
  const apri = elemento();
  const documento = {
    ascolti: {},
    addEventListener(tipo, f) { this.ascolti[tipo] = f; },
    removeEventListener(tipo, f) { if (this.ascolti[tipo] === f) delete this.ascolti[tipo]; },
  };
  return { voci, lato, velo, apri, documento, c: M.cassetto({ lato, velo, apri, documento }) };
}

test('data per esteso', () => {
  assert.equal(M.dataEstesa('2026-11-01'), 'Domenica 1 novembre 2026');
  assert.equal(M.dataEstesa('2026-12-31'), 'Giovedì 31 dicembre 2026');
});

test('chi è entrato: prima il nome, poi l\'email', () => {
  assert.equal(M.chi('Fulvio', 'f@x.it'), 'Fulvio');
  assert.equal(M.chi('', 'f@x.it'), 'f@x.it');
  assert.equal(M.chi(null, undefined), '');
});

test('etichette: una per ogni voce del menu', () => {
  assert.deepEqual(M.ETICHETTE, {
    convocazioni: 'Convocazioni', griglia: 'Disponibilità', aggiornamenti: 'Aggiornamenti',
    riepilogo: 'Riepilogo', operatori: 'Operatori', impostazioni: 'Impostazioni',
  });
});

test('segna: la voce attiva e il percorso', () => {
  const griglia = elemento({ dataset: { vista: 'griglia' } }), riepilogo = elemento({ dataset: { vista: 'riepilogo' } });
  const percorso = { textContent: '' };
  M.segna([griglia, riepilogo], 'griglia', percorso);
  assert.equal(griglia.attributi['aria-current'], 'page');
  assert.ok(!('aria-current' in riepilogo.attributi));
  assert.equal(percorso.textContent, 'Disponibilità');
  M.segna([griglia, riepilogo], 'riepilogo', percorso);
  assert.ok(!('aria-current' in griglia.attributi));
  assert.equal(riepilogo.attributi['aria-current'], 'page');
  assert.equal(percorso.textContent, 'Riepilogo');
});

test('cassetto: si apre e il fuoco va sulla prima voce visibile', () => {
  const nascosta = elemento({ hidden: true }), visibile = elemento();
  const { lato, velo, apri, c } = preparaCassetto([nascosta, visibile]);
  c.apri();
  assert.ok(lato.classList.contains('aperto'));
  assert.equal(velo.hidden, false);
  assert.equal(apri.attributi['aria-expanded'], 'true');
  assert.equal(nascosta.fuoco, 0);
  assert.equal(visibile.fuoco, 1);
  assert.equal(c.aperto(), true);
});

test('cassetto: il tasto ☰ apre e, se è aperto, chiude', () => {
  const { lato, apri } = preparaCassetto();
  apri.ascolti.click();
  assert.ok(lato.classList.contains('aperto'));
  apri.ascolti.click();
  assert.ok(!lato.classList.contains('aperto'));
  assert.equal(apri.attributi['aria-expanded'], 'false');
});

test('cassetto: Esc chiude e torna su ☰', () => {
  const { lato, velo, apri, documento, c } = preparaCassetto();
  c.apri();
  documento.ascolti.keydown({ key: 'a' });
  assert.equal(c.aperto(), true);
  documento.ascolti.keydown({ key: 'Escape' });
  assert.ok(!lato.classList.contains('aperto'));
  assert.equal(velo.hidden, true);
  assert.equal(apri.attributi['aria-expanded'], 'false');
  assert.equal(apri.fuoco, 1);
});

test('cassetto: il velo chiude e torna su ☰', () => {
  const { lato, velo, apri, c } = preparaCassetto();
  c.apri();
  velo.ascolti.click();
  assert.ok(!lato.classList.contains('aperto'));
  assert.equal(apri.fuoco, 1);
});

test('cassetto: chiudi() non sposta il fuoco', () => {
  const { lato, apri, c } = preparaCassetto();
  c.apri();
  c.chiudi();
  assert.ok(!lato.classList.contains('aperto'));
  assert.equal(apri.fuoco, 0);
  assert.equal(c.aperto(), false);
});

test('cassetto: chiuso, Esc non fa nulla', () => {
  const { apri, documento, c } = preparaCassetto();
  assert.equal(documento.ascolti.keydown, undefined);
  c.apri();
  const tasto = documento.ascolti.keydown;
  c.chiudiTorna();
  assert.equal(apri.fuoco, 1);
  assert.equal(documento.ascolti.keydown, undefined);
  tasto({ key: 'Escape' });
  assert.equal(apri.fuoco, 1);
});
