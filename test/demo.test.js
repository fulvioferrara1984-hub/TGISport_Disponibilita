// Prove del backend demo, che replica le regole di Firebase: node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

global.window = { addEventListener() {} };
// memoria del browser in versione minima: la demo salva lì i suoi dati
const memoria = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
global.localStorage = memoria();
global.sessionStorage = memoria();
require('../app/comune.js');
require('../app/onsite.js');
require('../app/regole.js');
require('../app/demo.js');
const DO = window.DO, D = DO.demo;

const statoDemo = () => new Promise((fatto) => { const ferma = D.ascolta((s) => { ferma(); fatto(s); }); });

test('rinunciare: solo convocazioni in attesa e fuori dalla finestra di blocco', async () => {
  D.configura('operatore', () => {});
  await D.accediOperatore('DEMO-0001', false);
  const g = (n) => DO.aggiungi(DO.oggi(), n);
  await D.creaEventi([
    { tipo: 'partita', competizione: 'Serie A', data: g(1), titolo: 'Vicina', orario: '20:45', operatoreId: 'op-demo1' },
    { tipo: 'partita', competizione: 'Serie A', data: g(10), titolo: 'Lontana', orario: '20:45', operatoreId: 'op-demo1' },
    { tipo: 'partita', competizione: 'Serie A', data: g(11), titolo: 'Confermata', orario: '20:45', operatoreId: 'op-demo1' },
  ]);
  const ev = (await statoDemo()).eventi;
  const [vicina, lontana, confermata] = ['Vicina', 'Lontana', 'Confermata'].map((t) => ev.find((e) => e.titolo === t));
  await D.inviaConvocazioni([vicina, lontana, confermata], [], '');
  await D.rispondiConvocazione(confermata, 'confermato', '');
  await assert.rejects(D.rispondiConvocazione(vicina, 'rifiutato', ''), /chiama il supervisore/);
  await assert.rejects(D.rispondiConvocazione(confermata, 'rifiutato', ''), /chiama il supervisore/);
  await D.rispondiConvocazione(lontana, 'rifiutato', 'impegno');
  await D.rispondiConvocazione(vicina, 'confermato', '');
});

test('impostazioni dei promemoria nella demo', async () => {
  const imp = await D.leggiImpostazioni();
  assert.deepEqual([imp.promemoriaAttivi, imp.promemoriaGiorni, imp.promemoriaProgrammato, imp.ultimoPromemoria], [true, 3, true, null]);
  await assert.rejects(D.salvaImpostazioni({ emailSupervisori: 's@x.it', emailAttive: true, promemoriaAttivi: true, promemoriaGiorni: 8 }), /I giorni del promemoria vanno da 1 a 7\./);
  const vecchia = await D.salvaImpostazioni({ emailSupervisori: 's@x.it', emailAttive: true });
  assert.deepEqual([vecchia.promemoriaAttivi, vecchia.promemoriaGiorni, vecchia.emailSupervisori], [true, 3, 's@x.it']);
  const nuova = await D.salvaImpostazioni({ emailSupervisori: 's@x.it', emailAttive: true, promemoriaAttivi: false, promemoriaGiorni: 5 });
  assert.deepEqual([nuova.promemoriaAttivi, nuova.promemoriaGiorni], [false, 5]);
  assert.equal((await D.leggiImpostazioni()).promemoriaGiorni, 5);
});

// ---------------------------------------------------------------- deployment on-site (stesse condizioni delle regole di Firestore)

const tra = (n) => DO.aggiungi(DO.oggi(), n);
const comeSupervisore = () => D.configura('admin', () => {});
const comeOperatore = (codice) => { D.configura('operatore', () => {}); return D.accediOperatore(codice, false); };
const abilita = async (id, onsite) => {
  comeSupervisore();
  const o = (await statoDemo()).operatori.find((x) => x.id === id);
  await D.salvaOperatore(Object.assign({}, o, { onsite }));
};
const richiestaOnsite = (campi) => Object.assign({
  luogo: 'Roma', sport: 'Rugby', giorni: [{ data: tra(10), attivita: 'Travel Day' }, { data: tra(11), attivita: 'MD', partita: 'Italia-Francia' }],
  posti: { TL: 1, OP: 1 }, destinatari: ['op-demo1', 'op-demo3', 'op-demo4'],
}, campi);
const creaOnsite = async (campi, extra) => { comeSupervisore(); return (await D.creaOnsite(richiestaOnsite(campi), Object.assign({ compenso: 300, email: false, contatti: [] }, extra))).id; };
const scheda = async (id) => { comeSupervisore(); return (await statoDemo()).onsite.find((d) => d.id === id); };

