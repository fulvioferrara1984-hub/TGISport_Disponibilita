/**
 * Disponibilità Ops · TGI Sport — backend
 * Google Apps Script legato al Google Sheet: riceve le chiamate delle pagine pubblicate
 * su GitHub Pages, controlla codici e password e salva tutto nel foglio.
 * Le password non stanno mai nel repository: sono nelle proprietà dello script.
 */

const CONFIG = {
  FUSO: 'Europe/Rome',
  SETTIMANE_AVANTI: 12,         // settimane future che gli operatori possono compilare
  DURATA_SESSIONE_GIORNI: 30,   // dopo quanto tempo bisogna rientrare
  MAX_TENTATIVI: 20,            // accessi falliti tollerati ogni 15 minuti, poi blocco temporaneo
};

const INTESTAZIONI = {
  Operatori: ['ID', 'Nome', 'Mansione', 'Email', 'Telefono', 'Attivo', 'CodiceHash', 'Versione', 'UltimoInvio', 'Creato'],
  Disponibilita: ['OperatoreID', 'Data', 'Stato', 'Nota', 'Aggiornato'],
  Invii: ['ID', 'Quando', 'OperatoreID', 'Nome', 'Modifiche', 'Letto'],
  Richieste: ['ID', 'Creata', 'Da', 'A', 'Messaggio', 'Destinatari', 'Attiva'],
};

const STATI = { D: 'Disponibile', P: 'Parziale', A: 'Non disponibile' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const AZIONI_OPERATORE = { mieDisponibilita, inviaDisponibilita };
const AZIONI_ADMIN = {
  panoramica, stato, aggiornamenti, segnaLetti, creaRichiesta, chiudiRichiesta,
  salvaOperatore, nuovoCodice, eliminaOperatore,
  leggiImpostazioni, salvaImpostazioni, cambiaPassword,
};

// ---------------------------------------------------------------- ingresso

function doPost(e) {
  let risposta;
  try {
    const richiesta = JSON.parse(e.postData.contents);
    risposta = { ok: true, dati: esegui(richiesta) };
  } catch (err) {
    risposta = { ok: false, errore: err.message, codice: err.codice || '' };
  }
  return ContentService.createTextOutput(JSON.stringify(risposta)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('Disponibilità Ops: il backend è attivo.');
}

function esegui(r) {
  if (r.azione === 'accedi') return accedi(r);
  const sessione = verificaToken(r.token);
  if (sessione.r === 'op' && AZIONI_OPERATORE[r.azione]) return AZIONI_OPERATORE[r.azione](r, sessione);
  if (sessione.r === 'ad' && AZIONI_ADMIN[r.azione]) return AZIONI_ADMIN[r.azione](r, sessione);
  throw errore('Operazione non consentita.');
}

function errore(messaggio, codice) {
  const e = new Error(messaggio);
  e.codice = codice;
  return e;
}

// ---------------------------------------------------------------- menu del Google Sheet

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Disponibilità Ops')
    .addItem('Prepara i fogli', 'preparaFogli')
    .addItem('Imposta password supervisori', 'impostaPasswordSupervisori')
    .addToUi();
}

function preparaFogli() {
  Object.keys(INTESTAZIONI).forEach(foglio);
  segreto();
  SpreadsheetApp.getActiveSpreadsheet().toast('Fogli pronti.', 'Disponibilità Ops');
}

function impostaPasswordSupervisori() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Password supervisori', 'Scrivi la nuova password (almeno 8 caratteri):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const password = r.getResponseText();
  if (password.length < 8) { ui.alert('La password deve avere almeno 8 caratteri.'); return; }
  preparaFogli();
  salvaPasswordAdmin(password);
  ui.alert('Password impostata. Le sessioni dei supervisori già aperte sono state chiuse.');
}

// ---------------------------------------------------------------- sicurezza

// Le proprietà dello script si leggono una volta sola per richiesta: ogni lettura costa tempo.
let cacheProprieta = null;
const proprieta = () => cacheProprieta || (cacheProprieta = PropertiesService.getScriptProperties().getProperties());

function salvaProprieta(valori) {
  PropertiesService.getScriptProperties().setProperties(valori);
  Object.assign(proprieta(), valori);
}

function segreto() {
  let s = proprieta().SEGRETO;
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    salvaProprieta({ SEGRETO: s });
  }
  return s;
}

