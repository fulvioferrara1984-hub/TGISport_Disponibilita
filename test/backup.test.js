// Prove del backup settimanale dello script di Google (backend/Codice.gs): node --test test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { carica, j, leggiZip } = require('./gs.js');

const ADESSO = new Date('2026-10-16T16:04:00Z');   // venerdì 16 ottobre, 18:04 in Italia
const REGOLE = {
  tariffe: { 'P.IVA': { diurno: 140, notturno: 210, maggiorato: 210 }, Coop: { diurno: 175, notturno: 262.5, maggiorato: 262.5 } },
  tariffaOnsite: 150, notteDa: '22:00', notteA: '06:00', anticipoOre: 4, fineOre: 2, durataSupervisioneOre: 6, sport: ['Calcio', 'Rugby'],
  competizioni: [
    { nome: 'Remote TL', mansione: true, prima: 0, dopo: 6, compenso: 'diurno', colore: '' },
    { nome: 'Serie A', sport: 'Calcio', compenso: 'diurno', prima: 4, dopo: 2, colore: '#a16207' },
    { nome: 'Champions League', sport: 'Calcio', compenso: 'dimezzato', prima: null, dopo: null },
  ],
};
const OPERATORI = [
  { id: 'c', nome: 'Carla Verdi', ruolo: 'OP', contratto: '', attivo: true },
  { id: 'a', nome: 'Anna Neri', mansione: 'Regia', ruolo: 'TL', contratto: 'P.IVA', email: 'anna@x.it', telefono: '+39 1', onsite: 'TL', attivo: true },
  { id: 'b', nome: 'Bruno Blu', mansione: '', ruolo: 'SUP', contratto: 'Coop', email: '', telefono: '', onsite: '', attivo: false },
];
const EVENTI = [
  { id: 'e1', tipo: 'partita', competizione: 'Serie A', round: '9', sport: 'Calcio', data: '2026-10-18', titolo: 'Roma-Lazio', orario: '20:45', convocazione: '',
    convocazioneCalcolata: '16:45', fine: '', fineCalcolata: '22:45', operatoreId: 'a', stato: 'confermato', gettone: 'maggiorato', note: 'Regia & co', daSostituire: false, inviata: true },
  { id: 'e2', tipo: 'supervisione', competizione: 'Serie A', round: '9', sport: 'Calcio', data: '2026-10-18', titolo: 'Supervisione', orario: '',
    convocazione: '10:00', convocazioneCalcolata: '10:00', fineCalcolata: '16:00', operatoreId: 'a', stato: 'convocato', inviata: true },
  { id: 'e3', tipo: 'support', competizione: 'Remote Support', data: '2026-10-17', titolo: 'Remote Support', orario: '', convocazione: '12:00',
    convocazioneCalcolata: '12:00', fineCalcolata: '18:00', operatoreId: '', stato: 'da-assegnare' },
  { id: 'e4', tipo: 'partita', competizione: 'Champions League', round: 'MD3', sport: 'Calcio', data: '2026-10-21', titolo: 'Atalanta-PSG', orario: '21:00',
    convocazione: '', convocazioneCalcolata: '20:00', fineCalcolata: '23:00', operatoreId: '', stato: 'annullato' },
  { id: 'e5', tipo: 'partita', competizione: 'Serie A', round: '9', sport: 'Calcio', data: '2026-10-18', titolo: 'Inter-Monza', orario: '15:00', convocazione: '',
    convocazioneCalcolata: '11:00', fine: '18:30', fineCalcolata: '18:30', operatoreId: 'c', stato: 'rifiutato', daSostituire: true, inviata: true, risposta: 'Malato' },
];
const ONSITE = [{ id: 'd1', luogo: 'Roma', sport: 'Rugby', titolo: 'Sei Nazioni', da: '2026-11-12', a: '2026-11-13', stato: 'aperta', posti: { TL: 1, OP: 2 },
  giorni: [{ data: '2026-11-12', attivita: 'Travel Day', partita: '' }, { data: '2026-11-13', attivita: 'MD', partita: 'Italia-Francia' }],
  accettatiTL: ['a'], accettatiOP: ['b', 'c'], note: 'Hotel centro', destinatari: ['a', 'b', 'c', 'x'], rifiuti: ['x'], esclusi: [], creato: '2026-10-01T10:00:00.000Z' }];
// disponibilità: un giorno prima della stagione, una nota senza stato, un operatore che non c'è più
const DISPONIBILITA = [
  { id: 'a', giorni: { '2026-07-30': { s: 'D', n: '' }, '2026-10-18': { s: 'P', n: 'dalle 18' }, '2026-10-17': { s: 'D', n: '' } } },
  { id: 'c', giorni: { '2026-10-19': { s: 'A', n: '' }, '2026-10-20': { s: '', n: 'forse' }, '2026-10-22': { s: '', n: '' } } },
  { id: 'z', giorni: { '2026-10-21': { s: 'D', n: '' } } },
];
const DATI = { eventi: EVENTI, onsite: ONSITE, compensi: { d1: 300 }, operatori: OPERATORI, regole: REGOLE, operativo: { telefono: '+39 333', giorniBlocco: 3 }, disponibilita: DISPONIBILITA };
const { gs } = carica();
const righe = () => j(gs.righeBackup(DATI, ADESSO));