test('on-site: richiesta valida e controlli', async () => {
  comeSupervisore();
  await assert.rejects(D.creaOnsite(richiestaOnsite({ luogo: '' }), { compenso: 300 }), /Scrivi il luogo\./);
  await assert.rejects(D.creaOnsite(richiestaOnsite({ destinatari: [] }), { compenso: 300 }), /Scegli almeno un operatore\./);
  await assert.rejects(D.creaOnsite(richiestaOnsite(), { compenso: -5 }), /Compenso non valido\./);
  const r = await D.creaOnsite(richiestaOnsite(), { compenso: 300, email: true, contatti: [{ id: 'op-demo1', nome: 'Luca Bianchi', email: 'l@x.it' }, { id: 'op-demo3', nome: 'Marco Esposito', email: '' }] });
  assert.deepEqual(r.senzaEmail, ['Marco Esposito']);
  const s = await statoDemo();
  const d = s.onsite.find((x) => x.id === r.id);
  assert.deepEqual([d.stato, d.da, d.a, d.accettatiTL, d.accettatiOP, d.rifiuti, d.esclusi], ['aperta', tra(10), tra(11), [], [], [], []]);
  assert.equal(s.compensiOnsite[r.id], 300);
});

test('on-site: l\'ultimo posto va al primo', async () => {
  await abilita('op-demo3', 'OP');
  await abilita('op-demo4', 'OP');
  assert.equal((await statoDemo()).operatori.find((o) => o.id === 'op-demo3').onsite, 'OP');
  const id = await creaOnsite({ posti: { TL: 0, OP: 1 } });
  await comeOperatore('DEMO-0003');
  await D.rispondiOnsite(id, true);
  await comeOperatore('DEMO-0004');
  await assert.rejects(D.rispondiOnsite(id, true), /Posti esauriti/);
  assert.deepEqual((await scheda(id)).accettatiOP, ['op-demo3']);
});

test('on-site: condizioni per accettare', async () => {
  await abilita('op-demo1', 'TL');
  await abilita('op-demo3', 'OP');
  await abilita('op-demo5', 'OP');
  const soloTL = await creaOnsite({ posti: { TL: 1, OP: 0 }, destinatari: ['op-demo1', 'op-demo3'] });
  await comeOperatore('DEMO-0005');
  await assert.rejects(D.rispondiOnsite(soloTL, true), /Richiesta non trovata\./);
  await comeOperatore('DEMO-0003');
  await assert.rejects(D.rispondiOnsite(soloTL, true), /non ha posti per la tua abilitazione/);
  await abilita('op-demo1', 'OP');                       // abilitazione cambiata dopo l'invio
  await comeOperatore('DEMO-0001');
  await assert.rejects(D.rispondiOnsite(soloTL, true), /non ha posti per la tua abilitazione/);
  await abilita('op-demo1', 'TL');
  await comeOperatore('DEMO-0001');
  await D.rispondiOnsite(soloTL, true);
  await assert.rejects(D.rispondiOnsite(soloTL, true), /Hai già accettato\./);
  comeSupervisore();
  await D.togliOnsite(soloTL, 'op-demo1');
  await comeOperatore('DEMO-0001');
  await assert.rejects(D.rispondiOnsite(soloTL, true), /ti ha tolto/);
  const chiusa = await creaOnsite({ posti: { TL: 1, OP: 0 } });
  await D.statoOnsite(chiusa, 'chiusa');
  await comeOperatore('DEMO-0001');
  await assert.rejects(D.rispondiOnsite(chiusa, true), /non accetta più risposte/);
  // primo giorno arrivato: non si accetta più
  const oggi = await creaOnsite({ posti: { TL: 1, OP: 0 } });
  const salvati = JSON.parse(localStorage.getItem('do-demo-dati'));
  const d = salvati.onsite.find((x) => x.id === oggi);
  d.giorni[0].data = d.da = DO.oggi();
  localStorage.setItem('do-demo-dati', JSON.stringify(salvati));
  await comeOperatore('DEMO-0001');
  await assert.rejects(D.rispondiOnsite(oggi, true), /non accetta più risposte/);
});

