/**
 * Disponibilità Ops · TGI Sport — invio delle email
 * I dati stanno su Firebase; questo Google Apps Script serve solo a spedire le email, in sottofondo:
 *  - ai supervisori, quando un operatore invia le disponibilità;
 *  - agli operatori, quando i supervisori chiedono le disponibilità per un periodo;
 *  - ogni mattina, i promemoria delle convocazioni ancora da sistemare (attivaPromemoria);
 *  - agli operatori, le richieste di deployment on-site; ai supervisori, chi le accetta;
 *  - agli operatori, la richiesta di disponibilità per una singola partita; ai supervisori, chi risponde sì.
 * Chi chiama viene riconosciuto chiedendo a Firestore, con il suo gettone di accesso, di leggere
 * dati che le regole di sicurezza mostrano solo a lui: niente password o segreti qui dentro.
 * I promemoria girano senza nessuno collegato: leggono Firestore (solo lettura) con l'account Google
 * proprietario dello script, che per questo deve essere Editor del progetto Firebase.
 */

const CONFIG = {
  FIREBASE_PROJECT_ID: 'tgi-availability',          // Impostazioni progetto di Firebase → ID progetto
  MITTENTE: 'Disponibilità Ops · TGI Sport',
  PAUSA_NOTIFICHE_SECONDI: 60,                        // al massimo un'email ai supervisori al minuto per operatore
};

const STATI = { D: 'Disponibile', P: 'Parziale', A: 'Non disponibile' };
// turni remoti: nei dati il turno Remote TL si chiama ancora 'supervisione'
const TURNI_REMOTI = { supervisione: 'Remote TL', support: 'Remote Support' };
const eTurno = (e) => Object.prototype.hasOwnProperty.call(TURNI_REMOTI, e.tipo);

// ---------------------------------------------------------------- ingresso

function doPost(e) {
  let risposta;
  try {
    const r = JSON.parse(e.postData.contents);
    const azioni = {
      notificaInvio, emailRichiesta, emailConvocazioni, notificaRisposta, emailOnsite, notificaOnsite,
      emailRichiestaEvento, notificaRispostaEvento,
      inviaBackupOra: soloSupervisori(() => {
        const r = giroBackup(new Date(), { forza: true });
        return Object.assign({ destinatari: r.destinatari, eventi: r.eventi }, r.ripetuto ? { ripetuto: true, quando: r.quando } : {});
      }),
      leggiImpostazioni: soloSupervisori(impostazioniDashboard), salvaImpostazioni: soloSupervisori(salvaImpostazioni),
    };
    if (!azioni[r.azione]) throw new Error('Operazione non consentita.');
    risposta = { ok: true, dati: azioni[r.azione](r) };
  } catch (err) {
    risposta = { ok: false, errore: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(risposta)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('Disponibilità Ops: il servizio email è attivo.');
}

// Da eseguire una volta dall'editor: chiede le autorizzazioni (collegamento a Firebase e invio email)
// e scrive nel registro se è tutto pronto.
function verificaAutorizzazioni() {
  const r = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + CONFIG.FIREBASE_PROJECT_ID + '/databases/(default)/documents/invii?pageSize=1', { muteHttpExceptions: true });
  const firebase = r.getResponseCode() === 403 ? 'raggiungibile (accesso protetto dalle regole, corretto)' : 'risposta inattesa ' + r.getResponseCode();
  console.log('Firebase: ' + firebase + ' · email ancora disponibili oggi: ' + MailApp.getRemainingDailyQuota());
}

// ---------------------------------------------------------------- chi sta chiamando

function firestore(percorso, idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.FIREBASE_PROJECT_ID + '/databases/(default)/documents/' + percorso;
  const r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  return { codice: r.getResponseCode(), dati: jsonSicuro(r.getContentText()) };
}

// Google a volte risponde con una sua pagina d'errore (502) invece del JSON: conta solo il codice
function jsonSicuro(testo) {
  try { return JSON.parse(testo || '{}'); } catch (e) { return {}; }
}

const campo = (doc, nome) => ((doc.fields || {})[nome] || {}).stringValue || '';

// Solo i supervisori possono elencare gli invii (regole di Firestore).
function verificaSupervisore(idToken) {
  if (!idToken || firestore('invii?pageSize=1', idToken).codice !== 200) throw new Error('Accesso non consentito.');
}

function soloSupervisori(azione) {
  return (r) => { verificaSupervisore(r.idToken); return azione(r); };
}

// Un operatore può leggere solo il proprio abbinamento account → operatore, e la propria scheda se è attivo.
function verificaOperatore(idToken) {
  const parti = String(idToken || '').split('.');
  if (parti.length !== 3) throw new Error('Accesso non consentito.');
  let b64 = parti[1];
  while (b64.length % 4) b64 += '=';
  const uid = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b64)).getDataAsString('UTF-8')).user_id;
  const utente = firestore('utenti/' + encodeURIComponent(uid), idToken);
  if (utente.codice !== 200) throw new Error('Accesso non consentito.');
  const id = campo(utente.dati, 'operatoreId');
  const scheda = firestore('operatori/' + encodeURIComponent(id), idToken);
  if (scheda.codice !== 200) throw new Error('Accesso non consentito.');
  return { uid, id, nome: campo(scheda.dati, 'nome'), mansione: campo(scheda.dati, 'mansione') };
}

// ---------------------------------------------------------------- email

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const giornoBreve = (iso) => ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'][new Date(iso + 'T12:00:00Z').getUTCDay()] + ' ' + iso.slice(8) + '/' + iso.slice(5, 7);

function notificaInvio(r) {
  const op = verificaOperatore(r.idToken);
  const imp = leggiImpostazioni();
  if (!imp.emailAttive || !imp.emailSupervisori) return { inviata: false };
  // un operatore che preme Invia più volte di fila non riempie la posta dei supervisori
  const cache = CacheService.getScriptCache();
  if (cache.get('notifica-' + op.uid)) return { inviata: false };
  cache.put('notifica-' + op.uid, '1', CONFIG.PAUSA_NOTIFICHE_SECONDI);

  const modifiche = (Array.isArray(r.modifiche) ? r.modifiche : []).slice(0, 120);
  const nomeStato = (x) => STATI[x] || 'non indicato';
  const righe = modifiche.length
    ? modifiche.map((m) => '<tr><td style="padding:4px 12px 4px 0"><b>' + esc(giornoBreve(String(m.d))) + '</b></td><td style="padding:4px 12px 4px 0;color:#8b919c">'
      + nomeStato(m.da) + ' →</td><td style="padding:4px 12px 4px 0"><b>' + nomeStato(m.a) + '</b></td><td style="color:#5a606d">' + esc(m.n || '') + '</td></tr>').join('')
    : '<tr><td>Ha confermato le disponibilità senza modifiche.</td></tr>';
  const link = imp.urlAdmin ? '<p><a href="' + esc(imp.urlAdmin) + '" style="color:#1740f0">Apri la dashboard supervisori</a></p>' : '';
  MailApp.sendEmail({
    to: imp.emailSupervisori,
    name: CONFIG.MITTENTE,
    subject: 'Disponibilità aggiornate: ' + op.nome,
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c"><p><b>' + esc(op.nome) + '</b>'
      + (op.mansione ? ' (' + esc(op.mansione) + ')' : '') + ' ha inviato le sue disponibilità.</p><table style="border-collapse:collapse">'
      + righe + '</table>' + link + '</div>',
  });
  return { inviata: true };
}