// ---------------------------------------------------------------- righe dei fogli

test('stagione e giorni di Excel', () => {
  assert.deepEqual(['2026-10-16', '2027-03-02', '2026-07-31', '2026-08-01'].map(gs.stagioneDa), ['2026-08-01', '2026-08-01', '2025-08-01', '2026-08-01']);
  assert.equal(gs.giornoExcel('2026-10-18'), 46313);
});

test('foglio Convocazioni', () => {
  const { titolo, convocazioni, conteggi } = righe();
  assert.equal(titolo, 'Backup eventi · Disponibilità Ops TGI Sport · venerdì 16 ottobre alle 18:04 · stagione 2026/27');
  assert.deepEqual(convocazioni[0], [titolo]);
  assert.deepEqual(convocazioni[1], ['Competizione', 'Round', 'Sport', 'Data', 'Partita / turno', 'Orario evento', 'Ritrovo', 'Operatore', 'Fine turno', 'Conferma',
    'Note', 'Stato', 'Gettone maggiorato', 'Da sostituire', 'Tipo', 'ID evento', 'Ritrovo scritto a mano', 'Fine scritta a mano', 'Inviata', 'Motivo del rifiuto', 'ID operatore']);
  const d = (iso) => ({ data: iso });
  assert.deepEqual(convocazioni.slice(2), [
    ['Remote Support', '', '', d('2026-10-17'), 'Remote Support', '', '12:00', '', '18:00', '', '', 'Da assegnare', '', '', 'Remote Support', 'e3', '12:00', '', '', '', ''],
    ['Remote TL', '', '', d('2026-10-18'), 'Remote TL', '', '10:00', 'Anna Neri', '16:00', '', '', 'In attesa di risposta', '', '', 'Remote TL', 'e2', '10:00', '', 'SI', '', 'a'],
    ['Serie A', '9', 'Calcio', d('2026-10-18'), 'Inter-Monza', '15:00', '11:00', 'Carla Verdi', '18:30', '', '', 'Rifiutato', '', 'SI', 'Partita', 'e5', '', '18:30', 'SI', 'Malato', 'c'],
    ['Serie A', '9', 'Calcio', d('2026-10-18'), 'Roma-Lazio', '20:45', '16:45', 'Anna Neri', '22:45', 'SI', 'Regia & co', 'Confermato', 'SI', '', 'Partita', 'e1', '', '', 'SI', '', 'a'],
    ['Champions League', 'MD3', 'Calcio', d('2026-10-21'), 'Atalanta-PSG', '21:00', '20:00', '', '23:00', '', '', 'Annullato', '', '', 'Partita', 'e4', '', '', '', '', ''],
  ]);
  assert.deepEqual(conteggi, { eventi: 5, annullati: 1, deployment: 1, operatoriDisponibilita: 3 });
});

test('foglio On-site', () => {
  const { onsite } = righe();
  assert.deepEqual(onsite[0], ['Luogo', 'Sport', 'Titolo', 'Dal', 'Al', 'Giorno', 'Attività', 'Partita', 'Posti TL', 'Posti OP', 'On-site TL', 'On-site OP', 'Stato', 'Compenso',
    'ID deployment', 'Note', 'Destinatari', 'Accettati TL', 'Accettati OP', 'Hanno rifiutato', 'Esclusi', 'Creato']);
  // da O a V: ciò che serve per ripristinarlo (ID degli operatori, non i nomi)
  const ids = ['d1', 'Hotel centro', 'a, b, c, x', 'a', 'b, c', 'x', '', '2026-10-01T10:00:00.000Z'];
  assert.deepEqual(onsite.slice(1), [
    ['Roma', 'Rugby', 'Sei Nazioni', { data: '2026-11-12' }, { data: '2026-11-13' }, { data: '2026-11-12' }, 'Travel Day', '', 1, 2, 'Anna Neri', 'Bruno Blu, Carla Verdi', 'Aperta', 300].concat(ids),
    ['Roma', 'Rugby', 'Sei Nazioni', { data: '2026-11-12' }, { data: '2026-11-13' }, { data: '2026-11-13' }, 'MD', 'Italia-Francia', 1, 2, 'Anna Neri', 'Bruno Blu, Carla Verdi', 'Aperta', 300].concat(ids),
  ]);
});