test('on-site: non posso e ripensamento', async () => {
  await abilita('op-demo3', 'OP');
  const id = await creaOnsite({});
  await comeOperatore('DEMO-0003');
  await D.rispondiOnsite(id, false);
  await assert.rejects(D.rispondiOnsite(id, false), /Hai già risposto\./);
  assert.deepEqual((await scheda(id)).rifiuti, ['op-demo3']);
  await comeOperatore('DEMO-0003');
  await D.rispondiOnsite(id, true);
  const d = await scheda(id);
  assert.deepEqual([d.rifiuti, d.accettatiOP], [[], ['op-demo3']]);
});

test('on-site: il supervisore toglie, modifica, chiude e annulla', async () => {
  await abilita('op-demo3', 'OP');
  await abilita('op-demo4', 'OP');
  const id = await creaOnsite({ posti: { TL: 0, OP: 2 } });
  await comeOperatore('DEMO-0003');
  await D.rispondiOnsite(id, true);
  comeSupervisore();
  await D.togliOnsite(id, 'op-demo3');
  let d = await scheda(id);
  assert.deepEqual([d.accettatiOP, d.esclusi], [[], ['op-demo3']]);
  await comeOperatore('DEMO-0004');
  await D.rispondiOnsite(id, true);
  comeSupervisore();
  await assert.rejects(D.modificaOnsite(id, { posti: { TL: 0, OP: 0 } }), /Indica almeno un posto\./);
  await assert.rejects(D.modificaOnsite(id, { posti: { TL: 1, OP: 0 } }), /meno di chi ha già accettato/);
  await D.modificaOnsite(id, { luogo: 'Milano', destinatariAggiunti: ['op-demo5'] }, { compenso: 450 });
  d = await scheda(id);
  assert.equal(d.luogo, 'Milano');
  assert.ok(d.destinatari.includes('op-demo5'));
  assert.equal((await statoDemo()).compensiOnsite[id], 450);
  await D.statoOnsite(id, 'chiusa');
  assert.equal((await scheda(id)).stato, 'chiusa');
  await D.statoOnsite(id, 'aperta');
  await D.statoOnsite(id, 'annullata');
  await assert.rejects(D.statoOnsite(id, 'aperta'), /Il deployment è annullato\./);
  await assert.rejects(D.modificaOnsite(id, { note: 'x' }), /Il deployment è annullato\./);
});

test('on-site: il compenso non arriva all\'operatore', async () => {
  await abilita('op-demo3', 'OP');
  await creaOnsite({});
  await comeOperatore('DEMO-0003');
  const lista = await D.mieiOnsite();
  assert.ok(lista.length);
  lista.forEach((d) => { assert.equal(d.compenso, undefined); assert.ok(d.destinatari.includes('op-demo3')); });
  assert.ok(!JSON.stringify(lista).includes('compens'));
});

test('on-site: voce in Aggiornamenti', async () => {
  await abilita('op-demo3', 'OP');
  const id = await creaOnsite({});
  await comeOperatore('DEMO-0003');
  await D.rispondiOnsite(id, true);
  comeSupervisore();
  const v = (await statoDemo()).invii.find((x) => x.tipo === 'onsite' && x.evento.id === id);
  assert.deepEqual([v.operatoreId, v.evento.stato, v.evento.ruolo, v.evento.luogo, v.evento.da], ['op-demo3', 'accettato', 'OP', 'Roma', tra(10)]);
});