function hmac(testo) {
  const firma = Utilities.computeHmacSha256Signature(testo, segreto(), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(firma).replace(/=+$/, '');
}

const versioneAdmin = () => Number(proprieta().ADMIN_VERSIONE || 1);

function salvaPasswordAdmin(password) {
  salvaProprieta({ ADMIN_HASH: hmac('admin:' + password), ADMIN_VERSIONE: String(versioneAdmin() + 1) });
}

function creaToken(dati) {
  const corpo = Utilities.base64EncodeWebSafe(JSON.stringify(dati), Utilities.Charset.UTF_8).replace(/=+$/, '');
  return corpo + '.' + hmac(corpo);
}

function verificaToken(token) {
  const scaduta = () => errore('Sessione scaduta: accedi di nuovo.', 'sessione');
  const [corpo, firma] = String(token || '').split('.');
  if (!corpo || firma !== hmac(corpo)) throw scaduta();
  let b64 = corpo;
  while (b64.length % 4) b64 += '=';
  const d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b64)).getDataAsString('UTF-8'));
  if (!(d.exp > Date.now())) throw scaduta();
  if (d.r === 'ad' && d.v !== versioneAdmin()) throw scaduta();
  if (d.r === 'op') {
    const op = leggiOperatori().find((o) => o.id === d.id);
    if (!op || !op.attivo || op.versione !== d.v) throw scaduta();
    d.op = op;
  }
  return d;
}

function accedi(r) {
  const cache = CacheService.getScriptCache();
  const chiave = 'tentativi-' + (r.ruolo === 'admin' ? 'ad' : 'op');
  const falliti = Number(cache.get(chiave) || 0);
  if (falliti >= CONFIG.MAX_TENTATIVI) throw errore('Troppi tentativi falliti: riprova tra 15 minuti.');
  const fallito = (messaggio) => {
    cache.put(chiave, String(falliti + 1), 900);
    Utilities.sleep(1000);
    return errore(messaggio);
  };
  const exp = Date.now() + CONFIG.DURATA_SESSIONE_GIORNI * 864e5;

  if (r.ruolo === 'admin') {
    const hash = proprieta().ADMIN_HASH;
    if (!hash) throw errore('La password dei supervisori non è ancora stata impostata (menu Disponibilità Ops del Google Sheet).');
    if (hmac('admin:' + String(r.password || '')) !== hash) throw fallito('Password errata.');
    return { token: creaToken({ r: 'ad', v: versioneAdmin(), exp }) };
  }

  const codice = normalizzaCodice(r.codice);
  const hash = codice.length === 8 && hmac('op:' + codice);
  const op = hash && leggiOperatori().find((o) => o.codiceHash === hash);
  if (!op) throw fallito('Codice non valido.');
  if (!op.attivo) throw errore('Il tuo accesso è disattivato: contatta i supervisori.');
  return { token: creaToken({ r: 'op', id: op.id, v: op.versione, exp }), operatore: pubblico(op) };
}

const normalizzaCodice = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Codice personale: 8 caratteri senza simboli ambigui (0/O, 1/I), es. K7QM-4XPA.
function generaCodice() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const byte = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
  let c = '';
  for (let i = 0; i < 8; i++) c += alfabeto[(byte[i] + 256) % 32];
  return c.slice(0, 4) + '-' + c.slice(4);
}

// ---------------------------------------------------------------- fogli

function foglio(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, sh.getMaxRows(), INTESTAZIONI[nome].length).setNumberFormat('@');
    sh.getRange(1, 1, 1, INTESTAZIONI[nome].length).setValues([INTESTAZIONI[nome]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function righe(nome) {
  const sh = foglio(nome);
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, INTESTAZIONI[nome].length).getValues() : [];
}

// Scrive sempre come testo, così Sheets non trasforma date e numeri di telefono.
function scrivi(sh, riga, colonna, valori) {
  sh.getRange(riga, colonna, valori.length, valori[0].length).setNumberFormat('@').setValues(valori);
}

// Se qualcuno modifica il foglio a mano, Sheets può convertire le date: le riportiamo a yyyy-MM-dd.
function testo(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.FUSO, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v).trim();
}

function leggiOperatori() {
  return righe('Operatori').map((r, i) => ({
    riga: i + 2,
    id: testo(r[0]),
    nome: testo(r[1]),
    mansione: testo(r[2]),
    email: testo(r[3]),
    telefono: testo(r[4]),
    attivo: testo(r[5]).toUpperCase() !== 'NO',
    codiceHash: testo(r[6]),
    versione: Number(r[7]) || 1,
    ultimoInvio: testo(r[8]),
    creato: testo(r[9]),
  })).filter((o) => o.id);
}