test('foglio Disponibilità', () => {
  const r = righe();
  assert.deepEqual(r.disponibilita, [
    ['Operatore', 'Data', 'Stato', 'Nota', 'ID operatore'],
    ['Anna Neri', { data: '2026-10-17' }, 'Disponibile', '', 'a'],
    ['Anna Neri', { data: '2026-10-18' }, 'Parziale', 'dalle 18', 'a'],
    ['Carla Verdi', { data: '2026-10-19' }, 'Non disponibile', '', 'c'],
    ['Carla Verdi', { data: '2026-10-20' }, '', 'forse', 'c'],
    // operatore non più in elenco: in fondo, senza nome ma con il suo ID
    ['', { data: '2026-10-21' }, 'Disponibile', '', 'z'],
  ]);
  assert.equal(r.conteggi.operatoriDisponibilita, 3);
});

test('foglio Operatori', () => {
  assert.deepEqual(righe().operatori, [
    ['Nome', 'Mansione', 'Ruolo', 'Contratto', 'Email', 'Telefono', 'On-site', 'Attivo', 'ID'],
    ['Anna Neri', 'Regia', 'Remote TL', 'P.IVA', 'anna@x.it', '+39 1', 'TL', 'SI', 'a'],
    ['Bruno Blu', '', 'Remote Support', 'Coop', '', '', '', 'NO', 'b'],
    ['Carla Verdi', '', 'Remote OP', '', '', '', '', 'SI', 'c'],
  ]);
});

test('foglio Impostazioni', () => {
  const imp = righe().impostazioni;
  assert.deepEqual(imp[0], ['Voce', 'Valore', '', 'Operatore', 'Contratto', '', 'Sport', '', 'Competizione / mansione', 'Compenso', 'Ore prima', 'Ore dopo', 'Colore', 'Sport della competizione']);
  assert.equal(imp.length, 12);   // intestazione + 11 voci (le più lunghe delle quattro liste)
  assert.deepEqual(imp[1], ['Netto P.IVA diurno', 140, '', 'Anna Neri', 'P.IVA', '', 'Calcio', '', 'Remote TL', 'Diurno', 0, 6, '', '']);
  assert.deepEqual(imp[2], ['Netto P.IVA notturno', 210, '', 'Bruno Blu', 'Coop', '', 'Rugby', '', 'Remote Support', 'Diurno', 0, 6, '', '']);
  assert.deepEqual(imp[3], ['Netto P.IVA maggiorato', 210, '', 'Carla Verdi', '', '', '', '', 'Serie A', 'Diurno', 4, 2, '#a16207', 'Calcio']);
  assert.deepEqual(imp[4], ['Netto Coop diurno', 175, '', '', '', '', '', '', 'Champions League', 'Dimezzato', 4, 2, '', 'Calcio']);
  assert.deepEqual(imp.slice(5).map((r) => r.slice(0, 2)), [['Netto Coop notturno', 262.5], ['Netto Coop maggiorato', 262.5],
    ['Tariffa on-site (€ al giorno)', 150], ['Notturno dalle', '22:00'], ['Notturno alle', '06:00'], ['Telefono di reperibilità', '+39 333'], ['Giorni di blocco', 3]]);
  // regole mai salvate: tariffe e righe mansione con i valori iniziali (Remote TL dalla vecchia durata della supervisione)
  const vuote = j(gs.righeBackup({ eventi: [], onsite: [], compensi: {}, operatori: [], regole: { durataSupervisioneOre: 8 } }, ADESSO)).impostazioni;
  assert.deepEqual(vuote[1].slice(0, 2), ['Netto P.IVA diurno', 140]);
  assert.deepEqual(vuote.slice(1, 3).map((r) => r.slice(8)), [['Remote TL', 'Diurno', 0, 8, '', ''], ['Remote Support', 'Diurno', 0, 6, '', '']]);
});

// ---------------------------------------------------------------- file, invio, attivatore, impostazioni

const fogli = (r) => [{ nome: 'Convocazioni', righe: r.convocazioni }, { nome: 'On-site', righe: r.onsite }, { nome: 'Operatori', righe: r.operatori }, { nome: 'Impostazioni', righe: r.impostazioni },
  { nome: 'Disponibilità', righe: r.disponibilita }];