function emailRichiesta(r) {
  verificaSupervisore(r.idToken);
  const da = String(r.da || ''), a = String(r.a || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(da) || !/^\d{4}-\d{2}-\d{2}$/.test(a)) throw new Error('Periodo non valido.');
  const sito = /^https:\/\//.test(String(r.urlSito || '')) ? String(r.urlSito) : '';
  const messaggio = String(r.messaggio || '').slice(0, 500);
  const periodo = periodoLeggibile(da, a);
  const esito = { email: 0, nonInviate: [] };
  (Array.isArray(r.destinatari) ? r.destinatari : []).slice(0, 200).forEach((o) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(o.email || ''))) { esito.nonInviate.push(o.nome); return; }
    try {
      MailApp.sendEmail({
        to: o.email,
        name: CONFIG.MITTENTE,
        subject: 'Richiesta disponibilità ' + periodo,
        htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5"><p>Ciao ' + esc(String(o.nome || '').split(' ')[0]) + ',</p>'
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

// Convocazioni: un'email per operatore con tutti i suoi eventi, da confermare sulla piattaforma.
function emailConvocazioni(r) {
  verificaSupervisore(r.idToken);
  const sito = /^https:\/\//.test(String(r.urlSito || '')) ? String(r.urlSito) : '';
  const esito = { email: 0, nonInviate: [] };
  (Array.isArray(r.convocazioni) ? r.convocazioni : []).slice(0, 100).forEach((c) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c.email || ''))) { esito.nonInviate.push(c.nome); return; }
    const eventi = (Array.isArray(c.eventi) ? c.eventi : []).slice(0, 60);
    const righe = eventi.map((e) => '<tr><td style="padding:6px 14px 6px 0;white-space:nowrap"><b>' + esc(giornoLungo(String(e.data))) + '</b></td>'
      + '<td style="padding:6px 14px 6px 0">' + esc(eTurno(e) ? TURNI_REMOTI[e.tipo] : e.titolo || '')
      + (eTurno(e) ? '' : '<br><span style="color:#8b919c;font-size:12px">' + esc([e.competizione, e.round].filter(Boolean).join(' · ')) + '</span>') + '</td>'
      + '<td style="padding:6px 0;white-space:nowrap">' + (eTurno(e) ? 'inizio turno' : (e.orario ? 'evento ' + esc(e.orario) + '<br>' : '') + 'ritrovo')
      + ' <b>' + esc(e.convocazione || '') + '</b>' + (e.fine ? ' – fine <b>' + esc(e.fine) + '</b>' : '') + '</td></tr>').join('');
    try {
      MailApp.sendEmail({
        to: c.email,
        name: CONFIG.MITTENTE,
        subject: eventi.length === 1 ? 'Convocazione: ' + (eTurno(eventi[0]) ? TURNI_REMOTI[eventi[0].tipo] : eventi[0].titolo) + ' · ' + giornoLungo(String(eventi[0].data)) : 'Convocazioni TGI Sport (' + eventi.length + ')',
        htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5"><p>Ciao ' + esc(String(c.nome || '').split(' ')[0]) + ',</p>'
          + '<p>' + (eventi.length === 1 ? 'sei convocato per:' : 'sei convocato per questi eventi:') + '</p><table style="border-collapse:collapse">' + righe + '</table>'
          + (sito ? '<p><a href="' + esc(sito) + '" style="display:inline-block;padding:10px 18px;background:#1740f0;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Conferma sulla piattaforma</a></p>' : '')
          + '<p style="color:#8b919c;font-size:12px">Per entrare usa il tuo codice personale.</p></div>',
      });
      esito.email++;
    } catch (e) {
      esito.nonInviate.push(c.nome);
    }
  });
  esito.quotaRestante = MailApp.getRemainingDailyQuota();
  return esito;
}

// Un operatore non può partecipare: i supervisori lo sanno subito anche per email.
function notificaRisposta(r) {
  const op = verificaOperatore(r.idToken);
  const imp = leggiImpostazioni();
  if (r.stato !== 'rifiutato' || !imp.emailAttive || !imp.emailSupervisori) return { inviata: false };
  const ev = r.evento || {}, nome = eTurno(ev) ? TURNI_REMOTI[ev.tipo] : ev.titolo || '';
  MailApp.sendEmail({
    to: imp.emailSupervisori,
    name: CONFIG.MITTENTE,
    subject: 'Convocazione rifiutata: ' + op.nome + ' · ' + nome,
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5"><p><b>' + esc(op.nome) + '</b> non può partecipare a <b>'
      + esc(nome) + '</b>' + (ev.data ? ' (' + esc(giornoLungo(String(ev.data))) + ')' : '') + '.</p>'
      + (r.motivo ? '<p style="padding:10px 14px;background:#f3f4f6;border-radius:8px">' + esc(String(r.motivo).slice(0, 200)) + '</p>' : '')
      + (imp.urlAdmin ? '<p><a href="' + esc(imp.urlAdmin.replace(/#.*$/, '')) + '#convocazioni" style="color:#1740f0">Trova un sostituto</a></p>' : '') + '</div>',
  });
  return { inviata: true };
}

function giornoLungo(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const giorni = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  return giorni[new Date(iso + 'T12:00:00Z').getUTCDay()] + ' ' + Number(iso.slice(8)) + ' ' + mesi[Number(iso.slice(5, 7)) - 1];
}

// "dall'8 al 14 ottobre", "dal 28 ottobre all'11 novembre"
function periodoLeggibile(da, a) {
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const data = (iso) => Number(iso.slice(8)) + ' ' + mesi[Number(iso.slice(5, 7)) - 1];
  const art = (iso, base) => ([1, 8, 11].indexOf(Number(iso.slice(8))) >= 0 ? base + "ll'" : base + 'l ');
  const inizio = da.slice(0, 7) === a.slice(0, 7) ? String(Number(da.slice(8))) : data(da);
  return art(da, 'da') + inizio + ' ' + art(a, 'a') + data(a);
}

// ---------------------------------------------------------------- impostazioni (proprietà dello script)

const giorniValidi = (g) => Number.isInteger(g) && g >= 1 && g <= 7;

function leggiImpostazioni() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const giorni = Number(p.PROMEMORIA_GIORNI);
  let ultimo = null, backup = null;
  try { ultimo = p.ULTIMO_PROMEMORIA ? JSON.parse(p.ULTIMO_PROMEMORIA) : null; } catch (e) { ultimo = null; }
  try { backup = p.ULTIMO_BACKUP ? JSON.parse(p.ULTIMO_BACKUP) : null; } catch (e) { backup = null; }
  return {
    emailSupervisori: p.EMAIL_SUPERVISORI || '', emailAttive: p.EMAIL_ATTIVE !== 'NO', urlAdmin: p.URL_ADMIN || '',
    promemoriaAttivi: p.PROMEMORIA_ATTIVI === 'SI', promemoriaGiorni: giorniValidi(giorni) ? giorni : 3, ultimoPromemoria: ultimo,
    // acceso finché qualcuno non lo spegne (anche prima di attivaPromemoria, che poi crea l'attivatore)
    backupAttivo: p.BACKUP_ATTIVO !== 'NO', ultimoBackup: backup,
  };
}

// Per la dashboard: anche se l'invio giornaliero è stato attivato (attivaPromemoria)
function impostazioniDashboard() {
  // se l'elenco degli attivatori non si legge, il riquadro delle notifiche si carica lo stesso
  let attivatori = [];
  try { attivatori = ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction()); } catch (e) { console.error('Attivatori non letti: ' + e.message); }
  return Object.assign(leggiImpostazioni(), {
    promemoriaProgrammato: attivatori.indexOf('inviaPromemoria') >= 0,
    backupProgrammato: attivatori.indexOf('inviaBackup') >= 0,
  });
}

function salvaImpostazioni(r) {
  const email = String(r.emailSupervisori || '').split(/[,;\s]+/).filter(Boolean);
  if (email.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) throw new Error('Controlla gli indirizzi email dei supervisori.');
  const url = String(r.urlAdmin || '');
  const nuove = {
    EMAIL_SUPERVISORI: email.join(','),
    EMAIL_ATTIVE: r.emailAttive === false ? 'NO' : 'SI',
    URL_ADMIN: /^https:\/\//.test(url) ? url : '',
  };
  // una dashboard non ancora aggiornata non manda i campi dei promemoria: restano come sono
  if (r.promemoriaGiorni !== undefined) {
    if (!giorniValidi(r.promemoriaGiorni === null || r.promemoriaGiorni === '' ? NaN : Number(r.promemoriaGiorni))) throw new Error('I giorni del promemoria vanno da 1 a 7.');
    nuove.PROMEMORIA_GIORNI = String(Number(r.promemoriaGiorni));
  }
  if (r.promemoriaAttivi !== undefined) nuove.PROMEMORIA_ATTIVI = r.promemoriaAttivi === true ? 'SI' : 'NO';
  if (r.backupAttivo !== undefined) nuove.BACKUP_ATTIVO = r.backupAttivo === true ? 'SI' : 'NO';
  PropertiesService.getScriptProperties().setProperties(nuove);
  return impostazioniDashboard();
}

// ---------------------------------------------------------------- promemoria automatici: scelta degli eventi

const EMAIL_VALIDA = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// "2026-10-30" + 3 → "2026-11-02" (a mezzogiorno UTC: il cambio dell'ora non sposta il giorno)
function aggiungiGiorni(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Documento dell'API REST di Firestore → oggetto semplice con il suo id
function daFirestore(doc) {
  const valore = (v) => {
    if ('stringValue' in v) return v.stringValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) return campi(v.mapValue.fields);
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(valore);
    return null;
  };
  const campi = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, valore(v)]));
  return Object.assign({ id: String(doc.name || '').split('/').pop() }, campi(doc.fields));
}