const pubblico = (o) => ({
  id: o.id, nome: o.nome, mansione: o.mansione, email: o.email, telefono: o.telefono, attivo: o.attivo, ultimoInvio: o.ultimoInvio,
});

function leggiDisponibilita(da, a, idOperatore) {
  const out = {};
  righe('Disponibilita').forEach((r) => {
    const id = testo(r[0]), data = testo(r[1]), s = testo(r[2]), n = testo(r[3]);
    if ((idOperatore && id !== idOperatore) || data < da || data > a || (!s && !n)) return;
    (out[id] = out[id] || {})[data] = { s, n, t: testo(r[4]) };
  });
  return out;
}

// ---------------------------------------------------------------- date

const oggi = () => Utilities.formatDate(new Date(), CONFIG.FUSO, 'yyyy-MM-dd');

function aggiungiGiorni(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function lunedi(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return aggiungiGiorni(iso, -((d.getUTCDay() + 6) % 7));
}

const limite = () => aggiungiGiorni(lunedi(oggi()), CONFIG.SETTIMANE_AVANTI * 7 - 1);

function intervallo(r) {
  if (!ISO.test(r.da) || !ISO.test(r.a) || r.da > r.a) throw errore('Intervallo di date non valido.');
  return [r.da, r.a];
}

// ---------------------------------------------------------------- operatori

function mieDisponibilita(r, s) {
  const [da, a] = intervallo(r);
  return {
    giorni: leggiDisponibilita(da, a, s.op.id)[s.op.id] || {},
    operatore: pubblico(s.op),
    richieste: leggiRichieste().filter((x) => x.attiva && x.a >= oggi() && x.destinatari.indexOf(s.op.id) >= 0)
      .map((x) => ({ id: x.id, da: x.da, a: x.a, messaggio: x.messaggio, creata: x.creata })),
    oggi: oggi(),
    limite: limite(),
  };
}

function inviaDisponibilita(r, s) {
  const op = s.op, min = oggi(), max = limite(), giorni = r.giorni || {};
  const date = Object.keys(giorni).filter((d) => ISO.test(d)).sort();
  if (date.length > 120) throw errore('Troppi giorni in un solo invio.');
  date.forEach((d) => {
    if (d < min || d > max) throw errore('Il giorno ' + d + ' non è più modificabile.');
    if (giorni[d].s && !STATI[giorni[d].s]) throw errore('Stato non valido.');
  });

  const adesso = new Date().toISOString();
  const modifiche = [];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = foglio('Disponibilita');
    const tutte = righe('Disponibilita');
    const indice = {};
    tutte.forEach((x, i) => { if (testo(x[0]) === op.id) indice[testo(x[1])] = i; });
    const toccate = [], nuove = [];
    date.forEach((d) => {
      const s2 = giorni[d].s || '', n2 = String(giorni[d].n || '').trim().slice(0, 200);
      const i = indice[d];
      const s1 = i === undefined ? '' : testo(tutte[i][2]), n1 = i === undefined ? '' : testo(tutte[i][3]);
      if (s1 === s2 && n1 === n2) return;
      modifiche.push({ d, da: s1, a: s2, n: n2 });
      const riga = [op.id, d, s2, n2, adesso];
      if (i === undefined) nuove.push(riga);
      else { tutte[i] = riga; toccate.push(i); }
    });
    // le righe modificate vengono scritte a blocchi contigui, per fare poche chiamate al foglio
    toccate.sort((x, y) => x - y);
    for (let k = 0; k < toccate.length;) {
      let j = k;
      while (j + 1 < toccate.length && toccate[j + 1] === toccate[j] + 1) j++;
      scrivi(sh, toccate[k] + 2, 1, tutte.slice(toccate[k], toccate[j] + 1).map((x) => x.map(testo)));
      k = j + 1;
    }
    if (nuove.length) scrivi(sh, sh.getLastRow() + 1, 1, nuove);
    scrivi(foglio('Operatori'), op.riga, 9, [[adesso]]);
    const invii = foglio('Invii');
    scrivi(invii, invii.getLastRow() + 1, 1, [[Utilities.getUuid().slice(0, 8), adesso, op.id, op.nome, JSON.stringify(modifiche), 'NO']]);
  } finally {
    lock.releaseLock();
  }
  notificaEmail(op, modifiche);
  return { inviatoIl: adesso, modifiche: modifiche.length };
}

