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
      contratto: i % 4 === 3 ? 'Coop' : 'P.IVA', ruolo: i < 2 ? 'TL' : i === 2 ? 'SUP' : 'OP', onsite: ['TL', '', 'OP', '', 'OP'][i] || '',
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
    // qualche evento: una giornata di Serie A con i turni Remote TL e Remote Support, una partita di Champions
    const partite = [[5, '15:00', 'Venezia-Napoli', 'op-demo3'], [5, '18:00', 'Bologna-Inter', 'op-demo4'], [5, '20:45', 'Roma-Genoa', 'op-demo5'],
      [6, '12:30', 'Udinese-Lecce', 'op-demo7'], [6, '15:00', 'Fiorentina-Como', ''], [6, '20:45', 'Juventus-Lazio', '']];
    const eventi = partite.map(([g, orario, titolo, op], i) => ({
      id: 'ev' + i, tipo: 'partita', competizione: 'Serie A', round: '7', sport: 'Calcio', data: DO.aggiungi(lun, g), titolo, orario,
      convocazione: '', operatoreId: op, stato: op ? (i < 2 ? 'confermato' : 'assegnato') : 'da-assegnare', inviata: op && i < 2, gettone: '', note: '',
      daSostituire: false, risposta: '', storico: [],
    }));
    eventi.push({ id: 'evs1', tipo: 'supervisione', competizione: 'Remote TL', round: '', sport: '', data: DO.aggiungi(lun, 5), titolo: 'Remote TL',
      orario: '', convocazione: '10:00', convocazioneCalcolata: '10:00', operatoreId: 'op-demo1', stato: 'convocato', inviata: true, gettone: '', note: '', daSostituire: false, risposta: '', storico: [] });
    eventi.push({ id: 'evs2', tipo: 'support', competizione: 'Remote Support', round: '', sport: '', data: DO.aggiungi(lun, 6), titolo: 'Remote Support',
      orario: '', convocazione: '12:00', convocazioneCalcolata: '12:00', operatoreId: '', stato: 'da-assegnare', inviata: false, gettone: '', note: '', daSostituire: false, risposta: '', storico: [] });
    eventi.push({ id: 'evc1', tipo: 'partita', competizione: 'Champions League', round: 'League Phase', sport: 'Calcio', data: DO.aggiungi(lun, 2), titolo: 'Feyenoord-Como',
      orario: '18:45', convocazione: '', convocazioneCalcolata: '14:45', operatoreId: 'op-demo2', stato: 'confermato', inviata: true, gettone: '', note: '', daSostituire: false, risposta: '', storico: [] });
    return { operatori, disponibilita, invii, richieste: [], eventi, regole: null, operativo: null, password: 'demo', impostazioni: { emailSupervisori: 'supervisori@esempio.it', emailAttive: true },
      onsite: [], onsiteRiservato: {}, richiesteEvento: [] };
  }

  let dati = null, ruolo = '', alloScadere = null, utenteDemo = null;
  const ascoltatori = new Set();

  function carica() {
    try { const d = JSON.parse(localStorage.getItem(CHIAVE)); if (d && d.eventi) { dati = Object.assign({ onsite: [], onsiteRiservato: {}, richiesteEvento: [] }, d); return; } } catch (e) { /* si riparte */ }
    dati = iniziali();
  }
  function salva() {
    try { localStorage.setItem(CHIAVE, JSON.stringify(dati)); } catch (e) { /* solo in memoria */ }
    ascoltatori.forEach((cb) => cb());
  }
  // un'altra scheda (es. la pagina operatore) ha cambiato i dati: come l'ascolto in tempo reale di Firebase
  window.addEventListener('storage', (e) => { if (e.key === CHIAVE) { carica(); ascoltatori.forEach((cb) => cb()); } });

  const pubblico = (o) => ({ id: o.id, nome: o.nome, mansione: o.mansione, email: o.email, telefono: o.telefono, attivo: o.attivo, ultimoInvio: o.ultimoInvio,
    contratto: o.contratto || '', ruolo: o.ruolo || 'OP', onsite: ['TL', 'OP'].includes(o.onsite) ? o.onsite : '' });
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
      sincronizzato: true,
      operatori: dati.operatori.map(pubblico),
      disponibilita: JSON.parse(JSON.stringify(dati.disponibilita)),
      invii: dati.invii.slice(-60).reverse(),
      richieste: dati.richieste.filter((x) => x.attiva).slice().reverse(),
      eventi: JSON.parse(JSON.stringify(dati.eventi)),
      regole: DO.regole.complete(dati.regole),
      operativo: Object.assign({}, DO.OPERATIVO_PREDEFINITO, dati.operativo || {}),
      onsite: JSON.parse(JSON.stringify(dati.onsite)),
      compensiOnsite: Object.fromEntries(Object.entries(dati.onsiteRiservato).map(([id, r]) => [id, r.compenso])),
      richiesteEvento: JSON.parse(JSON.stringify(dati.richiesteEvento)),
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
    const campi = { nome: String(o.nome || '').trim(), mansione: (o.mansione || '').trim(), email: (o.email || '').trim(), telefono: (o.telefono || '').trim(), attivo: o.attivo !== false,
      contratto: o.contratto || '', ruolo: ['TL', 'SUP'].includes(o.ruolo) ? o.ruolo : 'OP', onsite: ['TL', 'OP'].includes(o.onsite) ? o.onsite : '' };
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

  // ---------- eventi e convocazioni ----------
  const voce = (testo) => ({ quando: new Date().toISOString(), testo });
  async function creaEventi(lista) {
    lista.forEach((e, i) => dati.eventi.push(Object.assign({ convocazione: '', note: '', gettone: '', daSostituire: false, risposta: '' }, e, {
      id: 'ev' + Date.now().toString(36) + i, tipo: DO.tipoEvento(e.tipo), operatoreId: e.operatoreId || '', stato: e.operatoreId ? 'assegnato' : 'da-assegnare', inviata: false, storico: [voce('Creato')],
    })));
    salva();
  }
  async function aggiornaEvento(id, campi, nota) {
    const e = dati.eventi.find((x) => x.id === id);
    Object.assign(e, campi);
    if (nota) e.storico = (e.storico || []).concat(voce(nota));
    salva();
  }
  async function eliminaEvento(id) { dati.eventi = dati.eventi.filter((x) => x.id !== id); salva(); }
  async function inviaConvocazioni(eventi, contatti) {
    eventi.forEach((x) => { const e = dati.eventi.find((y) => y.id === x.id); Object.assign(e, { inviata: true, stato: 'convocato', convocazioneCalcolata: x.convocazioneCalcolata, fineCalcolata: x.fineCalcolata || '' }); });
    salva();
    return { inviate: pausa(600).then(() => ({ email: contatti.filter((c) => c.email).length })) };
  }
  async function salvaRegole(r) { dati.regole = r; salva(); }
  async function leggiOperativo() { await pausa(100); return Object.assign({}, DO.OPERATIVO_PREDEFINITO, dati.operativo || {}); }
  async function salvaOperativo(o) { dati.operativo = { telefono: String(o.telefono || ''), giorniBlocco: o.giorniBlocco }; salva(); }
  async function importa(p) {
    p.operatori.forEach((o) => { if (!dati.operatori.some((x) => x.id === o.id)) dati.operatori.push(Object.assign({ email: '', telefono: '', attivo: true, ultimoInvio: '', codice: '' }, o)); });
    p.eventi.forEach((e) => { dati.eventi = dati.eventi.filter((x) => x.id !== e.id); dati.eventi.push(e); });
    p.disponibilita.forEach((d) => { dati.disponibilita[d.id] = d.giorni; });
    if (p.regole) dati.regole = p.regole;
    salva();
  }
  async function mieConvocazioni() {
    await pausa(150);
    const op = operatoreValido();
    return dati.eventi.filter((e) => e.operatoreId === op.id && e.inviata).map((e) => Object.assign({}, e, { note: undefined, gettone: undefined }));
  }
  async function rispondiConvocazione(ev, stato, motivo) {
    await pausa(150);
    const op = operatoreValido();
    const evento = dati.eventi.find((e) => e.id === ev.id);
    // come le regole di Firebase: si rinuncia solo a una convocazione in attesa e fuori dalla finestra di blocco
    const giorni = (dati.operativo && Number.isInteger(dati.operativo.giorniBlocco)) ? dati.operativo.giorniBlocco : DO.OPERATIVO_PREDEFINITO.giorniBlocco;
    if (stato === 'rifiutato' && (evento.stato !== 'convocato' || DO.bloccato(evento.data, DO.oggi(), giorni))) throw new Error(DO.NON_PIU_RINUNCIABILE);
    Object.assign(evento, { stato, risposta: motivo || '', rispostaIl: new Date().toISOString() });
    dati.invii.push({ id: 'inv' + Date.now(), quando: new Date().toISOString(), operatoreId: op.id, nome: op.nome, modifiche: [], letto: false, tipo: 'convocazione',
      evento: { id: ev.id, titolo: DO.mansione(ev.tipo) || ev.titolo, tipo: DO.tipoEvento(ev.tipo), data: ev.data,
        competizione: DO.turnoRemoto(ev.tipo) ? '' : ev.competizione || '', stato, motivo: motivo || '' } });
    salva();
  }

  // come lo script delle email: i promemoria si salvano solo se arrivano, con giorni da 1 a 7
  const PROMEMORIA_DEMO = { promemoriaAttivi: true, promemoriaGiorni: 3, ultimoPromemoria: null, promemoriaProgrammato: true };
  async function leggiImpostazioni() { await pausa(150); return Object.assign({}, PROMEMORIA_DEMO, dati.impostazioni); }
  async function salvaImpostazioni(x) {
    const giorni = x.promemoriaGiorni === undefined ? undefined : Number(x.promemoriaGiorni === '' || x.promemoriaGiorni === null ? NaN : x.promemoriaGiorni);
    if (giorni !== undefined && !(Number.isInteger(giorni) && giorni >= 1 && giorni <= 7)) throw new Error('I giorni del promemoria vanno da 1 a 7.');
    const prima = Object.assign({}, PROMEMORIA_DEMO, dati.impostazioni);
    dati.impostazioni = Object.assign(prima, { emailSupervisori: x.emailSupervisori || '', emailAttive: x.emailAttive !== false },
      x.promemoriaAttivi === undefined ? {} : { promemoriaAttivi: x.promemoriaAttivi === true },
      giorni === undefined ? {} : { promemoriaGiorni: giorni });
    salva();
    return Object.assign({}, dati.impostazioni);
  }
  // ---------- deployment on-site (stesse condizioni delle regole di Firestore) ----------
  const copia = (x) => JSON.parse(JSON.stringify(x));
  function deployment(id) {
    const d = dati.onsite.find((x) => x.id === id);
    if (!d) throw new Error('Deployment non trovato.');
    return d;
  }
  const contattiEmail = (extra) => {
    const contatti = (extra && extra.email ? extra.contatti || [] : []);
    return { senzaEmail: contatti.filter((c) => !c.email).map((c) => c.nome), conEmail: contatti.filter((c) => c.email) };
  };

  async function creaOnsite(d, extra) {
    await pausa(150);
    const scheda = DO.onsite.normalizza(d, DO.oggi());
    const destinatari = Array.from(new Set(d.destinatari || []));
    if (!destinatari.length) throw new Error('Scegli almeno un operatore.');
    const compenso = DO.onsite.compensoValido(extra && extra.compenso);
    const id = 'ons' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
    dati.onsite.push(Object.assign({ id, creato: new Date().toISOString() }, scheda,
      { destinatari, accettatiTL: [], accettatiOP: [], rifiuti: [], esclusi: [], stato: 'aperta' }));
    dati.onsiteRiservato[id] = { compenso };
    salva();
    const { senzaEmail, conEmail } = contattiEmail(extra);
    return { id, senzaEmail, inviate: pausa(800).then(() => ({ email: conEmail.length })) };
  }

  async function modificaOnsite(id, campi, extra) {
    await pausa(150);
    const d = deployment(id);
    if (d.stato === 'annullata') throw new Error('Il deployment è annullato.');
    const nuovi = DO.onsite.modifiche(d, campi || {});
    const compenso = extra && extra.compenso !== undefined ? DO.onsite.compensoValido(extra.compenso) : undefined;
    Object.assign(d, nuovi);
    if (compenso !== undefined) dati.onsiteRiservato[id] = { compenso };
    salva();
    const { senzaEmail, conEmail } = contattiEmail(extra);
    return { senzaEmail, inviate: pausa(800).then(() => ({ email: conEmail.length })) };
  }

  async function togliOnsite(id, idOperatore) {
    const d = deployment(id);
    d.accettatiTL = d.accettatiTL.filter((x) => x !== idOperatore);
    d.accettatiOP = d.accettatiOP.filter((x) => x !== idOperatore);
    if (!d.esclusi.includes(idOperatore)) d.esclusi.push(idOperatore);
    salva();
  }

  async function statoOnsite(id, stato) {
    const d = deployment(id);
    if (!['aperta', 'chiusa', 'annullata'].includes(stato)) throw new Error('Stato non valido.');
    if (d.stato === 'annullata' && stato !== 'annullata') throw new Error('Il deployment è annullato.');
    d.stato = stato;
    salva();
  }

  async function mieiOnsite() {
    await pausa(100);
    const op = operatoreValido();
    return copia(dati.onsite.filter((d) => d.destinatari.includes(op.id)));
  }

  async function rispondiOnsite(id, accetto) {
    await pausa(150);
    const op = operatoreValido();
    const d = dati.onsite.find((x) => x.id === id);
    if (!d || !d.destinatari.includes(op.id)) throw new Error('Richiesta non trovata.');
    const stato = DO.onsite.statoPerOperatore(d, op, DO.oggi());
    if (accetto) {
      if (!['da-rispondere', 'rifiutato'].includes(stato)) throw new Error(DO.onsite.MESSAGGI[stato]);
      d['accettati' + op.onsite].push(op.id);
      d.rifiuti = d.rifiuti.filter((x) => x !== op.id);
    } else {
      // come le regole: «non posso» solo con la richiesta aperta, prima del primo giorno, una volta sola
      if (['accettato', 'annullato', 'escluso', 'scaduta'].includes(stato)) throw new Error(DO.onsite.MESSAGGI[stato]);
      if (d.rifiuti.includes(op.id)) throw new Error('Hai già risposto.');
      d.rifiuti.push(op.id);
    }
    dati.invii.push({ id: 'inv' + Date.now(), quando: new Date().toISOString(), operatoreId: op.id, nome: op.nome, modifiche: [], letto: false, tipo: 'onsite',
      evento: { id: d.id, luogo: d.luogo, da: d.da, a: d.a, stato: accetto ? 'accettato' : 'rifiutato', ruolo: accetto ? op.onsite : '' } });
    salva();
  }

  // ---------- richieste di disponibilità per un evento (stesse condizioni delle regole di Firestore) ----------
  async function chiediPerEvento(evento, copiaEv, destinatari, extra) {
    await pausa(150);
    const dest = Array.from(new Set(destinatari || []));
    if (!dest.length) throw new Error('Scegli almeno un operatore.');
    const motivo = DO.richiesteEvento.chiedibile(evento, DO.oggi());
    if (motivo) throw new Error(motivo);
    const messaggio = String((extra && extra.messaggio) || '').trim().slice(0, 300);
    const adesso = new Date().toISOString();
    const r = dati.richiesteEvento.find((x) => x.id === evento.id);
    if (r) {
      const cambiata = DO.richiesteEvento.copiaDiversa(r.evento, copiaEv);
      Object.assign(r, { destinatari: Array.from(new Set(r.destinatari.concat(dest))), evento: copiaEv, aperta: true, assegnato: '' },
        messaggio ? { messaggio } : {}, cambiata ? { aggiornata: adesso } : {});
    } else {
      dati.richiesteEvento.push({ id: evento.id, destinatari: dest, messaggio, evento: copiaEv, aggiornata: adesso, risposte: {}, aperta: true, assegnato: '', creata: adesso });
    }
    salva();
    const { senzaEmail, conEmail } = contattiEmail(extra);
    return { senzaEmail, inviate: pausa(800).then(() => ({ email: conEmail.length })) };
  }

  async function allineaRichiestaEvento(id, campi) {
    const r = dati.richiesteEvento.find((x) => x.id === id);
    const nuovi = r && DO.richiesteEvento.campiDaScrivere(r, campi);
    if (!nuovi) return;
    Object.assign(r, nuovi, nuovi.aggiornata ? { aggiornata: new Date().toISOString() } : {});
    salva();
  }

  async function mieRichiesteEvento() {
    await pausa(100);
    const op = operatoreValido();
    return copia(dati.richiesteEvento.filter((r) => r.destinatari.includes(op.id) && r.evento.data >= DO.oggi()));
  }

  async function rispondiRichiestaEvento(id, risposta) {
    await pausa(150);
    if (!['si', 'no'].includes(risposta)) throw new Error('Risposta non valida.');
    const op = operatoreValido();
    const r = dati.richiesteEvento.find((x) => x.id === id);
    if (!r || !r.destinatari.includes(op.id)) throw new Error('Richiesta non trovata.');
    if (r.evento.data < DO.oggi()) throw new Error('La partita è già passata.');
    if (!r.aperta) throw new Error('La richiesta è chiusa: il posto è già stato coperto.');
    const adesso = new Date().toISOString();
    r.risposte[op.id] = { r: risposta, il: adesso };
    dati.invii.push({ id: 'inv' + Date.now() + Math.floor(Math.random() * 1e4), quando: adesso, operatoreId: op.id, nome: op.nome, modifiche: [], letto: false, tipo: 'risposta-evento',
      evento: { id, titolo: r.evento.titolo, data: r.evento.data, risposta } });
    salva();
  }

  async function cambiaPassword(attuale, nuova) {
    if (attuale !== dati.password) throw new Error('La password attuale non è corretta.');
    if (String(nuova).length < 8) throw new Error('La nuova password deve avere almeno 8 caratteri.');
    dati.password = nuova;
    salva();
  }

  DO.demo = {
    configura, utente, accediOperatore, accediSupervisore, creaSupervisore: soloFirebase, recuperaPassword: soloFirebase, esci,
    mieDisponibilita, inviaDisponibilita, mieConvocazioni, rispondiConvocazione,
    ascolta, segnaLetti, salvaOperatore, nuovoCodice, eliminaOperatore, creaRichiesta, chiudiRichiesta,
    creaEventi, aggiornaEvento, eliminaEvento, inviaConvocazioni, salvaRegole, importa, leggiOperativo, salvaOperativo,
    leggiImpostazioni, salvaImpostazioni, cambiaPassword,
    creaOnsite, modificaOnsite, togliOnsite, statoOnsite, mieiOnsite, rispondiOnsite,
    chiediPerEvento, allineaRichiestaEvento, mieRichiesteEvento, rispondiRichiestaEvento,
    azzera: () => { try { localStorage.removeItem(CHIAVE); } catch (e) { /* niente */ } },
  };
})(window.DO = window.DO || {});