// Eventi remoti da oggi a oggi + giorni, ciascuno in un solo gruppo (in ordine di urgenza),
// e per ogni operatore raggiungibile le sue convocazioni ancora da confermare.
function selezionaPromemoria(eventi, operatori, oggi, giorni) {
  const fine = aggiungiGiorni(oggi, giorni);
  const perId = Object.fromEntries(operatori.map((o) => [o.id, o]));
  const ora = (e) => e.orario || e.convocazione || e.convocazioneCalcolata || '';
  const gruppi = { sostituire: [], senzaOperatore: [], daInviare: [], inAttesa: [] };
  const avvisati = {};
  eventi
    .filter((e) => e.data >= oggi && e.data <= fine && ['partita', 'supervisione', 'support'].indexOf(e.tipo || 'partita') >= 0 && e.stato !== 'annullato')
    .sort((a, b) => a.data.localeCompare(b.data) || ora(a).localeCompare(ora(b)))
    .forEach((e) => {
      const op = perId[e.operatoreId] || null;
      const riga = (gruppo, nota) => gruppi[gruppo].push({ evento: e, operatore: op, nota: nota || '' });
      if (e.stato === 'rifiutato' || e.daSostituire) riga('sostituire');
      else if (!op || e.stato === 'da-assegnare') riga('senzaOperatore');
      else if (e.stato === 'assegnato') riga('daInviare');
      else if (e.stato === 'convocato') {
        if (op.attivo === false) riga('inAttesa', '(disattivato)');
        else if (!EMAIL_VALIDA.test(String(op.email || ''))) riga('inAttesa', '(senza email)');
        else {
          riga('inAttesa');
          avvisati[op.id] = avvisati[op.id] || { id: op.id, nome: op.nome, email: op.email, eventi: [] };
          avvisati[op.id].eventi.push(e);
        }
      }
    });
  return { gruppi, operatori: Object.keys(avvisati).map((id) => avvisati[id]) };
}

// ---------------------------------------------------------------- promemoria automatici: testo delle email

// Link delle email ricavati dall'indirizzo della dashboard salvato con le impostazioni
function indirizzi(urlAdmin) {
  const url = String(urlAdmin || '');
  if (!/^https:\/\//.test(url)) return { convocazioni: '', sito: '' };
  const base = url.replace(/#.*$/, '');
  return { convocazioni: base + '#convocazioni', sito: /admin\.html/.test(base) ? base.replace(/admin\.html.*$/, '') : '' };
}

const relativo = (data, oggi) => (data === oggi ? ' (oggi)' : data === aggiungiGiorni(oggi, 1) ? ' (domani)' : '');

// "evento 18:30 · ritrovo 14:30 – fine 20:30", per i turni remoti "inizio turno 10:00 – fine 16:00"
function orariTurno(e) {
  const ritrovo = e.convocazione || e.convocazioneCalcolata || '';
  const fine = e.fine || e.fineCalcolata || '';
  const turno = [ritrovo ? (eTurno(e) ? 'inizio turno' : 'ritrovo') + ' <b>' + esc(ritrovo) + '</b>' : '', fine ? 'fine <b>' + esc(fine) + '</b>' : '']
    .filter(Boolean).join(' – ');
  return [!eTurno(e) && e.orario ? 'evento ' + esc(e.orario) : '', turno].filter(Boolean).join(' · ');
}

function rigaEvento(e, oggi, ultimaColonna) {
  return '<tr><td style="padding:6px 14px 6px 0;white-space:nowrap;vertical-align:top"><b>' + esc(giornoLungo(String(e.data))) + '</b>' + relativo(e.data, oggi) + '</td>'
    + '<td style="padding:6px 14px 6px 0">' + esc(eTurno(e) ? TURNI_REMOTI[e.tipo] : e.titolo || '')
      + (eTurno(e) ? '' : '<br><span style="color:#8b919c;font-size:12px">' + esc([e.competizione, e.round].filter(Boolean).join(' · ')) + '</span>') + '</td>'
    + '<td style="padding:6px 0;white-space:nowrap">' + ultimaColonna + '</td></tr>';
}

const tasto = (href, testo) => '<p><a href="' + esc(href) + '" style="display:inline-block;padding:10px 18px;background:#1740f0;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">' + testo + '</a></p>';

function emailOperatore(op, eventi, ctx) {
  const uno = eventi.length === 1;
  return {
    to: op.email,
    subject: uno ? 'Promemoria: conferma la convocazione di ' + giornoLungo(String(eventi[0].data)) : 'Promemoria: ' + eventi.length + ' convocazioni da confermare',
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5"><p>Ciao ' + esc(String(op.nome || '').split(' ')[0]) + ',</p>'
      + '<p>' + (uno ? 'questa convocazione aspetta ancora la tua conferma:' : 'queste convocazioni aspettano ancora la tua conferma:') + '</p>'
      + '<table style="border-collapse:collapse">' + eventi.map((e) => rigaEvento(e, ctx.oggi, orariTurno(e))).join('') + '</table>'
      + (ctx.sito ? tasto(ctx.sito, 'Conferma sulla piattaforma') : '')
      + (ctx.telefono ? '<p>Se non puoi partecipare, chiama il supervisore al <b>' + esc(ctx.telefono) + '</b>.</p>' : '')
      + '<p style="color:#8b919c;font-size:12px">Per entrare usa il tuo codice personale.</p></div>',
  };
}

const GRUPPI_PROMEMORIA = [
  ['sostituire', 'Rifiutate o da sostituire', 'da sostituire'],
  ['senzaOperatore', 'Senza operatore', 'senza operatore'],
  ['daInviare', 'Assegnate ma non inviate', 'da inviare'],
  ['inAttesa', 'In attesa di risposta', 'in attesa'],
];

function emailSupervisori(gruppi, ctx) {
  const pieni = GRUPPI_PROMEMORIA.filter(([chiave]) => gruppi[chiave].length);
  const orario = (e) => (eTurno(e) ? 'dalle ' + esc(e.convocazione || e.convocazioneCalcolata || '') : 'ore ' + esc(e.orario || ''));
  const chi = (r) => (r.operatore ? esc(r.operatore.nome) + (r.nota ? ' ' + r.nota : '') : '—');
  const sezioni = pieni.map(([chiave, titolo]) => '<h3 style="font-size:15px;margin:18px 0 6px">' + titolo + ' (' + gruppi[chiave].length + ')</h3>'
    + '<table style="border-collapse:collapse">' + gruppi[chiave].map((r) => rigaEvento(r.evento, ctx.oggi, orario(r.evento) + ' · ' + chi(r))).join('') + '</table>');
  return {
    to: ctx.a,
    subject: 'Promemoria convocazioni · ' + (ctx.giorni === 1 ? 'oggi e domani' : 'prossimi ' + ctx.giorni + ' giorni') + ': '
      + pieni.map(([chiave, , breve]) => gruppi[chiave].length + ' ' + breve).join(', '),
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5">'
      + '<p>Eventi remoti ' + (ctx.giorni === 1 ? 'di oggi e domani' : 'dei prossimi ' + ctx.giorni + ' giorni') + ' ancora da sistemare:</p>'
      + sezioni.join('') + (ctx.convocazioni ? tasto(ctx.convocazioni, 'Apri le convocazioni') : '') + '</div>',
  };
}

// ---------------------------------------------------------------- promemoria automatici: lettura e giro del mattino

// Firestore con l'account proprietario dello script: legge fuori dalle regole di sicurezza,
// perciò si usa solo qui, solo in lettura e senza dati in arrivo da fuori.
function firestoreAdmin(metodo, percorso, corpo) {
  const opzioni = {
    method: metodo, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': CONFIG.FIREBASE_PROJECT_ID },
  };
  if (corpo) { opzioni.contentType = 'application/json'; opzioni.payload = JSON.stringify(corpo); }
  const r = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + CONFIG.FIREBASE_PROJECT_ID + '/databases/(default)/documents' + percorso, opzioni);
  return { codice: r.getResponseCode(), dati: jsonSicuro(r.getContentText()) };
}

// Risposta di una lettura con l'account dello script: errori chiari, con il messaggio di Google
// (permessi mancanti, API spenta, autorizzazioni dello script…)
function letturaAdmin(r, ammessi) {
  const e = (Array.isArray(r.dati) ? r.dati[0] || {} : r.dati || {}).error;
  const google = e && e.message ? ' Risposta di Google: ' + e.message : '';
  if (r.codice === 200 || (ammessi || []).indexOf(r.codice) >= 0) return r;
  if (r.codice === 401 || r.codice === 403) throw new Error("L'account dello script non può leggere Firebase: aggiungilo come Editor del progetto (vedi README)." + google);
  throw new Error('Lettura di Firebase non riuscita (' + r.codice + ').' + google);
}

// Tutti i documenti di una raccolta, pagina per pagina
function elencoAdmin(raccolta) {
  const out = [];
  let pagina = '';
  do {
    const r = letturaAdmin(firestoreAdmin('get', '/' + raccolta + '?pageSize=300' + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : '')));
    (r.dati.documents || []).forEach((d) => out.push(daFirestore(d)));
    pagina = r.dati.nextPageToken || '';
  } while (pagina);
  return out;
}