function notificaEmail(op, modifiche) {
  const imp = leggiImpostazioni();
  if (!imp.emailAttive || !imp.emailSupervisori) return;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nomeStato = (x) => STATI[x] || 'non indicato';
  const giorno = (iso) => ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'][new Date(iso + 'T12:00:00Z').getUTCDay()] + ' ' + iso.slice(8) + '/' + iso.slice(5, 7);
  const righeHtml = modifiche.length
    ? modifiche.map((m) => '<tr><td style="padding:4px 12px 4px 0"><b>' + giorno(m.d) + '</b></td><td style="padding:4px 12px 4px 0;color:#8b919c">'
      + nomeStato(m.da) + ' →</td><td style="padding:4px 12px 4px 0"><b>' + nomeStato(m.a) + '</b></td><td style="color:#5a606d">' + esc(m.n) + '</td></tr>').join('')
    : '<tr><td>Ha confermato le disponibilità senza modifiche.</td></tr>';
  const link = imp.urlAdmin ? '<p><a href="' + esc(imp.urlAdmin) + '" style="color:#1740f0">Apri la dashboard supervisori</a></p>' : '';
  try {
    MailApp.sendEmail({
      to: imp.emailSupervisori,
      name: 'Disponibilità Ops · TGI Sport',
      subject: 'Disponibilità aggiornate: ' + op.nome,
      htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c"><p><b>' + esc(op.nome) + '</b>'
        + (op.mansione ? ' (' + esc(op.mansione) + ')' : '') + ' ha inviato le sue disponibilità.</p><table style="border-collapse:collapse">'
        + righeHtml + '</table>' + link + '</div>',
    });
  } catch (e) {
    console.error('Email non inviata: ' + e.message);
  }
}

// ---------------------------------------------------------------- supervisori

// Tutto quello che serve alla dashboard in una sola chiamata: ogni giro verso Google costa secondi.
function panoramica(r) {
  const [da, a] = intervallo(r);
  const nonLetti = righe('Invii').filter((x) => testo(x[5]).toUpperCase() !== 'SI');
  return Object.assign(stato(), {
    operatori: leggiOperatori().map(pubblico),
    disponibilita: leggiDisponibilita(da, a),
    nonLettiOperatori: nonLetti.map((x) => testo(x[2])).filter((id, i, l) => l.indexOf(id) === i),
    richieste: statoRichieste(),
    oggi: oggi(),
    limite: limite(),
  });
}

function stato() {
  const invii = righe('Invii');
  return {
    nonLetti: invii.filter((x) => testo(x[5]).toUpperCase() !== 'SI').length,
    ultimo: invii.length ? testo(invii[invii.length - 1][1]) : '',
  };
}

function aggiornamenti(r) {
  const n = Math.min(Number(r.limite) || 100, 500);
  const invii = righe('Invii').slice(-n).reverse().map((x) => {
    let modifiche = [];
    try { modifiche = JSON.parse(testo(x[4]) || '[]'); } catch (e) { /* riga scritta a mano */ }
    return { id: testo(x[0]), quando: testo(x[1]), operatoreId: testo(x[2]), nome: testo(x[3]), modifiche, letto: testo(x[5]).toUpperCase() === 'SI' };
  });
  return { invii, richieste: statoRichieste() };
}

// ---------------------------------------------------------------- richieste di disponibilità

function leggiRichieste() {
  return righe('Richieste').map((x, i) => ({
    riga: i + 2, id: testo(x[0]), creata: testo(x[1]), da: testo(x[2]), a: testo(x[3]), messaggio: testo(x[4]),
    destinatari: testo(x[5]).split(',').filter(Boolean), attiva: testo(x[6]).toUpperCase() !== 'NO',
  })).filter((x) => x.id);
}