test('file xlsx', () => {
  const r = gs.righeBackup(DATI, ADESSO);
  const file = gs.fileBackup(fogli(r), 'Backup_TGI_Sport_2026-10-16.xlsx');
  assert.equal(file.getName(), 'Backup_TGI_Sport_2026-10-16.xlsx');
  assert.equal(file.getContentType(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const parti = leggiZip(file.getBytes());
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
    'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml', 'xl/worksheets/sheet4.xml', 'xl/worksheets/sheet5.xml'].forEach((x) => assert.ok(x in parti, x));
  assert.deepEqual([...parti['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), ['Convocazioni', 'On-site', 'Operatori', 'Impostazioni', 'Disponibilità']);
  const foglio = parti['xl/worksheets/sheet1.xml'];
  assert.ok(foglio.includes('<c r="A2" t="inlineStr"><is><t xml:space="preserve">Competizione</t></is></c>'));
  assert.ok(foglio.includes('<c r="D3" s="1"><v>46312</v></c>'));   // 17/10/2026 come data di Excel
  assert.ok(parti['xl/styles.xml'].includes('formatCode="dd/mm/yyyy"'));
  assert.ok(parti['xl/styles.xml'].includes('<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'));
  // caratteri speciali: XML valido, testo intatto
  const strano = gs.fileBackup([{ nome: 'Prova', righe: [['A&B <x> l\'«é» 🙂\u0007', 3.5]] }], 'p.xlsx');
  const xml = leggiZip(strano.getBytes())['xl/worksheets/sheet1.xml'];
  assert.ok(xml.includes('A&amp;B &lt;x&gt; l&apos;«é» 🙂</t>'));
  assert.ok(xml.includes('<c r="B1"><v>3.5</v></c>'));
  // caratteri vietati in XML tolti; «_x000D_» scritto in una nota resta testo (Excel lo leggerebbe come a capo)
  const rari = leggiZip(gs.fileBackup([{ nome: 'Prova', righe: [['a\uFFFEb\uFFFF c_x000D_d']] }], 'r.xlsx').getBytes())['xl/worksheets/sheet1.xml'];
  assert.ok(rari.includes('>ab c_x005F_x000D_d</t>'));
});

// Firestore simulato per la lettura del backup (account dello script)
const valoreREST = (v) => (v === null || v === undefined ? { nullValue: null } : Array.isArray(v) ? { arrayValue: { values: v.map(valoreREST) } }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valoreREST(x)])) } }
    : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : { stringValue: String(v) });
const docREST = (coll, o) => ({ name: 'projects/tgi-availability/databases/(default)/documents/' + coll + '/' + o.id,
  fields: Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, valoreREST(v)])) });
function firestoreBackup({ negato = false, supervisore = true } = {}) {
  return (url, opzioni) => {
    if (url.endsWith('invii?pageSize=1')) return { codice: supervisore ? 200 : 403, dati: {} };
    if (negato) return { codice: 403, dati: { error: { message: 'Missing permissions' } } };
    if (url.endsWith(':runQuery')) {
      const coll = JSON.parse(opzioni.payload).structuredQuery.from[0].collectionId;
      const docs = coll === 'eventi' ? EVENTI : coll === 'onsite' ? ONSITE : [];
      return { codice: 200, dati: docs.length ? docs.map((d) => ({ document: docREST(coll, d), readTime: 't' })) : [{ readTime: 't' }] };
    }
    if (/\/operatori\?/.test(url)) return { codice: 200, dati: { documents: OPERATORI.map((o) => docREST('operatori', o)) } };
    if (/\/disponibilita\?/.test(url)) return { codice: 200, dati: { documents: DISPONIBILITA.map((d) => docREST('disponibilita', d)) } };
    if (/\/onsiteRiservato\?/.test(url)) return { codice: 200, dati: { documents: [docREST('onsiteRiservato', { id: 'd1', compenso: 300 })] } };
    if (url.endsWith('/impostazioni/regole')) return { codice: 200, dati: docREST('impostazioni', Object.assign({ id: 'regole' }, REGOLE)) };
    if (url.endsWith('/impostazioni/operativo')) return { codice: 200, dati: docREST('impostazioni', { id: 'operativo', telefono: '+39 333', giorniBlocco: 3 }) };
    return { codice: 404, dati: {} };
  };
}
const PROPRIETA = { EMAIL_SUPERVISORI: 's1@x.it,s2@x.it', BACKUP_ATTIVO: 'SI', URL_ADMIN: 'https://x.github.io/sito/admin.html#impostazioni' };
const ultimoBackup = (t) => JSON.parse(t.prop.get('ULTIMO_BACKUP'));

