// Il foglio di stile: i due temi, il contrasto dei testi e i colori scritti a mano.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const foglio = fs.readFileSync(path.join(__dirname, '..', 'app', 'stile.css'), 'utf8');
const css = foglio.replace(/\/\*[\s\S]*?\*\//g, '');

const SCURO = ':root {';
const CHIARO = ':root[data-tema="chiaro"] {';

function blocco(intestazione) {
  const da = css.indexOf(intestazione);
  if (da < 0) return '';
  return css.slice(da, css.indexOf('\n}', da) + 2);
}

function variabili(testo) {
  return Object.fromEntries([...testo.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const temi = {
  scuro: variabili(blocco(SCURO)),
  chiaro: { ...variabili(blocco(SCURO)), ...variabili(blocco(CHIARO)) },
};

function colore(v) {
  if (!v) throw new Error('variabile mancante');
  const h = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (h) {
    const x = h[1].length === 3 ? [...h[1]].map((c) => c + c).join('') : h[1];
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), 1];
  }
  const r = v.match(/^rgba?\(([^)]+)\)$/);
  if (!r) throw new Error('colore non leggibile: ' + v);
  const [a, b, c, d] = r[1].split(',').map((n) => Number(n.trim()));
  return [a, b, c, d ?? 1];
}

const sopra = (c, fondo) => [0, 1, 2].map((i) => c[i] * c[3] + fondo[i] * (1 - c[3])).concat(1);

const luce = (c) => {
  const f = (x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};

function contrasto(t, testo, fondo) {
  const p = colore(t['--pannello']);
  const f = sopra(colore(t[fondo]), p);
  const c = sopra(colore(t[testo]), f);
  const [a, b] = [luce(c), luce(f)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const TESTI = [
  ['--inchiostro', ['--sfondo', '--pannello', '--lato', '--campo', '--intestazione-tabella']],
  ['--inchiostro-2', ['--sfondo', '--pannello', '--lato', '--intestazione-tabella', '--vuoto']],
  ['--link', ['--pannello', '--sfondo', '--intestazione-tabella']],
  ['--accento-scuro', ['--accento-tenue']],
  ['--ok', ['--ok-tenue']],
  ['--attenzione', ['--attenzione-tenue']],
  ['--errore', ['--errore-tenue']],
  ['--viola', ['--pannello', '--viola-tenue']],
  ['--segnale-testo', ['--segnale-tenue']],
  ['--su-accento', ['--accento', '--accento-sopra', '--barra-versione', '--avviso-ok', '--avviso-errore']],
  ['--su-errore', ['--errore', '--errore-sopra']],
  ['--su-stato', ['--ok', '--attenzione', '--errore']],
];

for (const [nome, t] of Object.entries(temi)) {
  test(`tema ${nome} — testi leggibili: almeno 4,5:1 sui loro fondi`, () => {
    for (const [testo, fondi] of TESTI) {
      for (const fondo of fondi) {
        const r = contrasto(t, testo, fondo);
        assert.ok(r >= 4.5, `${testo} su ${fondo}: ${r.toFixed(2)}`);
      }
    }
  });

  test(`tema ${nome} — testi tenui e accento: almeno 3:1 sulle schede`, () => {
    for (const [testo, fondo] of [['--inchiostro-3', '--pannello'], ['--accento', '--pannello'], ['--inchiostro-3', '--vuoto']]) {
      const r = contrasto(t, testo, fondo);
      assert.ok(r >= 3, `${testo} su ${fondo}: ${r.toFixed(2)}`);
    }
  });
}

test('dichiara color-scheme in tutti e due i temi', () => {
  assert.match(blocco(SCURO), /color-scheme:\s*dark/);
  assert.match(blocco(CHIARO), /color-scheme:\s*light/);
});

test('fuori dai due blocchi nessun colore scritto a mano, tranne il velo delle finestre', () => {
  const fuori = css.replace(blocco(SCURO), '').replace(blocco(CHIARO), '');
  const trova = (testo) => [...testo.matchAll(/(?<![\w-])#[0-9a-fA-F]{3,8}\b|rgba?\(/g)].map((m) => testo.slice(m.index, m.index + 40).split('\n')[0]);
  const senzaVelo = fuori.replace(/dialog::backdrop\s*\{[^}]*\}/, '');
  assert.deepStrictEqual(trova(senzaVelo), []);
  assert.strictEqual(trova(fuori).length, 1);
});

test('il velo delle finestre non usa variabili', () => {
  const regola = css.match(/dialog::backdrop\s*\{([^}]*)\}/);
  assert.ok(regola, 'manca la regola dialog::backdrop');
  assert.match(regola[1], /background:\s*rgba\(0, 0, 0, \.55\)/);
  assert.ok(!regola[1].includes('var('));
});

test('ogni variabile usata è definita', () => {
  const dichiarate = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const usate = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));
  // --comp arriva dallo stile scritto da JavaScript
  const mancanti = [...usate].filter((v) => v !== '--comp' && !dichiarate.has(v));
  assert.deepStrictEqual(mancanti, []);
});

test('il chiaro ridefinisce solo variabili dello scuro', () => {
  const scuro = variabili(blocco(SCURO));
  const estranee = Object.keys(variabili(blocco(CHIARO))).filter((v) => !(v in scuro));
  assert.deepStrictEqual(estranee, []);
  assert.ok(Object.keys(variabili(blocco(CHIARO))).length > 0, 'manca il blocco chiaro');
});

// tutto il blocco @supports che controlla color-mix, parentesi comprese
function bloccoSupports() {
  const inizio = css.indexOf('@supports (color: color-mix(in srgb, red, blue))');
  assert.ok(inizio >= 0, 'manca il controllo @supports');
  let livello = 0;
  for (let i = css.indexOf('{', inizio); i < css.length; i++) {
    if (css[i] === '{') livello++;
    if (css[i] === '}' && --livello === 0) return css.slice(inizio, i + 1);
  }
  throw new Error('blocco @supports non chiuso');
}

test('la mescola delle competizioni è protetta', () => {
  const protetto = bloccoSupports();
  assert.match(protetto, /--comp-vista:\s*color-mix\(/);
  const fuori = css.replace(protetto, '');
  assert.ok(!fuori.includes('color-mix('), 'color-mix fuori dal controllo');
  assert.match(fuori, /--comp-vista:\s*var\(--comp, transparent\)/);
});

test('le celle ferme hanno un fondo pieno', () => {
  const regole = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /\.colonna-op|\.tabella\.ampia/.test(m[1]));
  const fondi = regole.flatMap((m) => [...m[2].matchAll(/background(?:-color)?:\s*([^;]+);/g)].map((b) => b[1].trim()));
  assert.ok(fondi.length >= 4, `fondi trovati: ${fondi.length}`);
  for (const fondo of fondi) assert.match(fondo, /^var\(--(pannello|intestazione-tabella)\)$/);
  for (const t of Object.values(temi)) {
    assert.match(t['--pannello'], /^#[0-9a-f]{6}$/i);
    assert.match(t['--intestazione-tabella'], /^#[0-9a-f]{6}$/i);
  }
});

// Revisione finale: i due difetti nati dal menu laterale
test('☰ porta un pallino del colore dei numeri rossi', () => {
  const regola = css.match(/\.apri-menu\.con-avvisi::after\s*\{([^}]*)\}/);
  assert.ok(regola, 'manca la regola del pallino');
  assert.match(regola[1], /background:\s*var\(--errore\)/);
});

test('Operatori accanto al menu: i tasti vanno in colonna', () => {
  const inizio = css.indexOf('@media (min-width: 761px) and (max-width: 1240px)');
  assert.ok(inizio >= 0, 'manca la fascia 761-1240 px');
  const fascia = css.slice(inizio, css.indexOf('\n}', inizio));
  assert.match(fascia, /\.tabella-operatori td\.azioni\s*\{[^}]*white-space:\s*normal/);
  assert.match(fascia, /\.tabella-operatori td\.azioni \.bottone\s*\{[^}]*width:\s*100%/);
});

test('Operatori accanto al menu: un indirizzo lungo va a capo invece di allargare la tabella', () => {
  const inizio = css.indexOf('@media (min-width: 761px) and (max-width: 1240px)');
  const fascia = css.slice(inizio, css.indexOf('\n}', inizio));
  assert.match(fascia, /\.tabella-operatori td \.valore\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

test('Operatori accanto al menu: «Attivo» non si spezza e i tasti restano su una riga', () => {
  const inizio = css.indexOf('@media (min-width: 761px) and (max-width: 1240px)');
  const fascia = css.slice(inizio, css.indexOf('\n}', inizio));
  assert.match(fascia, /\.tabella-operatori \.etichetta\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(fascia, /\.tabella-operatori td\.azioni \.bottone\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(fascia, /\.tabella-operatori td\.azioni\s*\{[^}]*width:\s*1%/);
});