// Richieste aperte (o concluse da poco) con chi ha già compilato tutti i giorni ancora modificabili.
function statoRichieste() {
  const richieste = leggiRichieste().filter((x) => x.attiva && x.a >= aggiungiGiorni(oggi(), -7));
  if (!richieste.length) return [];
  const operatori = leggiOperatori();
  const da = richieste.reduce((m, x) => (x.da < m ? x.da : m), richieste[0].da);
  const a = richieste.reduce((m, x) => (x.a > m ? x.a : m), richieste[0].a);
  const disp = leggiDisponibilita(da, a);
  return richieste.reverse().map((x) => {
    const inizio = x.da > oggi() ? x.da : oggi();
    const giorni = [];
    for (let d = inizio; d <= x.a; d = aggiungiGiorni(d, 1)) giorni.push(d);
    const elenco = x.destinatari.map((id) => operatori.find((o) => o.id === id)).filter(Boolean).map((o) => {
      const mancanti = giorni.filter((d) => !(disp[o.id] && disp[o.id][d] && disp[o.id][d].s)).length;
      return { id: o.id, nome: o.nome, mancanti };
    });
    return { id: x.id, creata: x.creata, da: x.da, a: x.a, messaggio: x.messaggio, scaduta: x.a < oggi(), destinatari: elenco };
  });
}

function creaRichiesta(r) {
  const da = String(r.da || ''), a = String(r.a || '');
  if (!ISO.test(da) || !ISO.test(a) || da > a) throw errore('Periodo non valido.');
  if (a < oggi()) throw errore('Il periodo è già passato.');
  if (da > limite()) throw errore('Gli operatori possono compilare solo fino al ' + limite() + '.');
  const operatori = leggiOperatori().filter((o) => o.attivo && (r.destinatari || []).indexOf(o.id) >= 0);
  if (!operatori.length) throw errore('Scegli almeno un operatore.');
  const messaggio = String(r.messaggio || '').trim().slice(0, 500);
  const id = Utilities.getUuid().slice(0, 8);
  const sh = foglio('Richieste');
  scrivi(sh, sh.getLastRow() + 1, 1, [[id, new Date().toISOString(), da, a, messaggio, operatori.map((o) => o.id).join(','), 'SI']]);

  const esito = { id, email: 0, senzaEmail: [], nonInviate: [] };
  if (r.email === false) return esito;
  const sito = /^https:\/\//.test(String(r.urlSito || '')) ? String(r.urlSito) : '';
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const periodo = periodoLeggibile(da, a);
  operatori.forEach((o) => {
    if (!o.email) { esito.senzaEmail.push(o.nome); return; }
    try {
      MailApp.sendEmail({
        to: o.email,
        name: 'Disponibilità Ops · TGI Sport',
        subject: 'Richiesta disponibilità ' + periodo,
        htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5"><p>Ciao ' + esc(o.nome.split(' ')[0]) + ',</p>'
          + '<p>i supervisori ti chiedono di indicare le tue disponibilità <b>' + periodo + '</b>.</p>'
          + (messaggio ? '<p style="padding:10px 14px;background:#f3f4f6;border-radius:8px">' + esc(messaggio).replace(/\n/g, '<br>') + '</p>' : '')
          + (sito ? '<p><a href="' + esc(sito) + '" style="display:inline-block;padding:10px 18px;background:#1740f0;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Inserisci le disponibilità</a></p>' : '')
          + '<p style="color:#8b919c;font-size:12px">Per entrare usa il tuo codice personale.</p></div>',
      });
      esito.email++;
    } catch (e) {
      esito.nonInviate.push(o.nome);
    }
  });
  esito.quotaRestante = MailApp.getRemainingDailyQuota();
  return esito;
}

function chiudiRichiesta(r) {
  const x = leggiRichieste().find((y) => y.id === r.id);
  if (!x) throw errore('Richiesta non trovata.');
  scrivi(foglio('Richieste'), x.riga, 7, [['NO']]);
  return { chiusa: x.id };
}

// "dall'8 al 14 ottobre", "dal 28 ottobre all'11 novembre"
function periodoLeggibile(da, a) {
  const art = (iso, base) => ([1, 8, 11].indexOf(Number(iso.slice(8))) >= 0 ? base + "ll'" : base + 'l ');
  const inizio = da.slice(0, 7) === a.slice(0, 7) ? String(Number(da.slice(8))) : dataLeggibile(da);
  return art(da, 'da') + inizio + ' ' + art(a, 'a') + dataLeggibile(a);
}

function dataLeggibile(iso) {
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  return Number(iso.slice(8)) + ' ' + mesi[Number(iso.slice(5, 7)) - 1];
}

