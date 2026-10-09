// Prove dei calcoli di turno (app/regole.js): node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../app/regole.js');
const R = window.DO.regole;

const regole = R.complete({
  competizioni: [
    { nome: 'Serie A', prima: 4, dopo: 2 },
    { nome: 'Champions League', uefa: true, prima: 1, dopo: 2 },
    { nome: 'Ligue 1', prima: 1, dopo: null },
  ],
});
const turno = (e) => [R.convocazione(e, regole), R.fine(e, regole)];

test('ritrovo e fine per competizione', () => {
  assert.deepEqual(turno({ competizione: 'Serie A', orario: '20:45' }), ['16:45', '22:45']);
  assert.deepEqual(turno({ competizione: 'Champions League', orario: '21:00' }), ['20:00', '23:00']);
});

test('un solo campo compilato: l\'altro usa il valore generale', () => {
  assert.deepEqual(turno({ competizione: 'Ligue 1', orario: '20:45' }), ['19:45', '22:45']);
});

test('competizione sconosciuta usa i valori generali', () => {
  assert.deepEqual(turno({ competizione: 'X', orario: '15:00' }), ['11:00', '17:00']);
});

test('valori scritti a mano vincono', () => {
  assert.deepEqual(turno({ competizione: 'Serie A', orario: '20:45', convocazione: '18:00', fine: '23:30' }), ['18:00', '23:30']);
});

test('supervisione: durata predefinita dal ritrovo', () => {
  const sup = { tipo: 'supervisione', competizione: 'Champions League', convocazione: '10:00' };
  assert.equal(R.fine(sup, regole), '16:00');
  assert.deepEqual(R.intervallo(sup, regole), { inizio: 600, fine: 960 });
  assert.equal(R.fine(Object.assign({}, sup, { fine: '13:00' }), regole), '13:00');
});

test('supervisione importata: ritrovo dall\'anticipo generale, non dalla competizione', () => {
  assert.deepEqual(turno({ tipo: 'supervisione', competizione: 'Champions League', orario: '18:00' }), ['14:00', '20:00']);
});

test('fine oltre la mezzanotte vale fine giornata nel confronto', () => {
  const tardi = { competizione: 'Serie A', orario: '22:45' };
  assert.equal(R.fine(tardi, regole), '00:45');
  assert.equal(R.intervallo(tardi, regole).fine, 1439);
});

test('sovrapposti', () => {
  const p = (orario, data = '2026-10-17') => ({ competizione: 'Serie A', orario, data });
  assert.equal(R.sovrapposti(p('15:00'), p('20:45'), regole), true);
  assert.equal(R.sovrapposti(p('12:30'), p('20:45'), regole), false);
  assert.equal(R.sovrapposti(p('15:00'), p('20:45', '2026-10-18'), regole), false);
});

test('il notturno resta calcolato sul ritrovo', () => {
  assert.equal(R.notturno({ competizione: 'Serie A', orario: '02:00' }, regole), true);
});

test('competizioni salvate senza orari restano valide', () => {
  const r = R.complete({ competizioni: [{ nome: 'Serie A', sport: 'Calcio', uefa: false }] });
  assert.equal(r.competizioni[0].prima, null);
  assert.equal(r.competizioni[0].dopo, null);
  assert.equal(r.fineOre, 2);
  assert.equal(r.durataSupervisioneOre, 6);
});