function leggiDatiPromemoria(oggi, fine) {
  const controlla = letturaAdmin;
  const filtro = (op, valore) => ({ fieldFilter: { field: { fieldPath: 'data' }, op, value: { stringValue: valore } } });
  const q = controlla(firestoreAdmin('post', ':runQuery', { structuredQuery: {
    from: [{ collectionId: 'eventi' }],
    where: { compositeFilter: { op: 'AND', filters: [filtro('GREATER_THAN_OR_EQUAL', oggi), filtro('LESS_THAN_OR_EQUAL', fine)] } },
  } }));
  // senza risultati l'API risponde con voci che hanno solo readTime
  const eventi = (Array.isArray(q.dati) ? q.dati : []).filter((x) => x.document).map((x) => daFirestore(x.document));
  const operatori = elencoAdmin('operatori');
  const operativo = controlla(firestoreAdmin('get', '/impostazioni/operativo'), [404]);
  return { eventi, operatori, telefono: operativo.codice === 200 ? String(daFirestore(operativo.dati).telefono || '') : '' };
}

// Il giro del mattino. In anteprima non controlla interruttore e giro già fatto, non spedisce e non salva.
function giroPromemoria(adesso, opzioni) {
  const anteprima = !!(opzioni && opzioni.anteprima);
  let imp = leggiImpostazioni();
  const oggi = Utilities.formatDate(adesso, 'Europe/Rome', 'yyyy-MM-dd');
  // un giro in cui non è partita nessuna email non conta: il successivo riprova
  const giaFatto = (i) => !anteprima && i.ultimoPromemoria && i.ultimoPromemoria.giorno === oggi && !i.ultimoPromemoria.fallito;
  if (!anteprima && !imp.promemoriaAttivi) return { saltato: 'spenti', oggi };
  if (giaFatto(imp)) return { saltato: 'già fatto', oggi };
  // un solo giro alla volta (l'attivatore e un inviaPromemoria lanciato a mano insieme): il secondo non spedisce
  const blocco = anteprima ? null : LockService.getScriptLock();
  if (blocco && !blocco.tryLock(1000)) return { saltato: 'in corso', oggi };
  try {
    // riletto col blocco in mano: l'altro giro può aver finito mentre si aspettava
    if (blocco) imp = leggiImpostazioni();
    if (giaFatto(imp)) return { saltato: 'già fatto', oggi };
    return eseguiGiroPromemoria(adesso, anteprima, imp, oggi);
  } finally {
    if (blocco) blocco.releaseLock();
  }
}

function eseguiGiroPromemoria(adesso, anteprima, imp, oggi) {
  const dati = leggiDatiPromemoria(oggi, aggiungiGiorni(oggi, imp.promemoriaGiorni));
  const scelta = selezionaPromemoria(dati.eventi, dati.operatori, oggi, imp.promemoriaGiorni);
  const link = indirizzi(imp.urlAdmin);
  const email = scelta.operatori.map((op) => emailOperatore(op, op.eventi, { oggi, telefono: dati.telefono, sito: link.sito }));
  const inSospeso = GRUPPI_PROMEMORIA.reduce((n, [chiave]) => n + scelta.gruppi[chiave].length, 0);
  const riepilogo = inSospeso && imp.emailSupervisori
    ? emailSupervisori(scelta.gruppi, { oggi, giorni: imp.promemoriaGiorni, a: imp.emailSupervisori, convocazioni: link.convocazioni })
    : null;
  if (anteprima) {
    return { oggi, riepilogo: !!riepilogo, operatori: email.length, inSospeso, destinatari: email.concat(riepilogo ? [riepilogo] : []).map((m) => m.to) };
  }
  let ultimoErrore = '';
  const spedisci = (m) => {
    try {
      MailApp.sendEmail(Object.assign({ name: CONFIG.MITTENTE }, m));
      return true;
    } catch (e) {
      ultimoErrore = e.message;
      console.error('Promemoria non inviato a ' + m.to + ': ' + e.message);
      return false;
    }
  };
  const inviate = email.filter(spedisci);
  const riepilogoInviato = !!riepilogo && spedisci(riepilogo);
  const tentate = email.length + (riepilogo ? 1 : 0);
  const nonInviate = tentate - inviate.length - (riepilogoInviato ? 1 : 0);
  const esito = { giorno: oggi, quando: adesso.toISOString(), riepilogo: riepilogoInviato, operatori: inviate.length, nonInviate, inSospeso };
  // nessuna email partita (per esempio quota di Gmail finita): resta segnato nella dashboard, l'esecuzione
  // risulta fallita (Google avvisa il proprietario) e il giro si può ripetere lo stesso giorno
  if (tentate && nonInviate === tentate) esito.fallito = true;
  PropertiesService.getScriptProperties().setProperty('ULTIMO_PROMEMORIA', JSON.stringify(esito));
  if (esito.fallito) throw new Error('Nessun promemoria è partito: ' + ultimoErrore + '. Esegui di nuovo inviaPromemoria quando il problema è risolto.');
  return { oggi, riepilogo: riepilogoInviato, operatori: inviate.length, destinatari: inviate.concat(riepilogoInviato ? [riepilogo] : []).map((m) => m.to) };
}

// Funzione dell'attivatore giornaliero: Google le passa un evento, che qui non serve.
function inviaPromemoria() {
  console.log('Promemoria: ' + JSON.stringify(giroPromemoria(new Date())));
}

// Da eseguire una volta dall'editor (e di nuovo se serve): chiede le autorizzazioni, controlla
// di poter leggere Firebase, mostra cosa partirebbe oggi e attiva l'invio ogni mattina tra le 8 e le 9,
// con un nuovo tentativo tra le 11 e le 12 (se alle 8 è andato tutto bene non fa nulla).
function attivaPromemoria() {
  const oggi = Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd');
  try {
    leggiDatiPromemoria(oggi, aggiungiGiorni(oggi, leggiImpostazioni().promemoriaGiorni));
  } catch (e) {
    console.error('Firebase: ' + e.message + ' Invio giornaliero NON attivato.');
    throw e;
  }
  console.log('Firebase: lettura riuscita.');
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('PROMEMORIA_ATTIVI') === null) p.setProperty('PROMEMORIA_ATTIVI', 'SI');
  if (p.getProperty('PROMEMORIA_GIORNI') === null) p.setProperty('PROMEMORIA_GIORNI', '3');
  const prova = giroPromemoria(new Date(), { anteprima: true });
  console.log('Anteprima di oggi, nessuna email spedita: ' + (prova.destinatari.length ? prova.destinatari.join(', ')
    + (prova.inSospeso ? ' · ' + prova.inSospeso + (prova.inSospeso === 1 ? ' evento' : ' eventi') + ' da sistemare' : '')
    : prova.inSospeso ? prova.inSospeso + (prova.inSospeso === 1 ? ' evento' : ' eventi') + ' da sistemare ma nessun destinatario (controlla gli indirizzi dei supervisori).'
      : 'niente in sospeso.'));
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'inviaPromemoria').forEach((t) => ScriptApp.deleteTrigger(t));
  [8, 11].forEach((ora) => ScriptApp.newTrigger('inviaPromemoria').timeBased().everyDays(1).atHour(ora).inTimezone('Europe/Rome').create());
  // backup settimanale: il venerdì tra le 18 e le 19 (acceso la prima volta, poi resta la scelta fatta in Impostazioni)
  if (p.getProperty('BACKUP_ATTIVO') === null) p.setProperty('BACKUP_ATTIVO', 'SI');
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'inviaBackup').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('inviaBackup').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(18).inTimezone('Europe/Rome').create();
  const imp = leggiImpostazioni();
  console.log('Invio giornaliero attivo tra le 8 e le 9 (nuovo tentativo alle 11) · promemoria ' + (imp.promemoriaAttivi ? 'accesi' : 'spenti') + ', '
    + imp.promemoriaGiorni + ' giorni prima · email ancora disponibili oggi: ' + MailApp.getRemainingDailyQuota());
  console.log('Backup ogni venerdì tra le 18 e le 19 · backup ' + (imp.backupAttivo ? 'acceso' : 'spento'));
}