function segnaLetti(r) {
  const sh = foglio('Invii');
  const tutte = righe('Invii');
  if (!tutte.length) return { nonLetti: 0 };
  const ids = Array.isArray(r.ids) ? r.ids : null;
  const colonna = tutte.map((x) => [ids && ids.indexOf(testo(x[0])) < 0 ? testo(x[5]) || 'NO' : 'SI']);
  scrivi(sh, 2, 6, colonna);
  return { nonLetti: colonna.filter((x) => x[0] !== 'SI').length };
}

function salvaOperatore(r) {
  const o = r.operatore || {};
  const nome = String(o.nome || '').trim();
  if (!nome) throw errore('Il nome è obbligatorio.');
  const campi = [nome, String(o.mansione || '').trim(), String(o.email || '').trim(), String(o.telefono || '').trim(), o.attivo === false ? 'NO' : 'SI'];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = foglio('Operatori');
    const operatori = leggiOperatori();
    if (o.id) {
      const esistente = operatori.find((x) => x.id === o.id);
      if (!esistente) throw errore('Operatore non trovato.');
      scrivi(sh, esistente.riga, 2, [campi]);
      return { operatore: pubblico(leggiOperatori().find((x) => x.id === o.id)) };
    }
    const id = 'op-' + Utilities.getUuid().slice(0, 8);
    const codice = codiceUnico(operatori);
    scrivi(sh, sh.getLastRow() + 1, 1, [[id].concat(campi, [hmac('op:' + normalizzaCodice(codice)), '1', '', new Date().toISOString()])]);
    return { operatore: pubblico(leggiOperatori().find((x) => x.id === id)), codice };
  } finally {
    lock.releaseLock();
  }
}

function codiceUnico(operatori) {
  for (;;) {
    const codice = generaCodice();
    const hash = hmac('op:' + normalizzaCodice(codice));
    if (!operatori.some((x) => x.codiceHash === hash)) return codice;
  }
}

// Il vecchio codice smette di funzionare e le sessioni aperte con quel codice vengono chiuse.
function nuovoCodice(r) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const operatori = leggiOperatori();
    const op = operatori.find((x) => x.id === r.id);
    if (!op) throw errore('Operatore non trovato.');
    const codice = codiceUnico(operatori);
    scrivi(foglio('Operatori'), op.riga, 7, [[hmac('op:' + normalizzaCodice(codice)), String(op.versione + 1)]]);
    return { codice };
  } finally {
    lock.releaseLock();
  }
}

function eliminaOperatore(r) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const op = leggiOperatori().find((x) => x.id === r.id);
    if (!op) throw errore('Operatore non trovato.');
    foglio('Operatori').deleteRow(op.riga);
    const sh = foglio('Disponibilita');
    const tutte = righe('Disponibilita');
    const restanti = tutte.filter((x) => testo(x[0]) !== op.id).map((x) => x.map(testo));
    if (restanti.length < tutte.length) {
      sh.getRange(2, 1, tutte.length, INTESTAZIONI.Disponibilita.length).clearContent();
      if (restanti.length) scrivi(sh, 2, 1, restanti);
    }
    return { eliminato: op.id };
  } finally {
    lock.releaseLock();
  }
}

function leggiImpostazioni() {
  const p = proprieta();
  return {
    emailSupervisori: p.EMAIL_SUPERVISORI || '',
    emailAttive: p.EMAIL_ATTIVE !== 'NO',
    urlAdmin: p.URL_ADMIN || '',
  };
}

function salvaImpostazioni(r) {
  const email = String(r.emailSupervisori || '').split(/[,;\s]+/).filter(Boolean);
  if (email.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) throw errore('Controlla gli indirizzi email dei supervisori.');
  const url = String(r.urlAdmin || '');
  salvaProprieta({
    EMAIL_SUPERVISORI: email.join(','),
    EMAIL_ATTIVE: r.emailAttive === false ? 'NO' : 'SI',
    URL_ADMIN: /^https:\/\//.test(url) ? url : '',
  });
  return leggiImpostazioni();
}

function cambiaPassword(r) {
  if (hmac('admin:' + String(r.attuale || '')) !== proprieta().ADMIN_HASH) throw errore('La password attuale non è corretta.');
  const nuova = String(r.nuova || '');
  if (nuova.length < 8) throw errore('La nuova password deve avere almeno 8 caratteri.');
  salvaPasswordAdmin(nuova);
  return { token: creaToken({ r: 'ad', v: versioneAdmin(), exp: Date.now() + CONFIG.DURATA_SESSIONE_GIORNI * 864e5 }) };
}
