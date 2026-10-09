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
require('../app/richieste-evento.js');
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

// ---------------------------------------------------------------- richieste di disponibilità per un evento (stesse condizioni delle regole)

const nuovoEvento = async (titolo, campi) => {
  comeSupervisore();
  await D.creaEventi([Object.assign({ tipo: 'partita', competizione: 'Serie A', round: '9', data: tra(9), titolo, orario: '20:45' }, campi)]);
  return (await statoDemo()).eventi.find((e) => e.titolo === titolo);
};
const chiedi = (e, destinatari, extra) => {
  comeSupervisore();
  return D.chiediPerEvento(e, DO.richiesteEvento.copiaEvento(e, DO.regole.complete(null)), destinatari, Object.assign({ messaggio: '', email: false, contatti: [] }, extra));
};
const richiestaDi = async (id) => { comeSupervisore(); return (await statoDemo()).richiesteEvento.find((r) => r.id === id); };

test('richiesta per evento: creazione e nuovi destinatari', async () => {
  const e = await nuovoEvento('Richiesta-Creazione');
  await assert.rejects(chiedi(e, []), /Scegli almeno un operatore\./);
  const r = await chiedi(e, ['op-demo1', 'op-demo3'], { messaggio: ' Serve una mano ', email: true,
    contatti: [{ id: 'op-demo1', nome: 'Luca Bianchi', email: 'l@x.it' }, { id: 'op-demo3', nome: 'Marco Esposito', email: '' }] });
  assert.deepEqual(r.senzaEmail, ['Marco Esposito']);
  assert.deepEqual(await r.inviate, { email: 1 });
  let q = await richiestaDi(e.id);
  assert.deepEqual([q.destinatari, q.messaggio, q.aperta, q.assegnato, q.risposte, q.evento.titolo, q.evento.ritrovo],
    [['op-demo1', 'op-demo3'], 'Serve una mano', true, '', {}, 'Richiesta-Creazione', '16:45']);
  await D.allineaRichiestaEvento(e.id, { aperta: false, assegnato: 'op-demo5' });
  await chiedi(e, ['op-demo3', 'op-demo4']);
  q = await richiestaDi(e.id);
  assert.deepEqual([q.destinatari, q.messaggio, q.aperta, q.assegnato], [['op-demo1', 'op-demo3', 'op-demo4'], 'Serve una mano', true, '']);
});