// ---------------------------------------------------------------- on-site: richiesta e accettazione
// (periodoBreve ed etichettaPosti danno gli stessi risultati delle funzioni omonime di app/onsite.js)

// "12 ottobre", "12–15 ottobre", "30 ottobre – 2 novembre"
function periodoBreve(da, a) {
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const g = (iso) => ({ num: Number(iso.slice(8)), mese: mesi[Number(iso.slice(5, 7)) - 1], anno: iso.slice(0, 4) });
  const x = g(String(da)), y = g(String(a));
  if (da === a) return x.num + ' ' + x.mese;
  if (x.mese === y.mese && x.anno === y.anno) return x.num + '–' + y.num + ' ' + y.mese;
  return x.num + ' ' + x.mese + ' – ' + y.num + ' ' + y.mese;
}

// "TL 1/1 · OP 2/2 · completo"
function etichettaPosti(d) {
  const posti = d.posti || {};
  const conPosti = ['TL', 'OP'].filter((r) => Number(posti[r] || 0) > 0);
  const presi = (r) => (Array.isArray(d['accettati' + r]) ? d['accettati' + r] : []).length;
  return conPosti.map((r) => r + ' ' + presi(r) + '/' + posti[r]).join(' · ')
    + (conPosti.length && conPosti.every((r) => presi(r) >= Number(posti[r])) ? ' · completo' : '');
}

// Richiesta all'operatore: giorni, attività, luogo, sport e posto richiesto. Mai il compenso.
function testoEmailOnsite(dest, d, sito) {
  const giorni = (Array.isArray(d.giorni) ? d.giorni : []).slice(0, 31);
  const righe = giorni.map((g) => '<tr><td style="padding:4px 14px 4px 0;white-space:nowrap"><b>' + esc(giornoLungo(String(g.data))) + '</b></td>'
    + '<td style="padding:4px 0">' + esc(g.attivita || '') + (g.partita ? ' · ' + esc(g.partita) : '') + '</td></tr>').join('');
  return {
    to: dest.email,
    subject: 'Richiesta on-site: ' + d.luogo + ' · ' + periodoBreve(d.da, d.a),
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5"><p>Ciao ' + esc(String(dest.nome || '').split(' ')[0]) + ',</p>'
      + '<p>i supervisori cercano operatori per un deployment on-site' + (d.titolo ? ': <b>' + esc(d.titolo) + '</b>' : '') + '.</p>'
      + '<p><b>' + esc(d.luogo || '') + '</b> · ' + esc(d.sport || '') + (dest.ruolo ? '<br>Posto richiesto: <b>on-site ' + esc(dest.ruolo) + '</b>' : '') + '</p>'
      + '<table style="border-collapse:collapse">' + righe + '</table>'
      + (d.note ? '<p style="padding:10px 14px;background:#f3f4f6;border-radius:8px">' + esc(String(d.note).slice(0, 500)) + '</p>' : '')
      + (sito ? tasto(sito, 'Rispondi sulla piattaforma') : '')
      + '<p style="color:#8b919c;font-size:12px">I posti vanno a chi accetta prima. Per entrare usa il tuo codice personale.</p></div>',
  };
}

function emailOnsite(r) {
  verificaSupervisore(r.idToken);
  const sito = /^https:\/\//.test(String(r.urlSito || '')) ? String(r.urlSito) : '';
  const d = r.deployment || {};
  const esito = { email: 0, nonInviate: [], senzaPosto: [] };
  (Array.isArray(r.destinatari) ? r.destinatari : []).slice(0, 100).forEach((dest) => {
    // chi ha un ruolo senza posti non vedrebbe la richiesta sulla sua pagina: niente email
    if (!(Number((d.posti || {})[dest.ruolo] || 0) > 0)) { esito.senzaPosto.push(dest.nome); return; }
    if (!EMAIL_VALIDA.test(String(dest.email || ''))) { esito.nonInviate.push(dest.nome); return; }
    try {
      MailApp.sendEmail(Object.assign({ name: CONFIG.MITTENTE }, testoEmailOnsite(dest, d, sito)));
      esito.email++;
    } catch (e) {
      esito.nonInviate.push(dest.nome);
    }
  });
  esito.quotaRestante = MailApp.getRemainingDailyQuota();
  return esito;
}

// Ai supervisori: chi ha accettato, con che ruolo, e quanti posti restano
function testoNotificaOnsite(nome, ruolo, d, convocazioni) {
  return {
    subject: 'On-site accettato: ' + nome + ' · ' + d.luogo + ' ' + periodoBreve(d.da, d.a),
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5"><p><b>' + esc(nome) + '</b> ha accettato il deployment on-site a <b>'
      + esc(d.luogo || '') + '</b>' + (d.titolo ? ' (' + esc(d.titolo) + ')' : '') + ', ' + esc(periodoBreve(d.da, d.a)) + ', come <b>on-site ' + esc(ruolo) + '</b>.</p>'
      + '<p>Posti: <b>' + esc(etichettaPosti(d)) + '</b></p>'
      + (convocazioni ? tasto(convocazioni, 'Apri le convocazioni') : '') + '</div>',
  };
}

// L'operatore ha accettato: lo script rilegge il deployment con il suo gettone e controlla che sia fra gli accettati.
function notificaOnsite(r) {
  const op = verificaOperatore(r.idToken);
  const letto = firestore('onsite/' + encodeURIComponent(String(r.id || '')), r.idToken);
  if (letto.codice !== 200) throw new Error('Accesso non consentito.');
  const d = daFirestore(letto.dati);
  const ruolo = ['TL', 'OP'].find((x) => (Array.isArray(d['accettati' + x]) ? d['accettati' + x] : []).indexOf(op.id) >= 0);
  if (!ruolo) throw new Error('Accesso non consentito.');
  if (d.stato === 'annullata') return { inviata: false };
  const imp = leggiImpostazioni();
  if (!imp.emailAttive || !imp.emailSupervisori) return { inviata: false };
  // al massimo un'email al minuto per operatore e deployment (un altro deployment accettato subito dopo ha la sua)
  const cache = CacheService.getScriptCache(), chiave = 'onsite-' + op.uid + '-' + String(r.id || '');
  if (cache.get(chiave)) return { inviata: false };
  cache.put(chiave, '1', CONFIG.PAUSA_NOTIFICHE_SECONDI);
  const testo = testoNotificaOnsite(op.nome, ruolo, d, indirizzi(imp.urlAdmin).convocazioni);
  MailApp.sendEmail({ to: imp.emailSupervisori, name: CONFIG.MITTENTE, subject: testo.subject, htmlBody: testo.htmlBody });
  return { inviata: true };
}

// ---------------------------------------------------------------- richiesta di disponibilità per un evento

// "Roma-Lazio" / "Turno Remote TL"; "Serie A, giornata 9"; "evento 20:45 · ritrovo 16:45 – fine 22:45" / "turno 10:00 – 16:00"
const nomeEvento = (e) => (eTurno(e) ? 'Turno ' + TURNI_REMOTI[e.tipo] : String(e.titolo || 'Partita'));
const gareEvento = (e) => (eTurno(e) ? '' : [e.competizione, e.round && (/^\d+$/.test(String(e.round)) ? 'giornata ' + e.round : e.round)].filter(Boolean).join(', '));
function orariEvento(e) {
  if (eTurno(e)) return 'turno ' + (e.ritrovo || '—') + (e.fine ? ' – ' + e.fine : '');
  return (e.orario ? 'evento ' + e.orario + ' · ' : '') + 'ritrovo ' + (e.ritrovo || '—') + (e.fine ? ' – fine ' + e.fine : '');
}