test('invio del venerdì', () => {
  const t = carica({ proprieta: PROPRIETA, risposte: firestoreBackup() });
  assert.deepEqual(j(t.gs.giroBackup(ADESSO)), { inviato: true, eventi: 5, deployment: 1, destinatari: 2 });
  const filtro = JSON.parse(t.chiamate.find((c) => c.url.endsWith(':runQuery')).opzioni.payload).structuredQuery.where.fieldFilter;
  assert.deepEqual([filtro.field.fieldPath, filtro.op, filtro.value.stringValue], ['data', 'GREATER_THAN_OR_EQUAL', '2026-08-01']);
  assert.equal(t.email.length, 1);
  const m = t.email[0];
  assert.equal(m.to, 's1@x.it,s2@x.it');
  assert.equal(m.subject, 'Backup eventi TGI Sport · venerdì 16 ottobre');
  assert.equal(m.attachments[0].getName(), 'Backup_TGI_Sport_2026-10-16.xlsx');
  ['5 eventi', '1 annullat', '1 deployment', 'le disponibilità di 3 operatori', 'Per ripristinare: dashboard → Impostazioni → Importa dal file Excel → scegli questo file.', 'https://x.github.io/sito/admin.html']
    .forEach((x) => assert.ok(m.htmlBody.includes(x), x));
  // il file allegato contiene gli eventi e le disponibilità letti
  const allegato = leggiZip(m.attachments[0].getBytes());
  assert.ok(allegato['xl/worksheets/sheet1.xml'].includes('Roma-Lazio'));
  assert.ok(allegato['xl/worksheets/sheet5.xml'].includes('dalle 18'));
  const u = ultimoBackup(t);
  assert.deepEqual([u.eventi, u.annullati, u.deployment, u.destinatari, u.errore], [5, 1, 1, 2, '']);
});

test('backup spento e invio forzato', () => {
  const t = carica({ proprieta: Object.assign({}, PROPRIETA, { BACKUP_ATTIVO: 'NO' }), risposte: firestoreBackup() });
  assert.deepEqual(j(t.gs.giroBackup(ADESSO)), { saltato: 'spento' });
  assert.equal(t.email.length + t.chiamate.length, 0);
  assert.equal(j(t.gs.giroBackup(ADESSO, { forza: true })).inviato, true);
  assert.equal(t.email.length, 1);
});

test('backup: lettura negata o nessun indirizzo', () => {
  const t = carica({ proprieta: PROPRIETA, risposte: firestoreBackup({ negato: true }) });
  assert.throws(() => t.gs.giroBackup(ADESSO), /Editor del progetto/);
  assert.equal(t.email.length, 0);
  assert.match(ultimoBackup(t).errore, /Editor del progetto.*Missing permissions/);
  const s = carica({ proprieta: Object.assign({}, PROPRIETA, { EMAIL_SUPERVISORI: '' }), risposte: firestoreBackup() });
  assert.throws(() => s.gs.giroBackup(ADESSO), /Nessun indirizzo dei supervisori in Impostazioni → Notifiche email\./);
  assert.equal(s.email.length + s.chiamate.length, 0);
  assert.match(ultimoBackup(s).errore, /Nessun indirizzo/);
});

test('attivatore del venerdì', () => {
  const t = carica({ proprieta: { EMAIL_SUPERVISORI: 's@x.it' }, risposte: firestoreBackup() });
  t.gs.attivaPromemoria();
  t.gs.attivaPromemoria();
  const backup = t.attivatori.filter((a) => a.getHandlerFunction() === 'inviaBackup');
  assert.equal(backup.length, 1);
  assert.deepEqual(j(backup[0].impostazioni), { timeBased: true, onWeekDay: 'FRIDAY', atHour: 18, inTimezone: 'Europe/Rome' });
  assert.equal(t.prop.get('BACKUP_ATTIVO'), 'SI');
  assert.ok(t.registro.some((r) => r.includes('Backup ogni venerdì tra le 18 e le 19 · backup acceso')));
  // una scelta già fatta resta
  const s = carica({ proprieta: { EMAIL_SUPERVISORI: 's@x.it', BACKUP_ATTIVO: 'NO' }, risposte: firestoreBackup() });
  s.gs.attivaPromemoria();
  assert.equal(s.prop.get('BACKUP_ATTIVO'), 'NO');
});

test('invia un backup adesso: solo i supervisori', () => {
  const chiama = (t) => JSON.parse(t.gs.doPost({ postData: { contents: JSON.stringify({ azione: 'inviaBackupOra', idToken: 'gettone' }) } }));
  const op = carica({ proprieta: PROPRIETA, risposte: firestoreBackup({ supervisore: false }) });
  assert.deepEqual(chiama(op), { ok: false, errore: 'Accesso non consentito.' });
  assert.equal(op.email.length, 0);
  const sup = carica({ proprieta: Object.assign({}, PROPRIETA, { BACKUP_ATTIVO: 'NO' }), risposte: firestoreBackup() });
  assert.deepEqual(chiama(sup), { ok: true, dati: { destinatari: 2, eventi: 5 } });
  assert.equal(sup.email.length, 1);
});

