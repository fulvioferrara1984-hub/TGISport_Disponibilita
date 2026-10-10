// Lo script di Google (backend/Codice.gs) caricato in un contesto vm, con le funzioni di Google simulate.
// Usato dalle prove dei promemoria e delle email on-site.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const CODICE = fs.readFileSync(path.join(__dirname, '../backend/Codice.gs'), 'utf8');

// Utilities.formatDate di Google, per i soli formati usati dallo script
function formatta(data, fuso, formato) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data).map((x) => [x.type, x.value]));
  return formato.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
}

// Blob di Google: testo o byte, con tipo e nome
function blob(dati, tipo, nome) {
  const buf = typeof dati === 'string' ? Buffer.from(dati, 'utf8') : Buffer.from(dati);
  const b = {
    nome: nome || '', tipo: tipo || '',
    getBytes: () => [...buf], getDataAsString: () => buf.toString('utf8'),
    getName: () => b.nome, setName: (n) => { b.nome = n; return b; }, getContentType: () => b.tipo, setContentType: (t) => { b.tipo = t; return b; },
  };
  return b;
}

// Utilities.zip: uno zip vero, senza compressione (si apre con Excel e con la libreria dell'importazione)
function zipSemplice(blobs) {
  const locali = [], centrali = [];
  let posizione = 0;
  blobs.forEach((b) => {
    const nome = Buffer.from(b.getName(), 'utf8'), dati = Buffer.from(b.getBytes()), crc = zlib.crc32(dati);
    const testa = Buffer.alloc(30);
    testa.writeUInt32LE(0x04034b50, 0); testa.writeUInt16LE(20, 4); testa.writeUInt16LE(0x0800, 6);
    testa.writeUInt32LE(crc, 14); testa.writeUInt32LE(dati.length, 18); testa.writeUInt32LE(dati.length, 22); testa.writeUInt16LE(nome.length, 26);
    const centro = Buffer.alloc(46);
    centro.writeUInt32LE(0x02014b50, 0); centro.writeUInt16LE(20, 4); centro.writeUInt16LE(20, 6); centro.writeUInt16LE(0x0800, 8);
    centro.writeUInt32LE(crc, 16); centro.writeUInt32LE(dati.length, 20); centro.writeUInt32LE(dati.length, 24); centro.writeUInt16LE(nome.length, 28);
    centro.writeUInt32LE(posizione, 42);
    locali.push(testa, nome, dati);
    centrali.push(centro, nome);
    posizione += testa.length + nome.length + dati.length;
  });
  const centrale = Buffer.concat(centrali), fine = Buffer.alloc(22);
  fine.writeUInt32LE(0x06054b50, 0); fine.writeUInt16LE(blobs.length, 8); fine.writeUInt16LE(blobs.length, 10);
  fine.writeUInt32LE(centrale.length, 12); fine.writeUInt32LE(posizione, 16);
  return Buffer.concat(locali.concat([centrale, fine]));
}

// Rilegge uno zip senza compressione: { percorso: testo }
function leggiZip(bytes) {
  const buf = Buffer.from(bytes), parti = {};
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const lungo = buf.readUInt32LE(i + 18), nome = buf.readUInt16LE(i + 26), extra = buf.readUInt16LE(i + 28);
    const percorso = buf.toString('utf8', i + 30, i + 30 + nome), inizio = i + 30 + nome + extra;
    parti[percorso] = buf.toString('utf8', inizio, inizio + lungo);
    i = inizio + lungo;
  }
  return parti;
}

// stub: { proprieta: {}, risposte: (url, opzioni) => ({ codice, dati }), erroreEmail: (email) => boolean, attivatori: [nomi funzione] }
function carica(stub = {}) {
  const prop = new Map(Object.entries(stub.proprieta || {}));
  const email = [], chiamate = [], registro = [];
  const attivatori = (stub.attivatori || []).map((nome) => ({ getHandlerFunction: () => nome }));
  const creati = [], tolti = [], cache = new Map();
  const catena = (nome) => {
    const c = { impostazioni: {} };
    ['timeBased', 'everyDays', 'atHour', 'inTimezone', 'onWeekDay'].forEach((m) => { c[m] = (v) => { c.impostazioni[m] = v === undefined ? true : v; return c; }; });
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
        // testo: risposta non JSON (per esempio la pagina d'errore 502 di Google)
        return { getResponseCode: () => r.codice, getContentText: () => (r.testo !== undefined ? r.testo : JSON.stringify(r.dati)) };
      },
    },
    ScriptApp: {
      getOAuthToken: () => 'gettone-prova',
      getProjectTriggers: () => { if (stub.erroreAttivatori) throw new Error('Servizio non disponibile'); return attivatori.slice(); },
      deleteTrigger: (t) => { tolti.push(t); attivatori.splice(attivatori.indexOf(t), 1); },
      newTrigger: (nome) => catena(nome),
      WeekDay: { MONDAY: 'MONDAY', FRIDAY: 'FRIDAY', SUNDAY: 'SUNDAY' },
    },
    Utilities: {
      formatDate: formatta,
      base64DecodeWebSafe: (s) => [...Buffer.from(s, 'base64url')],
      newBlob: (dati, tipo, nome) => blob(dati, tipo, nome),
      zip: (blobs, nome) => blob([...zipSemplice(blobs)], 'application/zip', nome),
    },
    // cacheVera: la cache ricorda (per le prove sui limiti di frequenza); altrimenti è sempre vuota
    CacheService: { getScriptCache: () => (stub.cacheVera ? { get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v) } : { get: () => null, put: () => {} }) },
    // bloccato: un altro giro tiene già il blocco dello script
    LockService: { getScriptLock: () => ({ tryLock: () => !stub.bloccato, releaseLock: () => {} }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  };
  vm.createContext(gs);
  vm.runInContext(CODICE, gs);
  return { gs, prop, email, chiamate, registro, attivatori, creati, tolti };
}

// gli oggetti creati nel contesto vm hanno prototipi diversi: si confrontano dopo un passaggio in JSON
const j = (x) => JSON.parse(JSON.stringify(x));

module.exports = { carica, j, formatta, leggiZip };