// All'operatore: partita, giorno e orari, messaggio dei supervisori. Si risponde sulla piattaforma.
function testoEmailRichiestaEvento(dest, e, messaggio, sito) {
  return {
    to: dest.email,
    subject: 'Sei disponibile? ' + nomeEvento(e) + ' · ' + giornoLungo(String(e.data)),
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5"><p>Ciao ' + esc(String(dest.nome || '').split(' ')[0]) + ',</p>'
      + '<p>i supervisori ti chiedono se sei disponibile per:</p>'
      + '<p><b>' + esc(nomeEvento(e)) + '</b>' + (gareEvento(e) ? '<br>' + esc(gareEvento(e)) : '')
      + '<br>' + esc(giornoLungo(String(e.data))) + ' · ' + esc(orariEvento(e)) + '</p>'
      + (messaggio ? '<p style="padding:10px 14px;background:#f3f4f6;border-radius:8px">' + esc(messaggio).replace(/\n/g, '<br>') + '</p>' : '')
      + (sito ? tasto(sito, 'Rispondi sulla piattaforma') : '')
      + '<p style="color:#8b919c;font-size:12px">Per entrare usa il tuo codice personale.</p></div>',
  };
}

function emailRichiestaEvento(r) {
  verificaSupervisore(r.idToken);
  const sito = /^https:\/\//.test(String(r.urlSito || '')) ? String(r.urlSito) : '';
  const e = r.evento || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.data || ''))) throw new Error('Evento non valido.');
  const messaggio = String(r.messaggio || '').slice(0, 300);
  const esito = { email: 0, nonInviate: [] };
  (Array.isArray(r.destinatari) ? r.destinatari : []).slice(0, 100).forEach((dest) => {
    if (!EMAIL_VALIDA.test(String(dest.email || ''))) { esito.nonInviate.push(dest.nome); return; }
    try {
      MailApp.sendEmail(Object.assign({ name: CONFIG.MITTENTE }, testoEmailRichiestaEvento(dest, e, messaggio, sito)));
      esito.email++;
    } catch (err) {
      esito.nonInviate.push(dest.nome);
    }
  });
  esito.quotaRestante = MailApp.getRemainingDailyQuota();
  return esito;
}

// Ai supervisori: chi è disponibile per quale partita
function testoNotificaRispostaEvento(nome, e, convocazioni) {
  const giorno = giornoLungo(String(e.data || ''));
  return {
    subject: nome + ' è disponibile per ' + nomeEvento(e) + ' (' + giorno + ')',
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5"><p><b>' + esc(nome) + '</b> è disponibile per <b>'
      + esc(nomeEvento(e)) + '</b> (' + esc(giorno) + ').</p>'
      + '<p>' + (gareEvento(e) ? esc(gareEvento(e)) + ' · ' : '') + esc(orariEvento(e)) + '</p>'
      + (convocazioni ? tasto(convocazioni, 'Apri le convocazioni') : '') + '</div>',
  };
}

// L'operatore ha detto sì: lo script rilegge la richiesta con il suo gettone e controlla la sua risposta.
function notificaRispostaEvento(r) {
  const op = verificaOperatore(r.idToken);
  const letto = firestore('richiesteEvento/' + encodeURIComponent(String(r.id || '')), r.idToken);
  if (letto.codice !== 200) throw new Error('Accesso non consentito.');
  const d = daFirestore(letto.dati);
  const risposta = (d.risposte || {})[op.id];
  if (!risposta || risposta.r !== 'si') return { inviata: false };
  const imp = leggiImpostazioni();
  if (!imp.emailAttive || !imp.emailSupervisori) return { inviata: false };
  const testo = testoNotificaRispostaEvento(op.nome, d.evento || {}, indirizzi(imp.urlAdmin).convocazioni);
  MailApp.sendEmail({ to: imp.emailSupervisori, name: CONFIG.MITTENTE, subject: testo.subject, htmlBody: testo.htmlBody });
  return { inviata: true };
}

// ---------------------------------------------------------------- backup settimanale in Excel
// Ogni venerdì (attivatore inviaBackup) lo script legge gli eventi della stagione e manda ai supervisori un .xlsx
// nel formato del file della stagione, con in più le colonne che servono al ripristino (ID, stato, tipo…).

// La stagione sportiva parte il 1° agosto
function stagioneDa(oggi) {
  const anno = Number(String(oggi).slice(0, 4)), mese = Number(String(oggi).slice(5, 7));
  return (mese >= 8 ? anno : anno - 1) + '-08-01';
}
// giorni dal 30/12/1899, come conta Excel
function giornoExcel(iso) {
  return Math.round(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 864e5) + 25569;
}

const STATI_BACKUP = { 'da-assegnare': 'Da assegnare', assegnato: 'Da inviare', convocato: 'In attesa di risposta', confermato: 'Confermato', rifiutato: 'Rifiutato', annullato: 'Annullato' };
const RUOLI_BACKUP = { OP: 'Remote OP', SUP: 'Remote Support', TL: 'Remote TL' };
const COMPENSI_BACKUP = { diurno: 'Diurno', notturno: 'Notturno', maggiorato: 'Maggiorato', dimezzato: 'Dimezzato' };
const STATI_DISP_BACKUP = { D: 'Disponibile', P: 'Parziale', A: 'Non disponibile' };
const TARIFFE_INIZIALI = { 'P.IVA': { diurno: 140, notturno: 210, maggiorato: 210 }, Coop: { diurno: 175, notturno: 262.5, maggiorato: 262.5 } };

