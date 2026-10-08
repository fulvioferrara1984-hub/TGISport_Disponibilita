/* Disponibilità Ops — archivio di prova: stessa interfaccia di dati-firebase.js, ma tutto resta nel browser.
 * Si usa quando in config.js manca FIREBASE. Password supervisori: demo · codici operatori: DEMO-0001 … DEMO-0008 */
(function (DO) {
  'use strict';

  const CHIAVE = 'do-demo-dati';
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const due = (n) => String(n).padStart(2, '0');

  function iniziali() {
    const nomi = [
      ['Luca Bianchi', 'Operatore camera'], ['Giulia Conti', 'Regia'], ['Marco Esposito', 'Operatore camera'], ['Sara Ricci', 'Grafica'],
      ['Davide Marino', 'Audio'], ['Elena Greco', 'Produzione'], ['Paolo Gallo', 'Operatore camera'], ['Chiara Lombardi', 'Runner'],
    ];
    const operatori = nomi.map(([nome, mansione], i) => ({
      id: 'op-demo' + (i + 1), nome, mansione, email: nome.toLowerCase().replace(' ', '.') + '@esempio.it',
      telefono: '+39 333 000 00' + due(i + 1), attivo: true, codice: 'DEMO000' + (i + 1), ultimoInvio: '',
    }));
    const disponibilita = {}, invii = [];
    const lun = DO.lunedi(DO.oggi());
    operatori.slice(0, 6).forEach((o, k) => {
      disponibilita[o.id] = {};
      for (let i = 0; i < 14; i++) {
        const r = (k * 7 + i * 3) % 10;
        if (i > 9 && k % 2) continue;
        disponibilita[o.id][DO.aggiungi(lun, i)] = r < 6 ? { s: 'D', n: '' } : r < 8 ? { s: 'P', n: 'Solo dalle 18:00' } : { s: 'A', n: '' };
      }
      o.ultimoInvio = new Date(Date.now() - (k + 1) * 3600e3 * 5).toISOString();
      invii.push({ id: 'inv' + k, quando: o.ultimoInvio, operatoreId: o.id, nome: o.nome, letto: k > 1,
        modifiche: [{ d: DO.aggiungi(lun, 2 + k), da: '', a: 'D', n: '' }, { d: DO.aggiungi(lun, 4 + k), da: 'D', a: 'A', n: '' }] });
    });
    invii.sort((a, b) => (a.quando < b.quando ? -1 : 1));
    return { operatori, disponibilita, invii, richieste: [], password: 'demo', impostazioni: { emailSupervisori: 'supervisori@esempio.it', emailAttive: true } };
  }

  let dati = null, ruolo = '', alloScadere = null, utenteDemo = null;
  const ascoltatori = new Set();

  function carica() {
    try { const d = JSON.parse(localStorage.getItem(CHIAVE)); if (d && d.richieste) { dati = d; return; } } catch (e) { /* si riparte */ }
    dati = iniziali();
  }
  function salva() {
    try { localStorage.setItem(CHIAVE, JSON.stringify(dati)); } catch (e) { /* solo in memoria */ }
    ascoltatori.forEach((cb) => cb());
  }
  // un'altra scheda (es. la pagina operatore) ha cambiato i dati: come l'ascolto in tempo reale di Firebase
  window.addEventListener('storage', (e) => { if (e.key === CHIAVE) { carica(); ascoltatori.forEach((cb) => cb()); } });

  const pubblico = (o) => ({ id: o.id, nome: o.nome, mansione: o.mansione, email: o.email, telefono: o.telefono, attivo: o.attivo, ultimoInvio: o.ultimoInvio });
  const norm = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nuovoCodiceDemo = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 8; i++) c += a[Math.floor(Math.random() * 32)]; return c; };
  const formato = (c) => c.slice(0, 4) + '-' + c.slice(4);
  const chiaveSessione = () => 'do-demo-sessione-' + ruolo;

  function configura(r, scaduta) {
    ruolo = r;
    alloScadere = scaduta;
    carica();
  }

  async function utente() {
    const s = DO.leggi(chiaveSessione());
    if (!s) return null;
    if (ruolo === 'admin') return { admin: true };
    const op = dati.operatori.find((o) => o.id === s.id && o.attivo);
    if (!op) { DO.scrivi(chiaveSessione(), null); return null; }
    utenteDemo = op;
    return { operatore: pubblico(op) };
  }

  async function accediOperatore(codice, ricorda) {
    await pausa(150);
    carica();
    const op = dati.operatori.find((o) => o.codice === norm(codice));
    if (!op) throw new Error('Codice non valido.');
    if (!op.attivo) throw new Error('Il tuo accesso è disattivato: contatta i supervisori.');
    DO.scrivi(chiaveSessione(), { id: op.id }, ricorda);
    DO.ricorda(ricorda);
    utenteDemo = op;
    return pubblico(op);
  }

  async function accediSupervisore(email, password, ricorda) {
    await pausa(150);
    if (password !== dati.password) throw new Error('Email o password errata.');
    DO.scrivi(chiaveSessione(), { admin: true }, ricorda);
    DO.ricorda(ricorda);
    return { admin: true };
  }

  async function esci() { DO.scrivi(chiaveSessione(), null); }
  const soloFirebase = async () => { throw Object.assign(new Error('Nella demo basta la password "demo".'), { info: true }); };

  function operatoreValido() {
    carica();
    const op = utenteDemo && dati.operatori.find((o) => o.id === utenteDemo.id && o.attivo);
    if (!op) {
      DO.scrivi(chiaveSessione(), null);
      if (alloScadere) alloScadere('Il tuo accesso è disattivato: contatta i supervisori.');
      throw new Error('Accesso non più valido.');
    }
    return op;
  }

  async function mieDisponibilita() {
    await pausa(150);
    const op = operatoreValido(), oggi = DO.oggi();
    const richieste = dati.richieste.filter((x) => x.attiva && x.a >= oggi && x.destinatari.includes(op.id))
      .map((x) => ({ id: x.id, da: x.da, a: x.a, messaggio: x.messaggio, creata: x.creata }));
    return { operatore: pubblico(op), giorni: Object.assign({}, dati.disponibilita[op.id]), richieste, oggi, limite: DO.limite() };
  }

  async function inviaDisponibilita(giorni) {
    await pausa(200);
    const op = operatoreValido();
    const mappa = dati.disponibilita[op.id] = dati.disponibilita[op.id] || {};
    const adesso = new Date().toISOString(), modifiche = [];
    Object.keys(giorni).sort().filter((d) => d >= DO.oggi() && d <= DO.limite()).forEach((d) => {
      const prima = mappa[d] || {}, s = giorni[d].s || '', n = String(giorni[d].n || '').trim();
      if ((prima.s || '') === s && (prima.n || '') === n) return;
      modifiche.push({ d, da: prima.s || '', a: s, n });
      if (!s && !n) delete mappa[d]; else mappa[d] = { s, n, t: adesso };
    });
    op.ultimoInvio = adesso;
    dati.invii.push({ id: 'inv' + Date.now(), quando: adesso, operatoreId: op.id, nome: op.nome, modifiche, letto: false });
    salva();
    return { inviatoIl: adesso, modifiche: modifiche.length };
  }

  function ascolta(cb) {
    const invia = () => cb({
      operatori: dati.operatori.map(pubblico),
      disponibilita: JSON.parse(JSON.stringify(dati.disponibilita)),
      invii: dati.invii.slice(-60).reverse(),
      richieste: dati.richieste.filter((x) => x.attiva).slice().reverse(),
    });
    ascoltatori.add(invia);
    setTimeout(invia, 200);
    return () => ascoltatori.delete(invia);
  }

  async function segnaLetti(ids) {
    dati.invii.forEach((x) => { if (ids.includes(x.id)) x.letto = true; });
    salva();
  }

  async function salvaOperatore(o) {
    await pausa(150);
    const campi = { nome: String(o.nome || '').trim(), mansione: (o.mansione || '').trim(), email: (o.email || '').trim(), telefono: (o.telefono || '').trim(), attivo: o.attivo !== false };
    if (!campi.nome) throw new Error('Il nome è obbligatorio.');
    if (o.id) {
      const op = dati.operatori.find((x) => x.id === o.id);
      Object.assign(op, campi);
      salva();
      return { operatore: pubblico(op) };
    }
    const op = Object.assign({ id: 'op-' + Date.now().toString(36), codice: nuovoCodiceDemo(), ultimoInvio: '' }, campi);
    dati.operatori.push(op);
    salva();
    return { operatore: pubblico(op), codice: formato(op.codice) };
  }

  async function nuovoCodice(id) {
    const op = dati.operatori.find((x) => x.id === id);
    op.codice = nuovoCodiceDemo();
    salva();
    return { codice: formato(op.codice) };
  }

  async function eliminaOperatore(id) {
    dati.operatori = dati.operatori.filter((x) => x.id !== id);
    delete dati.disponibilita[id];
    salva();
  }

  async function creaRichiesta(r) {
    await pausa(150);
    if (!r.da || !r.a || r.da > r.a) throw new Error('Periodo non valido.');
    if (r.a < DO.oggi()) throw new Error('Il periodo è già passato.');
    if (!r.destinatari.length) throw new Error('Scegli almeno un operatore.');
    const id = 'ric' + Date.now();
    dati.richieste.push({ id, creata: new Date().toISOString(), da: r.da, a: r.a, messaggio: String(r.messaggio || '').trim(), destinatari: r.destinatari, attiva: true });
    salva();
    const conEmail = r.email ? r.contatti.filter((c) => c.email) : [];
    return { id, senzaEmail: r.email ? r.contatti.filter((c) => !c.email).map((c) => c.nome) : [], inviate: pausa(800).then(() => ({ email: conEmail.length })) };
  }

  async function chiudiRichiesta(id) {
    const x = dati.richieste.find((y) => y.id === id);
    if (x) x.attiva = false;
    salva();
  }

  async function leggiImpostazioni() { await pausa(150); return dati.impostazioni; }
  async function salvaImpostazioni(x) {
    dati.impostazioni = { emailSupervisori: x.emailSupervisori || '', emailAttive: x.emailAttive !== false };
    salva();
    return dati.impostazioni;
  }
  async function cambiaPassword(attuale, nuova) {
    if (attuale !== dati.password) throw new Error('La password attuale non è corretta.');
    if (String(nuova).length < 8) throw new Error('La nuova password deve avere almeno 8 caratteri.');
    dati.password = nuova;
    salva();
  }

  DO.demo = {
    configura, utente, accediOperatore, accediSupervisore, creaSupervisore: soloFirebase, recuperaPassword: soloFirebase, esci,
    mieDisponibilita, inviaDisponibilita,
    ascolta, segnaLetti, salvaOperatore, nuovoCodice, eliminaOperatore, creaRichiesta, chiudiRichiesta,
    leggiImpostazioni, salvaImpostazioni, cambiaPassword,
    azzera: () => { try { localStorage.removeItem(CHIAVE); } catch (e) { /* niente */ } },
  };
})(window.DO = window.DO || {});
