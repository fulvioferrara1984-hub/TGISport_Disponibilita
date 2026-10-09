// Lo script di Google (backend/Codice.gs) caricato in un contesto vm, con le funzioni di Google simulate.
// Usato dalle prove dei promemoria e delle email on-site.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODICE = fs.readFileSync(path.join(__dirname, '../backend/Codice.gs'), 'utf8');

// Utilities.formatDate di Google, per i soli formati usati dallo script
function formatta(data, fuso, formato) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data).map((x) => [x.type, x.value]));
  return formato.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
}

// stub: { proprieta: {}, risposte: (url, opzioni) => ({ codice, dati }), erroreEmail: (email) => boolean, attivatori: [nomi funzione] }
function carica(stub = {}) {
  const prop = new Map(Object.entries(stub.proprieta || {}));
  const email = [], chiamate = [], registro = [];
  const attivatori = (stub.attivatori || []).map((nome) => ({ getHandlerFunction: () => nome }));
  const creati = [], tolti = [];
  const catena = (nome) => {
    const c = { impostazioni: {} };
    ['timeBased', 'everyDays', 'atHour', 'inTimezone'].forEach((m) => { c[m] = (v) => { c.impostazioni[m] = v === undefined ? true : v; return c; }; });
    c.create = () => { const t = { getHandlerFunction: () => nome, impostazioni: c.impostazioni }; creati.push(t); attivatori.push(t); return t; };
    return c;
  };
  const gs = {
    console: { log: (...a) => registro.push(a.join(' ')), error: (...a) => registro.push(a.join(' ')) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => Object.fromEntries(prop),
        getProperty: (k) => (prop.has(k) ? prop.get(k) : null),
        setProperty: (k, v) => { prop.set(k, String(v)); },
        setProperties: (o) => { Object.entries(o).forEach(([k, v]) => prop.set(k, String(v))); },
        deleteProperty: (k) => { prop.delete(k); },
      }),
    },
    MailApp: {
      sendEmail: (m) => { if (stub.erroreEmail && stub.erroreEmail(m)) throw new Error('Invio non riuscito'); email.push(m); },
      getRemainingDailyQuota: () => 90,
    },
    UrlFetchApp: {
      fetch: (url, opzioni = {}) => {
        chiamate.push({ url, opzioni });
        const r = (stub.risposte || (() => ({ codice: 404, dati: {} })))(url, opzioni);
        return { getResponseCode: () => r.codice, getContentText: () => JSON.stringify(r.dati) };
      },
    },
    ScriptApp: {
      getOAuthToken: () => 'gettone-prova',
      getProjectTriggers: () => attivatori.slice(),
      deleteTrigger: (t) => { tolti.push(t); attivatori.splice(attivatori.indexOf(t), 1); },
      newTrigger: (nome) => catena(nome),
    },
    Utilities: {
      formatDate: formatta,
      base64DecodeWebSafe: (s) => [...Buffer.from(s, 'base64url')],
      newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  };
  vm.createContext(gs);
  vm.runInContext(CODICE, gs);
  return { gs, prop, email, chiamate, registro, attivatori, creati, tolti };
}

// gli oggetti creati nel contesto vm hanno prototipi diversi: si confrontano dopo un passaggio in JSON
const j = (x) => JSON.parse(JSON.stringify(x));

module.exports = { carica, j, formatta };