// Righe dei quattro fogli. Le date sono { data: 'aaaa-mm-gg' } (diventano date di Excel), il resto testo o numeri.
function righeBackup(d, adesso) {
  const oggi = Utilities.formatDate(adesso, 'Europe/Rome', 'yyyy-MM-dd');
  const inizio = Number(stagioneDa(oggi).slice(0, 4));
  const titolo = 'Backup eventi · Disponibilità Ops TGI Sport · ' + giornoLungo(oggi) + ' alle ' + Utilities.formatDate(adesso, 'Europe/Rome', 'HH:mm')
    + ' · stagione ' + inizio + '/' + String(inizio + 1).slice(2);
  const lista = (x) => (Array.isArray(x) ? x : []);
  const t = (v) => (v == null ? '' : String(v));
  const perId = {};
  lista(d.operatori).forEach((o) => { perId[o.id] = o; });
  const nome = (id) => (perId[id] ? t(perId[id].nome) : '');
  const ritrovo = (e) => t(e.convocazione || e.convocazioneCalcolata);

  const eventi = lista(d.eventi).slice().sort((a, b) => t(a.data).localeCompare(t(b.data)) || ritrovo(a).localeCompare(ritrovo(b)));
  const convocazioni = [[titolo], ['Competizione', 'Round', 'Sport', 'Data', 'Partita / turno', 'Orario evento', 'Ritrovo', 'Operatore', 'Fine turno', 'Conferma',
    'Note', 'Stato', 'Gettone maggiorato', 'Da sostituire', 'Tipo', 'ID evento', 'Ritrovo scritto a mano', 'Fine scritta a mano', 'Inviata', 'Motivo del rifiuto', 'ID operatore']]
    .concat(eventi.map((e) => {
      const turno = eTurno(e), nomeTurno = turno ? TURNI_REMOTI[e.tipo] : '';
      return [turno ? nomeTurno : t(e.competizione), turno ? '' : t(e.round), turno ? '' : t(e.sport), { data: t(e.data) }, turno ? nomeTurno : t(e.titolo),
        turno ? '' : t(e.orario), ritrovo(e), nome(e.operatoreId), t(e.fine || e.fineCalcolata), e.stato === 'confermato' ? 'SI' : '', t(e.note),
        STATI_BACKUP[e.stato] || t(e.stato), e.gettone === 'maggiorato' ? 'SI' : '', e.daSostituire ? 'SI' : '', turno ? nomeTurno : 'Partita', t(e.id),
        t(e.convocazione), t(e.fine), e.inviata ? 'SI' : '', t(e.risposta), t(e.operatoreId)];
    }));

  const statiOnsite = { aperta: 'Aperta', chiusa: 'Chiusa', annullata: 'Annullata' };
  // da O a V ciò che serve per ripristinarlo: ID del deployment e degli operatori
  const onsite = [['Luogo', 'Sport', 'Titolo', 'Dal', 'Al', 'Giorno', 'Attività', 'Partita', 'Posti TL', 'Posti OP', 'On-site TL', 'On-site OP', 'Stato', 'Compenso',
    'ID deployment', 'Note', 'Destinatari', 'Accettati TL', 'Accettati OP', 'Hanno rifiutato', 'Esclusi', 'Creato']];
  const ids = (x) => lista(x).map(t).join(', ');
  lista(d.onsite).slice().sort((a, b) => t(a.da).localeCompare(t(b.da))).forEach((x) => {
    const posti = x.posti || {}, compensi = d.compensi || {};
    lista(x.giorni).forEach((g) => onsite.push([t(x.luogo), t(x.sport), t(x.titolo), { data: t(x.da) }, { data: t(x.a) }, { data: t(g.data) }, t(g.attivita), t(g.partita),
      Number(posti.TL || 0) || 0, Number(posti.OP || 0) || 0, lista(x.accettatiTL).map(nome).join(', '), lista(x.accettatiOP).map(nome).join(', '),
      statiOnsite[x.stato] || t(x.stato), Number(compensi[x.id] || 0),
      t(x.id), t(x.note), ids(x.destinatari), ids(x.accettatiTL), ids(x.accettatiOP), ids(x.rifiuti), ids(x.esclusi), t(x.creato)]));
  });

  const ops = lista(d.operatori).slice().sort((a, b) => t(a.nome).localeCompare(t(b.nome), 'it'));
  const operatori = [['Nome', 'Mansione', 'Ruolo', 'Contratto', 'Email', 'Telefono', 'On-site', 'Attivo', 'ID']]
    .concat(ops.map((o) => [t(o.nome), t(o.mansione), RUOLI_BACKUP[o.ruolo] || 'Remote OP', t(o.contratto), t(o.email), t(o.telefono), t(o.onsite), o.attivo === false ? 'NO' : 'SI', t(o.id)]));

  // Impostazioni: stesse colonne del file della stagione (A/B voci, D/E operatori, G sport, I competizioni) più compenso, ore e colore
  const r = d.regole || {};
  const tariffa = (contratto, tipo) => {
    const v = ((r.tariffe || {})[contratto] || {})[tipo];
    return typeof v === 'number' ? v : TARIFFE_INIZIALI[contratto][tipo];
  };
  const voci = [];
  ['P.IVA', 'Coop'].forEach((c) => ['diurno', 'notturno', 'maggiorato'].forEach((tipo) => voci.push(['Netto ' + c + ' ' + tipo, tariffa(c, tipo)])));
  voci.push(['Tariffa on-site (€ al giorno)', typeof r.tariffaOnsite === 'number' ? r.tariffaOnsite : 150]);
  voci.push(['Notturno dalle', t(r.notteDa || '22:00')], ['Notturno alle', t(r.notteA || '06:00')]);
  const op = d.operativo || {};
  voci.push(['Telefono di reperibilità', t(op.telefono)], ['Giorni di blocco', typeof op.giorniBlocco === 'number' ? op.giorniBlocco : 3]);
  const ore = (v, generale) => (typeof v === 'number' && isFinite(v) ? v : generale);
  const anticipo = ore(r.anticipoOre, 4), dopo = ore(r.fineOre, 2);
  const salvate = lista(r.competizioni);
  const durataTL = typeof r.durataSupervisioneOre === 'number' && r.durataSupervisioneOre >= 0.5 && r.durataSupervisioneOre <= 16 ? r.durataSupervisioneOre : 6;
  const mansioni = ['Remote TL', 'Remote Support'].map((n) => {
    const s = salvate.find((c) => c.nome === n) || {};
    return [n, COMPENSI_BACKUP[s.compenso] || 'Diurno', 0, ore(s.dopo, n === 'Remote TL' ? durataTL : 6) || (n === 'Remote TL' ? durataTL : 6), t(s.colore), ''];
  });
  const competizioni = mansioni.concat(salvate.filter((c) => ['Remote TL', 'Remote Support'].indexOf(c.nome) < 0).map((c) => [t(c.nome),
    COMPENSI_BACKUP[c.compenso] || (c.uefa ? 'Dimezzato' : 'Diurno'), ore(c.prima, anticipo), ore(c.dopo, dopo), t(c.colore), t(c.sport)]));
  const sport = lista(r.sport);
  const n = Math.max(voci.length, ops.length, sport.length, competizioni.length);
  const impostazioni = [['Voce', 'Valore', '', 'Operatore', 'Contratto', '', 'Sport', '', 'Competizione / mansione', 'Compenso', 'Ore prima', 'Ore dopo', 'Colore', 'Sport della competizione']];
  for (let i = 0; i < n; i++) {
    const v = voci[i] || ['', ''], o = ops[i], c = competizioni[i] || ['', '', '', '', '', ''];
    impostazioni.push([v[0], v[1], '', o ? t(o.nome) : '', o ? t(o.contratto) : '', '', t(sport[i] || ''), ''].concat(c));
  }

  // Disponibilità: una riga per operatore e giorno della stagione con uno stato o una nota; chi non è più in elenco in fondo
  const giorniDisp = [];
  lista(d.disponibilita).forEach((x) => {
    const g = x.giorni && typeof x.giorni === 'object' ? x.giorni : {};
    Object.keys(g).forEach((data) => {
      const v = g[data] || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data < stagioneDa(oggi) || (!STATI_DISP_BACKUP[v.s] && !t(v.n))) return;
      giorniDisp.push({ id: t(x.id), nome: nome(x.id), data, stato: STATI_DISP_BACKUP[v.s] || '', nota: t(v.n) });
    });
  });
  const chiaveDisp = (x) => (x.nome ? '0' + x.nome : '1' + x.id);
  giorniDisp.sort((a, b) => chiaveDisp(a).localeCompare(chiaveDisp(b), 'it') || a.data.localeCompare(b.data));
  const disponibilita = [['Operatore', 'Data', 'Stato', 'Nota', 'ID operatore']]
    .concat(giorniDisp.map((x) => [x.nome, { data: x.data }, x.stato, x.nota, x.id]));

  return { titolo, convocazioni, onsite, operatori, impostazioni, disponibilita,
    conteggi: { eventi: eventi.length, annullati: eventi.filter((e) => e.stato === 'annullato').length, deployment: lista(d.onsite).length,
      operatoriDisponibilita: new Set(giorniDisp.map((x) => x.id)).size } };
}