test('richiesta per evento: solo per eventi scoperti, non annullati e non passati', async () => {
  const assegnato = await nuovoEvento('Richiesta-Assegnata', { operatoreId: 'op-demo2' });
  await assert.rejects(chiedi(assegnato, ['op-demo1']), /ha già un operatore/);
  await chiedi(Object.assign({}, assegnato, { stato: 'rifiutato' }), ['op-demo1']);
  assert.equal((await richiestaDi(assegnato.id)).aperta, true);
  await assert.rejects(chiedi(Object.assign({}, assegnato, { operatoreId: '', stato: 'annullato' }), ['op-demo1']), /L'evento è annullato\./);
});

test('richiesta per evento: risposte', async () => {
  const e = await nuovoEvento('Richiesta-Risposte');
  await chiedi(e, ['op-demo1', 'op-demo3']);
  await comeOperatore('DEMO-0003');
  await assert.rejects(D.rispondiRichiestaEvento(e.id, 'forse'), /Risposta non valida\./);
  await D.rispondiRichiestaEvento(e.id, 'si');
  await D.rispondiRichiestaEvento(e.id, 'no');
  await D.rispondiRichiestaEvento(e.id, 'si');
  const q = await richiestaDi(e.id);
  assert.deepEqual(Object.keys(q.risposte), ['op-demo3']);
  assert.equal(q.risposte['op-demo3'].r, 'si');
  assert.ok(DO.richiesteEvento.ms(q.risposte['op-demo3'].il) > 0);
  const voci = (await statoDemo()).invii.filter((x) => x.tipo === 'risposta-evento' && x.evento.id === e.id);
  assert.deepEqual(voci.map((v) => v.evento.risposta), ['si', 'no', 'si']);
  assert.deepEqual([voci[0].operatoreId, voci[0].evento.titolo, voci[0].evento.data, voci[0].modifiche], ['op-demo3', 'Richiesta-Risposte', tra(9), []]);
});

test('richiesta per evento: condizioni per rispondere', async () => {
  const e = await nuovoEvento('Richiesta-Condizioni');
  await chiedi(e, ['op-demo1']);
  await comeOperatore('DEMO-0003');
  await assert.rejects(D.rispondiRichiestaEvento(e.id, 'si'), /Richiesta non trovata\./);
  await assert.rejects(D.rispondiRichiestaEvento('non-esiste', 'si'), /Richiesta non trovata\./);
  comeSupervisore();
  await D.allineaRichiestaEvento(e.id, { aperta: false, assegnato: 'op-demo5' });
  await comeOperatore('DEMO-0001');
  await assert.rejects(D.rispondiRichiestaEvento(e.id, 'si'), /La richiesta è chiusa: il posto è già stato coperto\./);
  // giorno della partita passato
  const passata = await nuovoEvento('Richiesta-Passata');
  await chiedi(passata, ['op-demo1']);
  const salvati = JSON.parse(localStorage.getItem('do-demo-dati'));
  salvati.richiesteEvento.find((x) => x.id === passata.id).evento.data = tra(-1);
  localStorage.setItem('do-demo-dati', JSON.stringify(salvati));
  await comeOperatore('DEMO-0001');
  await assert.rejects(D.rispondiRichiestaEvento(passata.id, 'si'), /La partita è già passata\./);
  // il giorno stesso si risponde ancora (anche dentro la finestra di blocco)
  const oggi = await nuovoEvento('Richiesta-Oggi', { data: DO.oggi() });
  await chiedi(oggi, ['op-demo1']);
  await comeOperatore('DEMO-0001');
  await D.rispondiRichiestaEvento(oggi.id, 'si');
});

test('richiesta per evento: allineamento con l\'istante della modifica', async () => {
  const e = await nuovoEvento('Richiesta-Allinea');
  await chiedi(e, ['op-demo1']);
  const prima = (await richiestaDi(e.id)).aggiornata;
  await new Promise((r) => setTimeout(r, 5));
  const spostato = Object.assign({}, e, { orario: '18:00' });
  await D.allineaRichiestaEvento(e.id, { aperta: true, assegnato: '', evento: DO.richiesteEvento.copiaEvento(spostato, DO.regole.complete(null)), aggiornata: true });
  const q = await richiestaDi(e.id);
  assert.equal(q.evento.orario, '18:00');
  assert.ok(DO.richiesteEvento.ms(q.aggiornata) > DO.richiesteEvento.ms(prima));
  await D.allineaRichiestaEvento('non-esiste', { aperta: false, assegnato: '' });
});

test('richiesta per evento: l\'operatore vede solo le sue', async () => {
  const e = await nuovoEvento('Richiesta-Mie');
  await chiedi(e, ['op-demo1']);
  await comeOperatore('DEMO-0001');
  assert.ok((await D.mieRichiesteEvento()).some((r) => r.id === e.id));
  await comeOperatore('DEMO-0003');
  assert.ok(!(await D.mieRichiesteEvento()).some((r) => r.id === e.id));
});

test('richiesta per evento: richiederla di nuovo senza cambi non segna le risposte come vecchie', async () => {
  const e = await nuovoEvento('Richiesta-Di-Nuovo');
  await chiedi(e, ['op-demo1']);
  const prima = (await richiestaDi(e.id)).aggiornata;
  await new Promise((r) => setTimeout(r, 5));
  comeSupervisore();
  const copia = DO.richiesteEvento.copiaEvento(e, DO.regole.complete(null));
  await D.chiediPerEvento(e, Object.fromEntries(Object.entries(copia).reverse()), ['op-demo3'], { messaggio: '', email: false, contatti: [] });
  assert.equal((await richiestaDi(e.id)).aggiornata, prima);
});

test('richiesta per evento: due dashboard che correggono insieme non spostano l\'istante della modifica', async () => {
  const e = await nuovoEvento('Richiesta-Due-Dashboard');
  await chiedi(e, ['op-demo1']);
  const spostata = DO.richiesteEvento.copiaEvento(Object.assign({}, e, { orario: '18:00' }), DO.regole.complete(null));
  const campi = { aperta: true, assegnato: '', evento: spostata, aggiornata: true };
  await D.allineaRichiestaEvento(e.id, campi);
  const prima = (await richiestaDi(e.id)).aggiornata;
  await new Promise((r) => setTimeout(r, 5));
  await D.allineaRichiestaEvento(e.id, campi);
  assert.equal((await richiestaDi(e.id)).aggiornata, prima);
});

test('richiesta per evento: all\'operatore solo quelle da oggi in poi', async () => {
  const e = await nuovoEvento('Richiesta-Vecchia');
  await chiedi(e, ['op-demo1']);
  const salvati = JSON.parse(localStorage.getItem('do-demo-dati'));
  salvati.richiesteEvento.find((x) => x.id === e.id).evento.data = tra(-2);
  localStorage.setItem('do-demo-dati', JSON.stringify(salvati));
  await comeOperatore('DEMO-0001');
  assert.ok(!(await D.mieRichiesteEvento()).some((r) => r.id === e.id));
});

