// Prove della finestra di blocco (app/comune.js): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/comune.js');
const DO = window.DO;

test('lunedì bloccato da venerdì (N = 3)', () => {
  assert.equal(DO.bloccato('2026-10-12', '2026-10-09', 3), true);
  assert.equal(DO.bloccato('2026-10-13', '2026-10-09', 3), false);
  assert.equal(DO.bloccato('2026-10-12', '2026-10-08', 3), false);
});

test('oggi e i giorni passati sono bloccati', () => {
  assert.equal(DO.bloccato('2026-10-09', '2026-10-09', 3), true);
  assert.equal(DO.bloccato('2026-10-01', '2026-10-09', 3), true);
});

test('N = 0 blocca solo oggi', () => {
  assert.equal(DO.bloccato('2026-10-09', '2026-10-09', 0), true);
  assert.equal(DO.bloccato('2026-10-10', '2026-10-09', 0), false);
});

test('il cambio dell\'ora legale non sposta il conteggio', () => {
  assert.equal(DO.giorniA('2026-10-26', '2026-10-24'), 2);
  assert.equal(DO.giorniA('2026-10-01', '2026-10-09'), -8);
});

test('regole operative predefinite', () => {
  assert.deepEqual(DO.OPERATIVO_PREDEFINITO, { telefono: '', giorniBlocco: 3 });
});