test('impostazioni del backup', () => {
  const t = carica({ proprieta: Object.assign({}, PROPRIETA, { ULTIMO_BACKUP: JSON.stringify({ quando: '2026-10-16T16:04:00.000Z', eventi: 5 }) }), attivatori: ['inviaBackup'] });
  const imp = j(t.gs.impostazioniDashboard());
  assert.deepEqual([imp.backupAttivo, imp.backupProgrammato, imp.ultimoBackup.eventi], [true, true, 5]);
  assert.equal(j(t.gs.salvaImpostazioni({ emailSupervisori: 's@x.it', backupAttivo: false })).backupAttivo, false);
  assert.equal(t.prop.get('BACKUP_ATTIVO'), 'NO');
  t.gs.salvaImpostazioni({ emailSupervisori: 's@x.it' });   // dashboard vecchia: la casella resta com'è
  assert.equal(t.prop.get('BACKUP_ATTIVO'), 'NO');
  assert.equal(j(carica({}).gs.impostazioniDashboard()).backupProgrammato, false);
  // finché nessuno lo spegne il backup è acceso (anche prima di attivaPromemoria)
  assert.equal(j(carica({}).gs.leggiImpostazioni()).backupAttivo, true);
});

test('invia un backup adesso ripetuto subito: non rispedisce', () => {
  const quando = new Date(ADESSO.getTime() - 60000).toISOString();
  const recente = JSON.stringify({ quando, eventi: 5, annullati: 1, deployment: 1, destinatari: 2, indirizzi: 's1@x.it,s2@x.it', errore: '' });
  const t = carica({ proprieta: Object.assign({}, PROPRIETA, { ULTIMO_BACKUP: recente }), risposte: firestoreBackup() });
  assert.deepEqual(j(t.gs.giroBackup(ADESSO, { forza: true })), { inviato: true, eventi: 5, deployment: 1, destinatari: 2, ripetuto: true, quando });
  assert.equal(t.email.length, 0);
  // la dashboard sa che non è ripartito
  const p = carica({ proprieta: Object.assign({}, PROPRIETA, { ULTIMO_BACKUP: recente }), risposte: firestoreBackup() });
  assert.deepEqual(JSON.parse(p.gs.doPost({ postData: { contents: JSON.stringify({ azione: 'inviaBackupOra', idToken: 'gettone' }) } })),
    { ok: true, dati: { destinatari: 2, eventi: 5, ripetuto: true, quando } });
  // indirizzi cambiati nel frattempo (o ultimo backup registrato da uno script vecchio): si rispedisce
  const n = carica({ proprieta: Object.assign({}, PROPRIETA, { EMAIL_SUPERVISORI: 's1@x.it,s2@x.it,s3@x.it', ULTIMO_BACKUP: recente }), risposte: firestoreBackup() });
  assert.equal(j(n.gs.giroBackup(ADESSO, { forza: true })).destinatari, 3);
  assert.equal(n.email.length, 1);
  const vecchioScript = JSON.stringify({ quando, eventi: 5, destinatari: 2, errore: '' });
  const o = carica({ proprieta: Object.assign({}, PROPRIETA, { ULTIMO_BACKUP: vecchioScript }), risposte: firestoreBackup() });
  o.gs.giroBackup(ADESSO, { forza: true });
  assert.equal(o.email.length, 1);
  const vecchio = JSON.stringify({ quando: new Date(ADESSO.getTime() - 5 * 60000).toISOString(), eventi: 5, errore: '' });
  const s = carica({ proprieta: Object.assign({}, PROPRIETA, { ULTIMO_BACKUP: vecchio }), risposte: firestoreBackup() });
  assert.equal(j(s.gs.giroBackup(ADESSO, { forza: true })).inviato, true);
  assert.equal(s.email.length, 1);
  // il venerdì (senza forza) parte comunque
  const v = carica({ proprieta: Object.assign({}, PROPRIETA, { ULTIMO_BACKUP: recente }), risposte: firestoreBackup() });
  v.gs.giroBackup(ADESSO);
  assert.equal(v.email.length, 1);
});


