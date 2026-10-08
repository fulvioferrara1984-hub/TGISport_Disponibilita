/**
 * Disponibilità Ops · TGI Sport — invio delle email
 * I dati stanno su Firebase; questo Google Apps Script serve solo a spedire le email, in sottofondo:
 *  - ai supervisori, quando un operatore invia le disponibilità;
 *  - agli operatori, quando i supervisori chiedono le disponibilità per un periodo.
 * Chi chiama viene riconosciuto chiedendo a Firestore, con il suo gettone di accesso, di leggere
 * dati che le regole di sicurezza mostrano solo a lui: niente password o segreti qui dentro.
 */

const CONFIG = {
  FIREBASE_PROJECT_ID: 'INCOLLA-QUI-IL-PROJECT-ID',   // Impostazioni progetto di Firebase → ID progetto
  MITTENTE: 'Disponibilità Ops · TGI Sport',
  PAUSA_NOTIFICHE_SECONDI: 60,                        // al massimo un'email ai supervisori al minuto per operatore
};

const STATI = { D: 'Disponibile', P: 'Parziale', A: 'Non disponibile' };

// ---------------------------------------------------------------- ingresso

function doPost(e) {
  let risposta;
  try {
    const r = JSON.parse(e.postData.contents);
    const azioni = { notificaInvio, emailRichiesta, leggiImpostazioni: soloSupervisori(leggiImpostazioni), salvaImpostazioni: soloSupervisori(salvaImpostazioni) };
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

// ---------------------------------------------------------------- chi sta chiamando

function firestore(percorso, idToken) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.FIREBASE_PROJECT_ID + '/databases/(default)/documents/' + percorso;
  const r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  return { codice: r.getResponseCode(), dati: JSON.parse(r.getContentText() || '{}') };
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

// "dall'8 al 14 ottobre", "dal 28 ottobre all'11 novembre"
function periodoLeggibile(da, a) {
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const data = (iso) => Number(iso.slice(8)) + ' ' + mesi[Number(iso.slice(5, 7)) - 1];
  const art = (iso, base) => ([1, 8, 11].indexOf(Number(iso.slice(8))) >= 0 ? base + "ll'" : base + 'l ');
  const inizio = da.slice(0, 7) === a.slice(0, 7) ? String(Number(da.slice(8))) : data(da);
  return art(da, 'da') + inizio + ' ' + art(a, 'a') + data(a);
}

// ---------------------------------------------------------------- impostazioni (proprietà dello script)

function leggiImpostazioni() {
  const p = PropertiesService.getScriptProperties().getProperties();
  return { emailSupervisori: p.EMAIL_SUPERVISORI || '', emailAttive: p.EMAIL_ATTIVE !== 'NO', urlAdmin: p.URL_ADMIN || '' };
}

function salvaImpostazioni(r) {
  const email = String(r.emailSupervisori || '').split(/[,;\s]+/).filter(Boolean);
  if (email.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) throw new Error('Controlla gli indirizzi email dei supervisori.');
  const url = String(r.urlAdmin || '');
  PropertiesService.getScriptProperties().setProperties({
    EMAIL_SUPERVISORI: email.join(','),
    EMAIL_ATTIVE: r.emailAttive === false ? 'NO' : 'SI',
    URL_ADMIN: /^https:\/\//.test(url) ? url : '',
  });
  return leggiImpostazioni();
}