// ---------------------------------------------------------------- backup: file .xlsx scritto a mano (parti XML in uno zip)

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// testo per l'XML: entità, niente caratteri vietati in XML, e «_xHHHH_» scritto da qualcuno resta testo (Excel lo decodificherebbe)
const escXml = (t) => String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/_x([0-9A-Fa-f]{4})_/g, '_x005F_x$1_')
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
function colonnaExcel(n) {
  let s = '';
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function xmlFoglio(righe) {
  const celle = (riga, r) => riga.map((v, c) => {
    const rif = colonnaExcel(c) + r;
    if (v && typeof v === 'object' && v.data) return /^\d{4}-\d{2}-\d{2}$/.test(v.data) ? '<c r="' + rif + '" s="1"><v>' + giornoExcel(v.data) + '</v></c>' : '';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + rif + '"><v>' + v + '</v></c>';
    return v === '' || v == null ? '' : '<c r="' + rif + '" t="inlineStr"><is><t xml:space="preserve">' + escXml(v) + '</t></is></c>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="30" width="16" customWidth="1"/></cols><sheetData>'
    + righe.map((riga, i) => '<row r="' + (i + 1) + '">' + celle(riga, i + 1) + '</row>').join('') + '</sheetData></worksheet>';
}

// fogli = [{ nome, righe }] → Blob .xlsx
function fileBackup(fogli, nome) {
  const NS = 'http://schemas.openxmlformats.org';
  const testa = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const parti = [
    ['[Content_Types].xml', testa + '<Types xmlns="' + NS + '/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + fogli.map((f, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')
      + '</Types>'],
    ['_rels/.rels', testa + '<Relationships xmlns="' + NS + '/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="' + NS + '/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', testa + '<workbook xmlns="' + NS + '/spreadsheetml/2006/main" xmlns:r="' + NS + '/officeDocument/2006/relationships"><sheets>'
      + fogli.map((f, i) => '<sheet name="' + escXml(f.nome) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', testa + '<Relationships xmlns="' + NS + '/package/2006/relationships">'
      + fogli.map((f, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + NS + '/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
      + '<Relationship Id="rId' + (fogli.length + 1) + '" Type="' + NS + '/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', testa + '<styleSheet xmlns="' + NS + '/spreadsheetml/2006/main">'
      + '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>'
      + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>'],
  ].concat(fogli.map((f, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', xmlFoglio(f.righe)]));
  const zip = Utilities.zip(parti.map(([percorso, xml]) => Utilities.newBlob(xml, 'application/xml', percorso)), nome);
  return Utilities.newBlob(zip.getBytes(), XLSX_MIME, nome);
}

// ---------------------------------------------------------------- backup: lettura e invio

function leggiDatiBackup(oggi) {
  const da = stagioneDa(oggi);
  const cerca = (raccolta, campo) => {
    const r = letturaAdmin(firestoreAdmin('post', ':runQuery', { structuredQuery: {
      from: [{ collectionId: raccolta }],
      where: { fieldFilter: { field: { fieldPath: campo }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: da } } },
    } }));
    return (Array.isArray(r.dati) ? r.dati : []).filter((x) => x.document).map((x) => daFirestore(x.document));
  };
  const compensi = {};
  elencoAdmin('onsiteRiservato').forEach((x) => { compensi[x.id] = x.compenso; });
  const regole = letturaAdmin(firestoreAdmin('get', '/impostazioni/regole'), [404]);
  const operativo = letturaAdmin(firestoreAdmin('get', '/impostazioni/operativo'), [404]);
  return { eventi: cerca('eventi', 'data'), onsite: cerca('onsite', 'a'), compensi, operatori: elencoAdmin('operatori'),
    regole: regole.codice === 200 ? daFirestore(regole.dati) : {}, operativo: operativo.codice === 200 ? daFirestore(operativo.dati) : {},
    disponibilita: elencoAdmin('disponibilita') };
}

// Il backup del venerdì (o subito, con forza). Ogni esito, anche un errore, resta in ULTIMO_BACKUP per la dashboard.
function giroBackup(adesso, opzioni) {
  const imp = leggiImpostazioni();
  if (!(opzioni && opzioni.forza) && !imp.backupAttivo) return { saltato: 'spento' };
  const destinatari = String(imp.emailSupervisori || '').split(',').filter(Boolean);
  // «Invia un backup adesso» ripetuto subito agli stessi indirizzi (nuovo tentativo della pagina dopo una risposta persa):
  // non si rispedisce, e la dashboard lo dice
  const u = imp.ultimoBackup;
  if (opzioni && opzioni.forza && u && !u.errore && u.indirizzi === destinatari.join(',') && adesso.getTime() - new Date(u.quando).getTime() < 2 * 60000) {
    return { inviato: true, eventi: u.eventi, deployment: u.deployment, destinatari: u.destinatari, ripetuto: true, quando: u.quando };
  }
  const registra = (dati) => PropertiesService.getScriptProperties().setProperty('ULTIMO_BACKUP', JSON.stringify(Object.assign({ quando: adesso.toISOString() }, dati)));
  try {
    if (!destinatari.length) throw new Error('Nessun indirizzo dei supervisori in Impostazioni → Notifiche email.');
    const oggi = Utilities.formatDate(adesso, 'Europe/Rome', 'yyyy-MM-dd');
    const r = righeBackup(leggiDatiBackup(oggi), adesso);
    const nome = 'Backup_TGI_Sport_' + oggi + '.xlsx';
    const file = fileBackup([{ nome: 'Convocazioni', righe: r.convocazioni }, { nome: 'On-site', righe: r.onsite },
      { nome: 'Operatori', righe: r.operatori }, { nome: 'Impostazioni', righe: r.impostazioni }, { nome: 'Disponibilità', righe: r.disponibilita }], nome);
    const c = r.conteggi, inizio = Number(stagioneDa(oggi).slice(0, 4));
    const dashboard = /^https:\/\//.test(imp.urlAdmin) ? imp.urlAdmin.replace(/#.*$/, '') : '';
    MailApp.sendEmail({
      to: destinatari.join(','),
      name: CONFIG.MITTENTE,
      subject: 'Backup eventi TGI Sport · ' + giornoLungo(oggi),
      htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#15171c;line-height:1.5">'
        + '<p>In allegato il backup degli eventi della stagione <b>' + inizio + '/' + String(inizio + 1).slice(2) + '</b>: <b>' + c.eventi + ' eventi</b> ('
        + c.annullati + (c.annullati === 1 ? ' annullato' : ' annullati') + '), ' + c.deployment + ' deployment on-site e le disponibilità di '
        + c.operatoriDisponibilita + (c.operatoriDisponibilita === 1 ? ' operatore' : ' operatori') + '.</p>'
        + '<p>Per ripristinare: dashboard → Impostazioni → Importa dal file Excel → scegli questo file.</p>'
        + (dashboard ? tasto(dashboard, 'Apri la dashboard') : '') + '</div>',
      attachments: [file],
    });
    // copia su Drive: se non riesce il backup resta valido (l'email è partita), la dashboard mostra il motivo
    let drive = 'salvato';
    try { salvaSuDrive(file, nome); } catch (e) { drive = 'errore: ' + e.message; console.error('Copia su Drive non riuscita: ' + e.message); }
    registra({ eventi: c.eventi, annullati: c.annullati, deployment: c.deployment, destinatari: destinatari.length, indirizzi: destinatari.join(','), errore: '', drive });
    return { inviato: true, eventi: c.eventi, deployment: c.deployment, destinatari: destinatari.length };
  } catch (e) {
    registra({ errore: e.message });
    console.error('Backup non riuscito: ' + e.message);
    throw e;
  }
}

// ---------------------------------------------------------------- backup: copia su Google Drive
// API di Drive con il gettone del proprietario e l'autorizzazione drive.file: lo script vede solo la cartella e i file che crea lui
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const CARTELLA_BACKUP = 'Backup Disponibilità Ops';
const BACKUP_SU_DRIVE = 52;

function chiamaDrive(metodo, url, opzioni) {
  const r = UrlFetchApp.fetch(url, Object.assign({ method: metodo, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }, opzioni || {}));
  const dati = jsonSicuro(r.getContentText());
  if (r.getResponseCode() >= 300) throw new Error('Drive ' + r.getResponseCode() + (dati.error && dati.error.message ? ': ' + dati.error.message : ''));
  return dati;
}
const cercaDrive = (q) => chiamaDrive('get', DRIVE + '?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('files(id,name,createdTime)') + '&pageSize=1000').files || [];
const nelCestino = (f) => chiamaDrive('patch', DRIVE + '/' + encodeURIComponent(f.id) + '?fields=id', { contentType: 'application/json', payload: JSON.stringify({ trashed: true }) });

// La cartella dei backup: quella ricordata nelle proprietà, oppure una nuova (la prima volta o se è stata cancellata)
function cartellaBackup() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('BACKUP_CARTELLA');
  if (id) {
    try {
      if (!chiamaDrive('get', DRIVE + '/' + encodeURIComponent(id) + '?fields=id,trashed').trashed) return id;
    } catch (e) { /* cartella sparita: se ne crea una nuova */ }
  }
  const nuova = chiamaDrive('post', DRIVE + '?fields=id', { contentType: 'application/json', payload: JSON.stringify({ name: CARTELLA_BACKUP, mimeType: 'application/vnd.google-apps.folder' }) });
  p.setProperty('BACKUP_CARTELLA', nuova.id);
  return nuova.id;
}

function salvaSuDrive(file, nome) {
  const cartella = cartellaBackup();
  // backup ripetuto nello stesso giorno: il file di prima nel cestino
  cercaDrive("'" + cartella + "' in parents and trashed = false and name = '" + nome + "'").forEach(nelCestino);
  const confine = 'confine-backup-tgi-sport';
  const testa = '--' + confine + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: nome, parents: [cartella] })
    + '\r\n--' + confine + '\r\nContent-Type: ' + XLSX_MIME + '\r\n\r\n';
  const corpo = Utilities.newBlob(testa).getBytes().concat(file.getBytes(), Utilities.newBlob('\r\n--' + confine + '--').getBytes());
  const nuovo = chiamaDrive('post', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { contentType: 'multipart/related; boundary=' + confine, payload: corpo });
  // si tengono i 52 più recenti; i più vecchi nel cestino di Drive
  const tutti = cercaDrive("'" + cartella + "' in parents and trashed = false and name contains 'Backup_TGI_Sport_'");
  tutti.sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)) || String(b.name).localeCompare(String(a.name)));
  tutti.slice(BACKUP_SU_DRIVE).forEach(nelCestino);
  return { id: nuovo.id };
}

// Da eseguire una volta dall'editor dopo l'aggiornamento: chiede il permesso per Drive e prepara la cartella dei backup
function autorizzaDrive() {
  console.log('Cartella «' + CARTELLA_BACKUP + '» pronta su Drive: https://drive.google.com/drive/folders/' + cartellaBackup());
}

// Attivatore del venerdì (creato da attivaPromemoria)
function inviaBackup() {
  giroBackup(new Date());
}