// ---------------------------------------------------------------- copia su Google Drive
// Drive simulato: cartelle e file in memoria, come le API v3 (q con parents, name =, name contains, trashed)
function driveFinto({ cartelle = {}, file = [], errore = null, erroreCartella = null, erroreCaricamento = null, erroreElenco = null } = {}) {
  const stato = { cartelle: Object.assign({}, cartelle), file: file.map((f) => Object.assign({ trashed: false }, f)), createCartelle: 0, n: 0 };
  stato.risposte = (url, o = {}) => {
    if (errore) return { codice: errore.codice, dati: { error: { message: errore.messaggio } } };
    const metodo = String(o.method || 'get').toLowerCase();
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      if (erroreCaricamento) return { codice: erroreCaricamento, dati: { error: { message: 'Backend Error' } } };
      const testo = Buffer.from(o.payload).toString('latin1');
      const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/.exec(testo)[1]);
      const nuovo = { id: 'f' + (++stato.n), name: meta.name, parents: meta.parents, createdTime: '2026-10-16T16:04:' + String(stato.n).padStart(2, '0') + 'Z', trashed: false,
        contenuto: testo, tipo: o.contentType };
      stato.file.push(nuovo);
      return { codice: 200, dati: { id: nuovo.id } };
    }
    const m = /^https:\/\/www\.googleapis\.com\/drive\/v3\/files(?:\/([^?]+))?(?:\?(.*))?$/.exec(url);
    if (!m) return null;
    const id = m[1] && decodeURIComponent(m[1]), query = new URLSearchParams(m[2] || '');
    if (metodo === 'post') {
      const meta = JSON.parse(o.payload);
      stato.createCartelle++;
      const nuova = 'cart' + stato.createCartelle;
      stato.cartelle[nuova] = { name: meta.name, trashed: false };
      return { codice: 200, dati: { id: nuova } };
    }
    if (metodo === 'patch') {
      const f = stato.file.find((x) => x.id === id);
      if (!f) return { codice: 404, dati: { error: { message: 'File not found' } } };
      Object.assign(f, JSON.parse(o.payload));
      return { codice: 200, dati: { id } };
    }
    if (id && erroreCartella) return { codice: erroreCartella, dati: { error: { message: 'Backend Error' } } };
    if (id) return stato.cartelle[id] ? { codice: 200, dati: { id, trashed: stato.cartelle[id].trashed } } : { codice: 404, dati: { error: { message: 'File not found' } } };
    if (erroreElenco) return { codice: erroreElenco, dati: { error: { message: 'Backend Error' } } };
    const q = query.get('q');
    const genitore = /'([^']+)' in parents/.exec(q)[1], uguale = /name = '([^']+)'/.exec(q), contiene = /name contains '([^']+)'/.exec(q);
    const files = stato.file.filter((f) => f.parents.includes(genitore) && !f.trashed && (!uguale || f.name === uguale[1]) && (!contiene || f.name.includes(contiene[1])));
    return { codice: 200, dati: { files: files.map((f) => ({ id: f.id, name: f.name, createdTime: f.createdTime })) } };
  };
  return stato;
}
const conDrive = (drive) => { const fs = firestoreBackup(); return (url, o) => drive.risposte(url, o) || fs(url, o); };

test('copia su Drive: cartella creata, file salvato, esito nell\'ultimo backup', () => {
  const drive = driveFinto();
  const t = carica({ proprieta: PROPRIETA, risposte: conDrive(drive) });
  assert.deepEqual(j(t.gs.giroBackup(ADESSO)), { inviato: true, eventi: 5, deployment: 1, destinatari: 2 });
  assert.equal(drive.cartelle.cart1.name, 'Backup Disponibilità Ops');
  assert.equal(t.prop.get('BACKUP_CARTELLA'), 'cart1');
  assert.deepEqual(drive.file.map((f) => [f.name, f.parents]), [['Backup_TGI_Sport_2026-10-16.xlsx', ['cart1']]]);
  assert.ok(drive.file[0].tipo.startsWith('multipart/related; boundary='));
  assert.ok(drive.file[0].contenuto.includes('PK'), 'il file Excel è nel corpo');
  // sempre con il gettone del proprietario
  assert.ok(t.chiamate.filter((c) => c.url.includes('googleapis.com/') && c.url.includes('drive')).every((c) => c.opzioni.headers.Authorization === 'Bearer gettone-prova'));
  assert.equal(ultimoBackup(t).drive, 'salvato');
});

test('copia su Drive: cartella ritrovata, stesso giorno e oltre 52 file nel cestino', () => {
  const vecchi = Array.from({ length: 52 }, (_, i) => ({ id: 'v' + i, name: 'Backup_TGI_Sport_2025-' + String(i).padStart(2, '0') + '.xlsx', parents: ['cart9'],
    createdTime: '2025-01-01T00:00:' + String(i).padStart(2, '0') + 'Z' }));
  const drive = driveFinto({ cartelle: { cart9: { name: 'Backup Disponibilità Ops', trashed: false } },
    file: vecchi.concat([{ id: 'oggi', name: 'Backup_TGI_Sport_2026-10-16.xlsx', parents: ['cart9'], createdTime: '2026-10-16T08:41:00Z' }, { id: 'altro', name: 'Note.txt', parents: ['cart9'], createdTime: '2020-01-01T00:00:00Z' }]) });
  const t = carica({ proprieta: Object.assign({ BACKUP_CARTELLA: 'cart9' }, PROPRIETA), risposte: conDrive(drive) });
  t.gs.giroBackup(ADESSO);
  assert.equal(drive.createCartelle, 0);
  assert.deepEqual(drive.file.filter((f) => f.trashed).map((f) => f.id).sort(), ['oggi', 'v0']);
  assert.equal(drive.file.filter((f) => !f.trashed && f.name.startsWith('Backup_TGI_Sport_')).length, 52);
  assert.equal(drive.file.find((f) => f.id === 'altro').trashed, false);
});

test('copia su Drive: cartella cancellata, se ne crea una nuova', () => {
  const drive = driveFinto({ cartelle: { vecchia: { name: 'Backup Disponibilità Ops', trashed: true } } });
  const t = carica({ proprieta: Object.assign({ BACKUP_CARTELLA: 'vecchia' }, PROPRIETA), risposte: conDrive(drive) });
  t.gs.giroBackup(ADESSO);
  assert.equal(t.prop.get('BACKUP_CARTELLA'), 'cart1');
  assert.deepEqual(drive.file.map((f) => f.parents[0]), ['cart1']);
});

test('copia su Drive non riuscita: il backup per email resta riuscito, con il motivo', () => {
  const drive = driveFinto({ errore: { codice: 403, messaggio: 'Insufficient Permission' } });
  const t = carica({ proprieta: PROPRIETA, risposte: (url, o) => (url.includes('googleapis.com/drive') || url.includes('googleapis.com/upload') ? drive.risposte(url, o) : firestoreBackup()(url, o)) });
  assert.equal(j(t.gs.giroBackup(ADESSO)).inviato, true);
  assert.equal(t.email.length, 1);
  const u = ultimoBackup(t);
  assert.deepEqual([u.errore, u.drive], ['', 'errore: Drive 403: Insufficient Permission']);
});

test('autorizzaDrive: crea la cartella e lo scrive nel registro; autorizzazione ristretta nel manifesto', () => {
  const drive = driveFinto();
  const t = carica({ risposte: conDrive(drive) });
  t.gs.autorizzaDrive();
  assert.equal(t.prop.get('BACKUP_CARTELLA'), 'cart1');
  assert.ok(t.registro.some((r) => r.includes('Backup Disponibilità Ops') && r.includes('https://drive.google.com/drive/folders/cart1')), t.registro.join('\n'));
  const scope = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../backend/appsscript.json'), 'utf8')).oauthScopes;
  assert.ok(scope.includes('https://www.googleapis.com/auth/drive.file'));
  assert.ok(!scope.includes('https://www.googleapis.com/auth/drive'));
});

test('copia su Drive: un errore temporaneo sulla cartella non ne crea una seconda', () => {
  const drive = driveFinto({ cartelle: { cart9: { name: 'Backup Disponibilità Ops', trashed: false } }, erroreCartella: 500 });
  const t = carica({ proprieta: Object.assign({ BACKUP_CARTELLA: 'cart9' }, PROPRIETA), risposte: conDrive(drive) });
  assert.equal(j(t.gs.giroBackup(ADESSO)).inviato, true);
  assert.equal(drive.createCartelle, 0);
  assert.equal(t.prop.get('BACKUP_CARTELLA'), 'cart9');
  assert.equal(ultimoBackup(t).drive, 'errore: Drive 500: Backend Error');
});

test('copia su Drive: caricamento non riuscito, il file dello stesso giorno resta', () => {
  const drive = driveFinto({ cartelle: { cart9: { name: 'Backup Disponibilità Ops', trashed: false } }, erroreCaricamento: 503,
    file: [{ id: 'oggi', name: 'Backup_TGI_Sport_2026-10-16.xlsx', parents: ['cart9'], createdTime: '2026-10-16T08:41:00Z' }] });
  const t = carica({ proprieta: Object.assign({ BACKUP_CARTELLA: 'cart9' }, PROPRIETA), risposte: conDrive(drive) });
  t.gs.giroBackup(ADESSO);
  assert.equal(drive.file[0].trashed, false);
  assert.equal(ultimoBackup(t).drive, 'errore: Drive 503: Backend Error');
});

test('copia su Drive: pulizia non riuscita dopo il salvataggio, la copia risulta salvata', () => {
  const drive = driveFinto({ cartelle: { cart9: { name: 'Backup Disponibilità Ops', trashed: false } }, erroreElenco: 500 });
  const t = carica({ proprieta: Object.assign({ BACKUP_CARTELLA: 'cart9' }, PROPRIETA), risposte: conDrive(drive) });
  t.gs.giroBackup(ADESSO);
  assert.equal(drive.file.length, 1);
  assert.equal(ultimoBackup(t).drive, 'salvato');
  assert.ok(t.registro.some((r) => r.includes('Pulizia della cartella dei backup non riuscita')), t.registro.join('\n'));
});

test('copia su Drive: i file vecchi si riconoscono dal nome nel codice, non con la ricerca di Drive', () => {
  const drive = driveFinto({ cartelle: { cart9: { name: 'Backup Disponibilità Ops', trashed: false } } });
  const t = carica({ proprieta: Object.assign({ BACKUP_CARTELLA: 'cart9' }, PROPRIETA), risposte: conDrive(drive) });
  t.gs.giroBackup(ADESSO);
  const ricerche = t.chiamate.filter((c) => c.url.startsWith('https://www.googleapis.com/drive/v3/files?q=')).map((c) => decodeURIComponent(c.url));
  assert.ok(ricerche.length && ricerche.every((u) => !u.includes('name contains') && !u.includes('name =')), ricerche.join('\n'));
});
