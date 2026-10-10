/* Disponibilità Ops — Impostazioni: tariffe e regole, competizioni e sport, importazione dal file Excel.
 * Prende il posto del foglio "Impostazioni" e permette di continuare la stagione dal vecchio file. */
(function (DO) {
  'use strict';

  const $ = DO.$, A = DO.admin, R = DO.regole;

  // ---------- tariffe e regole ----------
  function disegnaRegole() {
    const r = A.regole;
    document.querySelectorAll('[data-tariffa]').forEach((i) => {
      const [contratto, tipo] = [i.dataset.tariffa.slice(0, i.dataset.tariffa.lastIndexOf('.')), i.dataset.tariffa.slice(i.dataset.tariffa.lastIndexOf('.') + 1)];
      if (document.activeElement !== i) i.value = r.tariffe[contratto][tipo];
    });
    $('reg-notte-da').value = r.notteDa;
    $('reg-notte-a').value = r.notteA;
    if (document.activeElement !== $('reg-tariffa-onsite')) $('reg-tariffa-onsite').value = r.tariffaOnsite;
  }

  async function salva(modifiche, messaggio) {
    const r = Object.assign({}, A.regole, modifiche);
    try {
      await DO.dati.salvaRegole(JSON.parse(JSON.stringify(r)));
      DO.avviso(messaggio, 'ok');
    } catch (e) { DO.avviso(e.message, 'errore'); }
  }

  $('form-regole').addEventListener('submit', (e) => {
    e.preventDefault();
    const tariffe = JSON.parse(JSON.stringify(A.regole.tariffe));
    document.querySelectorAll('[data-tariffa]').forEach((i) => {
      const k = i.dataset.tariffa, punto = k.lastIndexOf('.');
      tariffe[k.slice(0, punto)][k.slice(punto + 1)] = Math.max(0, Number(i.value) || 0);
    });
    const tariffaOnsite = R.numero($('reg-tariffa-onsite').value, { min: 0, max: 2000 });
    if (tariffaOnsite === null) { DO.avviso('La tariffa on-site va da 0 a 2000 € al giorno.', 'errore'); return; }
    salva({
      tariffe, tariffaOnsite,   // le ore si impostano per competizione / mansione
      notteDa: $('reg-notte-da').value || '22:00', notteA: $('reg-notte-a').value || '06:00',
    }, 'Regole salvate.');
  });

  // ---------- competizioni e sport ----------
  let bozzaComp = null;
  function disegnaCompetizioni(forza) {
    if (!bozzaComp || forza) bozzaComp = A.regole.competizioni.map((c) => Object.assign({}, c));
    const sport = A.regole.sport;
    const valore = (v) => (v === null || v === undefined ? '' : v);
    $('reg-competizioni').innerHTML = bozzaComp.map((c, i) => '<li data-i="' + i + '"' + (c.mansione ? ' class="mansione"' : '') + '>'
      // Remote TL e Remote Support: nome fisso, niente sport, «ore prima» sempre 0, «ore dopo» = durata del turno
      + (c.mansione ? '<input type="text" value="' + DO.esc(c.nome) + '" readonly aria-label="Mansione" title="Mansione dei turni: non si rinomina">'
        : '<input type="text" value="' + DO.esc(c.nome) + '" data-campo="nome" aria-label="Nome competizione" maxlength="80">')
      + (c.mansione ? ''
        : '<select data-campo="sport" aria-label="Sport"><option value="">—</option>' + sport.map((s) => '<option' + (s === c.sport ? ' selected' : '') + '>' + DO.esc(s) + '</option>').join('') + '</select>')
      + (c.mansione ? '<input type="number" value="0" disabled title="Il turno parte dal ritrovo" aria-label="Ore prima">'
        : '<input type="number" data-campo="prima" min="0" max="12" step="0.25" value="' + valore(c.prima) + '" title="Ritrovo: ore prima dell\'evento" aria-label="Ritrovo: ore prima">')
      + (c.mansione ? '<input type="number" data-campo="dopo" min="0.5" max="16" step="0.5" value="' + valore(c.dopo) + '" title="Durata del turno (ore dal ritrovo)" aria-label="Durata del turno">'
        : '<input type="number" data-campo="dopo" min="0" max="12" step="0.25" value="' + valore(c.dopo) + '" title="Fine turno: ore dopo l\'evento" aria-label="Fine turno: ore dopo">')
      // colore: quello scelto oppure automatico (calcolato dal nome); «Auto» torna all'automatico
      + '<span class="colore-comp' + (c.colore ? '' : ' auto') + '"><input type="color" data-campo="colore" value="' + R.coloreCompetizione(c.nome, { competizioni: [c] }) + '" title="Colore nelle Convocazioni" aria-label="Colore">'
      + '<button type="button" class="link" data-auto="' + i + '" title="Colore automatico"' + (c.colore ? '' : ' hidden') + '>Auto</button></span>'
      // tipo di compenso della competizione (Diurno = notturno da solo se il ritrovo è di notte)
      + '<select data-campo="compenso" aria-label="Compenso" title="Compenso">' + Object.keys(R.TIPI).map((k) => '<option value="' + k + '"' + (k === (c.compenso || 'diurno') ? ' selected' : '') + '>'
        + (k === 'dimezzato' ? 'Dimezzato' : R.TIPI[k]) + '</option>').join('') + '</select>'
      + (c.mansione ? '<span></span>' : '<button type="button" class="icona" data-togli="' + i + '" aria-label="Togli">✕</button>') + '</li>').join('');
    if (document.activeElement !== $('reg-sport')) $('reg-sport').value = sport.join(', ');
  }
  $('reg-competizioni').addEventListener('input', (e) => {
    const li = e.target.closest('li'), campo = e.target.dataset.campo;
    if (!li || !campo) return;
    const c = bozzaComp[li.dataset.i];
    c[campo] = e.target.value;
    // colore automatico: segue il nome mentre lo si scrive
    if (campo === 'nome' && !c.colore) li.querySelector('[data-campo="colore"]').value = R.coloreCompetizione(c.nome, { competizioni: [c] });
  });
  $('reg-competizioni').addEventListener('change', (e) => {
    const li = e.target.closest('li');
    if (li && e.target.dataset.campo) bozzaComp[li.dataset.i][e.target.dataset.campo] = e.target.value;
    if (li && e.target.dataset.campo === 'colore') disegnaCompetizioni();
  });
  $('reg-competizioni').addEventListener('click', (e) => {
    const auto = e.target.closest('[data-auto]');
    if (auto) { bozzaComp[auto.dataset.auto].colore = ''; disegnaCompetizioni(); return; }
    const b = e.target.closest('[data-togli]');
    if (!b) return;
    bozzaComp.splice(Number(b.dataset.togli), 1);
    disegnaCompetizioni();
  });
  $('reg-aggiungi-comp').addEventListener('click', () => {
    bozzaComp.push({ nome: '', sport: '', compenso: 'diurno', prima: 4, dopo: 2 });
    disegnaCompetizioni();
    $('reg-competizioni').lastElementChild.querySelector('input').focus();
  });
  $('form-competizioni').addEventListener('submit', (e) => {
    e.preventDefault();
    const ore = (v, min, max) => R.numero(v === null || v === undefined ? '' : v, { min, max });
    const righe = bozzaComp.filter((c) => c.mansione || c.nome.trim());
    const riservati = righe.filter((c) => c.mansione).map((c) => c.nome.toLowerCase());
    if (righe.some((c) => !c.mansione && riservati.includes(c.nome.trim().toLowerCase()))) {
      DO.avviso('Remote TL e Remote Support sono già le righe dei turni: scegli un altro nome.', 'errore');
      return;
    }
    if (righe.some((c) => (c.mansione ? ore(c.dopo, 0.5, 16) === null : ore(c.prima, 0, 12) === null || ore(c.dopo, 0, 12) === null))) {
      DO.avviso('Indica le ore di ogni competizione (da 0 a 12; durata dei turni da 0,5 a 16).', 'errore');
      return;
    }
    const competizioni = righe.map((c) => (c.mansione
      ? { nome: c.nome, mansione: true, sport: '', compenso: c.compenso || 'diurno', uefa: c.compenso === 'dimezzato', prima: 0, dopo: ore(c.dopo, 0.5, 16), colore: c.colore || '' }
      : { nome: c.nome.trim(), sport: c.sport || '', compenso: c.compenso || 'diurno', uefa: c.compenso === 'dimezzato', prima: ore(c.prima, 0, 12), dopo: ore(c.dopo, 0, 12), colore: c.colore || '' }));
    const sport = $('reg-sport').value.split(',').map((s) => s.trim()).filter(Boolean);
    bozzaComp = null;
    salva({ competizioni, sport }, 'Competizioni salvate.');
  });

  // ---------- accessi in sola visualizzazione ----------
  function disegnaVisualizzatori() {
    const elenco = A.visualizzatori;
    $('vis-elenco').innerHTML = elenco.length ? elenco.map((v) => '<li><span class="chi"><b>' + DO.esc(v.email) + '</b>'
      + '<small>aggiunto ' + (v.aggiunto ? DO.quando(v.aggiunto) : '') + (v.da ? ' da ' + DO.esc(v.da) : '') + '</small></span>'
      + '<button type="button" class="bottone" data-invita="' + DO.esc(v.email) + '">Invia mail</button>'
      + '<button type="button" class="link testo-errore" data-togli-vis="' + DO.esc(v.email) + '">Togli</button></li>').join('')
      : '<li class="nota">Nessun collega per ora.</li>';
  }
  $('form-visualizzatori').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = await DO.dati.aggiungiVisualizzatore($('vis-email').value);
      $('vis-email').value = '';
      DO.avviso(email + ' può entrare in sola visualizzazione: mandagli l\'invito con «Invia mail».', 'ok', 6000);
    } catch (err) { DO.avviso(err.message, 'errore', 8000); }
  });
  $('vis-elenco').addEventListener('click', async (e) => {
    const invita = e.target.closest('[data-invita]');
    if (invita) { location.href = DO.invitoVisualizzatore(invita.dataset.invita, A.linkDashboard()); return; }
    const togli = e.target.closest('[data-togli-vis]');
    if (!togli || !confirm('Togliere l\'accesso a ' + togli.dataset.togliVis + '?')) return;
    try {
      await DO.dati.togliVisualizzatore(togli.dataset.togliVis);
      DO.avviso('Accesso tolto.', 'ok');
    } catch (err) { DO.avviso(err.message, 'errore', 8000); }
  });

  // ---------- regole per gli operatori (telefono di reperibilità, giorni di blocco) ----------
  function disegnaOperativo() {
    const o = A.operativo;
    if (document.activeElement !== $('op-telefono-rep')) $('op-telefono-rep').value = o.telefono;
    if (document.activeElement !== $('op-giorni-blocco')) $('op-giorni-blocco').value = o.giorniBlocco;
  }
  $('form-operativo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const giorni = R.numero($('op-giorni-blocco').value, { min: 0, max: 14, intero: true });
    if (giorni === null) { DO.avviso('Indica i giorni di blocco: un numero intero da 0 a 14.', 'errore'); return; }
    if (!DO.telefonoValido($('op-telefono-rep').value)) { DO.avviso('Scrivi un numero di telefono valido (cifre, spazi e + - / . ( ), almeno 6 cifre).', 'errore'); return; }
    try {
      await DO.dati.salvaOperativo({ telefono: $('op-telefono-rep').value.trim(), giorniBlocco: giorni });
      DO.avviso('Regole per gli operatori salvate.', 'ok');
    } catch (err) { DO.avviso(err.message, 'errore'); }
  });

  // ---------- importazione dal file Excel ----------
  // Date e orari si leggono dai numeri di Excel: niente sorprese con i fusi orari.
  const dataExcel = (v) => {
    if (typeof v !== 'number') return '';
    const d = new Date(Math.round((Math.floor(v) - 25569) * 864e5));
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  };
  const oraExcel = (v) => {
    if (typeof v === 'number') return R.hhmm(Math.round((v - Math.floor(v)) * 1440));
    const m = /^(\d{1,2})[:.](\d{2})/.exec(String(v || '').trim());
    return m ? String(m[1]).padStart(2, '0') + ':' + m[2] : '';
  };
  const testo = (v) => (v == null ? '' : String(v).trim());
  const chiave = (s) => testo(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // ID scritti nel file: solo lettere, cifre, - e _ (una / romperebbe il percorso del documento in Firebase)
  const idValido = (v) => (/^[\w-]{1,120}$/.test(testo(v)) ? testo(v) : '');

  function leggiFile(X, buffer) {
    const wb = X.read(buffer, { type: 'array' });
    const foglio = (nome) => {
      const ws = wb.Sheets[nome];
      if (!ws) throw new Error('Nel file manca il foglio "' + nome + '".');
      return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    };
    const imp = foglio('Impostazioni'), conv = foglio('Convocazioni');
    // backup settimanale (colonna «ID evento»): ripristino fedele, con gli id, gli stati e gli orari scritti a mano
    if ((conv[1] || []).some((x) => testo(x) === 'ID evento')) return leggiBackup(wb, foglio, imp, conv);
    const ass = wb.Sheets.Assenze ? foglio('Assenze') : [];
    const avvisi = [];

    // tariffe e liste
    const regole = JSON.parse(JSON.stringify(A.regole));
    const mappaTariffe = { 'netto p.iva diurno': ['P.IVA', 'diurno'], 'netto p.iva notturno': ['P.IVA', 'notturno'], 'netto coop diurno': ['Coop', 'diurno'], 'netto coop notturno': ['Coop', 'notturno'] };
    const elenco = { op: [], sport: [], comp: [] };
    imp.slice(1).forEach((r) => {
      const t = mappaTariffe[testo(r[0]).toLowerCase()];
      if (t && typeof r[1] === 'number') regole.tariffe[t[0]][t[1]] = r[1];
      if (testo(r[3]) && !/^operatore \d+$/i.test(testo(r[3]))) elenco.op.push({ nome: testo(r[3]), contratto: testo(r[4]) === 'Coop' ? 'Coop' : testo(r[4]) === 'P.IVA' ? 'P.IVA' : '' });
      if (testo(r[6])) elenco.sport.push(testo(r[6]));
      if (testo(r[8])) elenco.comp.push(testo(r[8]));
    });
    elenco.sport.forEach((s) => { if (!regole.sport.includes(s)) regole.sport.push(s); });
    elenco.comp.concat(['Europa League', 'Conference League']).forEach((c) => {
      // competizioni UEFA (Champions, Europa, Conference League): compenso dimezzato
      const uefa = /champions|europa league|conference/i.test(c);
      if (!regole.competizioni.some((x) => x.nome === c)) regole.competizioni.push({ nome: c, sport: uefa ? 'Calcio' : '', compenso: uefa ? 'dimezzato' : 'diurno', uefa });
    });

    // operatori: si riconoscono per nome tra quelli già presenti
    const operatori = [], idPerNome = {}, esistenti = {};   // esistenti: modifiche agli operatori già in piattaforma
    const esistente = (nome) => A.operatori.find((o) => chiave(o.nome) === chiave(nome));
    const assicura = (nome, contratto) => {
      const k = chiave(nome);
      if (!k) return '';
      if (idPerNome[k]) return idPerNome[k];
      const e = esistente(nome);
      if (e) {
        idPerNome[k] = e.id;
        if (contratto && !e.contratto) esistenti[e.id] = Object.assign(esistenti[e.id] || {}, { contratto });
        return e.id;
      }
      const nuovo = { id: 'xls-' + k, nome: testo(nome), contratto: contratto || '', ruolo: 'OP', nuovo: true };
      operatori.push(nuovo);
      idPerNome[k] = nuovo.id;
      return nuovo.id;
    };
    elenco.op.forEach((o) => assicura(o.nome, o.contratto));

    // eventi: una riga del foglio Convocazioni = un evento
    const eventi = [], visti = {};
    let precedente = null;
    conv.slice(2).forEach((r, i) => {
      const riga = i + 3;
      const data = dataExcel(r[3]);
      if (!data || (!testo(r[0]) && !testo(r[4]))) return;
      let comp = testo(r[0]);
      const round = testo(r[1]), nota = testo(r[10]), nomeOp = testo(r[7]);
      // turni remoti: «Supporto…» (file della stagione) e «Remote TL…» → Remote TL; «Remote Support…» → Remote Support
      const titoloRiga = testo(r[4]);
      const tipo = /^remote\s*support/i.test(titoloRiga) ? 'support' : /^(supporto|remote\s*tl)/i.test(titoloRiga) ? 'supervisione' : 'partita';
      const sup = tipo !== 'partita';
      // competizione vuota: quella della riga sopra (anche per i turni, che la usano solo nella chiave dell'evento;
      // l'avviso serve solo per le partite)
      if (!comp && precedente && precedente.round === round) {
        comp = precedente.competizione;
        if (!sup) avvisi.push('Riga ' + riga + ': competizione mancante, presa dalla riga sopra (' + comp + ').');
      }
      // Europa e Conference League erano registrate sotto "Champions League"
      if (comp === 'Champions League' && /europa/i.test(nota + ' ' + round)) comp = 'Europa League';
      if (comp === 'Champions League' && /conference/i.test(nota + ' ' + round)) comp = 'Conference League';
      const annullato = /^deleted/i.test(nota);
      const storico = [{ quando: new Date().toISOString(), testo: 'Importato dal file Excel (riga ' + riga + ')' }];
      const rimosso = /^deleted\s*-\s*(.+)$/i.exec(nota);
      if (rimosso) storico.push({ quando: new Date().toISOString(), testo: 'Rimosso ' + rimosso[1].trim() });
      const operatoreId = annullato ? '' : assicura(nomeOp, '');
      // il ruolo si alza soltanto (Remote OP → Remote Support → Remote TL): ogni ruolo comprende quelli sotto
      if (sup && operatoreId) {
        const livello = { OP: 0, SUP: 1, TL: 2 }, nuovo = tipo === 'supervisione' ? 'TL' : 'SUP';
        const o = operatori.find((x) => x.id === operatoreId);
        const attuale = o ? o.ruolo : (esistenti[operatoreId] || {}).ruolo || (A.operatori.find((x) => x.id === operatoreId) || {}).ruolo || 'OP';
        if (livello[nuovo] > (livello[attuale] || 0)) {
          if (o) o.ruolo = nuovo;
          else esistenti[operatoreId] = Object.assign(esistenti[operatoreId] || {}, { ruolo: nuovo });
        }
      }
      const orario = oraExcel(r[5]);
      const e = {
        tipo, competizione: sup ? DO.mansione(tipo) : comp, round: sup ? '' : round, sport: sup ? '' : testo(r[2]), data, orario,
        titolo: sup ? DO.mansione(tipo) : titoloRiga, convocazione: '', note: nota,
        gettone: /maggiorat/i.test(nota) ? 'maggiorato' : '', daSostituire: /^cambiare/i.test(nota),
        operatoreId, stato: annullato ? 'annullato' : operatoreId ? (testo(r[9]).toUpperCase() === 'SI' ? 'confermato' : 'convocato') : 'da-assegnare',
        inviata: !annullato && !!operatoreId, storico,
      };
      if (sup) { e.convocazione = R.convocazione(e, regole); e.orario = ''; }
      e.convocazioneCalcolata = R.convocazione(e, regole);
      e.fineCalcolata = R.fine(e, regole);
      // identificativo stabile: ripetere l'importazione aggiorna lo stesso evento anche se si aggiungono righe
      // (i turni Remote TL tengono la chiave di quando si chiamavano «Supervisione»: reimportando non si duplicano)
      const base = 'xls-' + data + '-' + (tipo === 'supervisione' ? 'supervisione' : chiave(e.titolo) || 'evento') + '-' + orario.replace(':', '') + '-' + chiave(comp);
      visti[base] = (visti[base] || 0) + 1;
      e.id = base + (visti[base] > 1 ? '-' + visti[base] : '');
      eventi.push(e);
      precedente = { competizione: comp, round };
    });

    // assenze → giorni "Non disponibile" (non toccano ciò che l'operatore ha già indicato)
    const perOp = {};
    let assenze = 0;
    ass.slice(3).forEach((r) => {
      // solo righe con una data e un operatore conosciuto (in fondo al foglio c'è la legenda)
      const data = dataExcel(r[1]), id = data && idPerNome[chiave(r[0])];
      if (!id) return;
      perOp[id] = perOp[id] || Object.assign({}, A.disp[id] || {});
      if (!perOp[id][data]) { perOp[id][data] = { s: 'A', n: testo(r[2]) || 'Assenza', t: new Date().toISOString() }; assenze++; }
    });
    const disponibilita = Object.keys(perOp).map((id) => ({ id, giorni: perOp[id] }));

    return { regole, operatori, eventi, disponibilita, assenze, avvisi, esistenti };
  }

  // Ripristino da un backup settimanale (fogli Convocazioni A–R, Operatori, Impostazioni con compenso, ore e colore)
  function leggiBackup(wb, foglio, imp, conv) {
    const numero = (v) => (typeof v === 'number' ? v : testo(v) !== '' && !isNaN(Number(v)) ? Number(v) : null);
    const giornoBackup = (/· ([^·]+?) alle \d{1,2}:\d{2}/.exec(testo((conv[0] || [])[0])) || [])[1] || '';

    // impostazioni
    const regole = JSON.parse(JSON.stringify(A.regole));
    const operativo = {};
    const tariffe = {};
    ['P.IVA', 'Coop'].forEach((c) => ['diurno', 'notturno', 'maggiorato'].forEach((t) => { tariffe[('netto ' + c + ' ' + t).toLowerCase()] = [c, t]; }));
    const COMPENSI = { diurno: 'diurno', notturno: 'notturno', maggiorato: 'maggiorato', dimezzato: 'dimezzato' };
    imp.slice(1).forEach((r) => {
      const voce = testo(r[0]).toLowerCase();
      if (tariffe[voce] && typeof r[1] === 'number') regole.tariffe[tariffe[voce][0]][tariffe[voce][1]] = r[1];
      if (voce.startsWith('tariffa on-site') && typeof r[1] === 'number') regole.tariffaOnsite = r[1];
      if (voce === 'notturno dalle' && oraExcel(r[1])) regole.notteDa = oraExcel(r[1]);
      if (voce === 'notturno alle' && oraExcel(r[1])) regole.notteA = oraExcel(r[1]);
      if (voce === 'telefono di reperibilità') operativo.telefono = testo(r[1]);
      if (voce === 'giorni di blocco' && Number.isInteger(r[1]) && r[1] >= 0 && r[1] <= 14) operativo.giorniBlocco = r[1];
      if (testo(r[6]) && !regole.sport.includes(testo(r[6]))) regole.sport.push(testo(r[6]));
      const nome = testo(r[8]);
      if (!nome) return;
      const compenso = COMPENSI[testo(r[9]).toLowerCase()] || 'diurno';
      const campi = Object.assign({ nome, compenso, uefa: compenso === 'dimezzato', prima: numero(r[10]), dopo: numero(r[11]), colore: testo(r[12]) },
        testo(r[13]) ? { sport: testo(r[13]) } : {});
      const i = regole.competizioni.findIndex((c) => c.nome === nome);
      if (i >= 0) regole.competizioni[i] = Object.assign({}, regole.competizioni[i], campi);
      else regole.competizioni.push(Object.assign({ sport: '' }, campi));
    });
    const r = R.complete(regole);

    // operatori: per nome; dati completi dal foglio Operatori
    const RUOLI = { 'Remote TL': 'TL', 'Remote Support': 'SUP' };
    const datiOp = {};
    (wb.Sheets.Operatori ? foglio('Operatori') : []).slice(1).forEach((x) => {
      const nome = testo(x[0]);
      if (!nome) return;
      datiOp[chiave(nome)] = { mansione: testo(x[1]), ruolo: RUOLI[testo(x[2])] || 'OP', contratto: ['P.IVA', 'Coop'].includes(testo(x[3])) ? testo(x[3]) : '',
        email: testo(x[4]), telefono: testo(x[5]), onsite: ['TL', 'OP'].includes(testo(x[6])) ? testo(x[6]) : '', attivo: testo(x[7]).toUpperCase() !== 'NO', nome, id: idValido(x[8]) };
    });
    const operatori = [], esistenti = {}, idPerNome = {}, idVisti = new Set();
    // per ID (anche se nel frattempo ha cambiato nome), poi per nome come nell'importazione della stagione
    const assicura = (nome, idOp) => {
      const k = chiave(nome);
      if (!k && !idOp) return '';
      if (idOp && idVisti.has(idOp)) return idOp;
      if (!idOp && idPerNome[k]) return idPerNome[k];
      const { nome: _, id: __, ...campi } = datiOp[k] || {};
      const e = (idOp && A.operatori.find((o) => o.id === idOp)) || A.operatori.find((o) => chiave(o.nome) === k);
      if (!e && !k) return '';
      if (e) {
        // degli operatori presenti cambia solo ciò che è diverso, e mai con un campo vuoto (il backup non cancella dati più recenti)
        const diversi = {};
        Object.keys(campi).forEach((c) => {
          if (c === 'attivo' ? campi.attivo !== (e.attivo !== false) : campi[c] !== '' && campi[c] !== (e[c] || '')) diversi[c] = campi[c];
        });
        if (Object.keys(diversi).length) esistenti[e.id] = diversi;
        idVisti.add(e.id);
        return (idPerNome[k] = e.id);
      }
      const nuovo = Object.assign({ id: idOp || 'xls-' + k, nome: testo(nome), mansione: '', ruolo: 'OP', contratto: '', email: '', telefono: '', onsite: '', attivo: true, nuovo: true }, campi);
      operatori.push(nuovo);
      idVisti.add(nuovo.id);
      return (idPerNome[k] = nuovo.id);
    };
    Object.values(datiOp).forEach((o) => assicura(o.nome, o.id));

    // eventi
    const STATI = { 'Da assegnare': 'da-assegnare', 'Da inviare': 'assegnato', 'In attesa di risposta': 'convocato', Confermato: 'confermato', Rifiutato: 'rifiutato', Annullato: 'annullato' };
    const TIPI = { 'Remote TL': 'supervisione', 'Remote Support': 'support' };
    const conInviata = (conv[1] || []).some((x) => testo(x) === 'Inviata');
    const eventi = [], visti = {};
    conv.slice(2).forEach((x) => {
      const data = dataExcel(x[3]);
      if (!data) return;
      const tipo = TIPI[testo(x[14])] || 'partita', turno = tipo !== 'partita';
      const operatoreId = assicura(testo(x[7]), idValido(x[20]));
      const stato = STATI[testo(x[11])] || (operatoreId ? 'assegnato' : 'da-assegnare');
      const e = {
        tipo, competizione: turno ? DO.mansione(tipo) : testo(x[0]), round: turno ? '' : testo(x[1]), sport: turno ? '' : testo(x[2]), data,
        titolo: turno ? DO.mansione(tipo) : testo(x[4]), orario: turno ? '' : oraExcel(x[5]),
        // ritrovo e fine «scritti a mano» dalle colonne Q e R; un turno ha sempre il suo ritrovo
        convocazione: oraExcel(x[16]) || (turno ? oraExcel(x[6]) : ''), fine: oraExcel(x[17]), note: testo(x[10]),
        gettone: testo(x[12]).toUpperCase() === 'SI' ? 'maggiorato' : '', daSostituire: testo(x[13]).toUpperCase() === 'SI', operatoreId, stato,
        inviata: conInviata ? testo(x[18]).toUpperCase() === 'SI' : ['convocato', 'confermato', 'rifiutato'].includes(stato) || (stato === 'annullato' && !!operatoreId),
        risposta: testo(x[19]),
      };
      // una convocazione già inviata torna con gli orari dati all'operatore (colonne G e I), anche se le regole sono cambiate
      e.convocazioneCalcolata = (e.inviata && !e.convocazione && oraExcel(x[6])) || R.convocazione(e, r);
      e.fineCalcolata = (e.inviata && !e.fine && oraExcel(x[8])) || R.fine(e, r);
      const base = 'xls-' + data + '-' + (chiave(e.titolo) || 'evento') + '-' + e.orario.replace(':', '') + '-' + chiave(e.competizione);
      visti[base] = (visti[base] || 0) + 1;
      e.id = idValido(x[15]) || base + (visti[base] > 1 ? '-' + visti[base] : '');
      // lo storico di un evento ancora presente resta, con in più il ripristino
      const prima = A.eventi.find((y) => y.id === e.id);
      e.storico = ((prima && prima.storico) || []).concat({ quando: new Date().toISOString(), testo: 'Ripristinato dal backup' + (giornoBackup ? ' del ' + giornoBackup : '') });
      eventi.push(e);
    });
    return { regole: r, operatori, eventi, disponibilita: [], assenze: 0, avvisi: [], esistenti, backup: giornoBackup || 'file',
      operativo: Object.keys(operativo).length ? Object.assign({}, A.operativo, operativo) : null };
  }

  let pacchetto = null;
  $('imp-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const box = $('imp-anteprima');
    box.hidden = false;
    box.innerHTML = '<div class="caricamento"><span></span></div>';
    try {
      const X = await DO.caricaXlsx();
      pacchetto = leggiFile(X, await file.arrayBuffer());
      const ev = pacchetto.eventi, conta = (f) => ev.filter(f).length;
      const nuoviOp = pacchetto.operatori;
      const giaPresenti = ev.filter((x) => A.eventi.some((y) => y.id === x.id)).length;
      box.innerHTML = '<h3>' + DO.esc(file.name) + '</h3><ul class="elenco-semplice">'
        + '<li><b>' + ev.length + '</b> eventi (' + conta((x) => x.tipo === 'supervisione') + ' turni Remote TL, ' + conta((x) => x.tipo === 'support') + ' turni Remote Support): '
          + conta((x) => x.stato === 'confermato') + ' confermati, ' + conta((x) => x.stato === 'convocato') + ' in attesa di conferma, '
          + conta((x) => x.stato === 'da-assegnare') + ' da assegnare, ' + conta((x) => x.stato === 'annullato') + ' annullati'
          + (giaPresenti && !pacchetto.backup ? ' · <b>' + giaPresenti + '</b> già importati verranno aggiornati' : '') + '</li>'
        + (pacchetto.backup ? '<li><b>Backup del ' + DO.esc(pacchetto.backup) + ': ' + giaPresenti + (giaPresenti === 1 ? ' evento torna' : ' eventi tornano')
          + ' come nel backup (le modifiche fatte dopo quella data si perdono), ' + (ev.length - giaPresenti) + ' da ricreare</b></li>' : '')
        + '<li><b>' + nuoviOp.length + '</b> operatori nuovi' + (nuoviOp.length ? ': ' + nuoviOp.map((o) => DO.esc(o.nome) + ' (' + R.nomeRuolo(o.ruolo) + ', ' + (o.contratto || 'contratto ?') + ')').join(', ') : '') + '</li>'
        + (pacchetto.backup && Object.keys(pacchetto.esistenti).length ? '<li>Operatori già presenti che cambiano: ' + Object.keys(pacchetto.esistenti).map((id) => {
          const o = A.operatori.find((x) => x.id === id), m = pacchetto.esistenti[id];
          const voci = [m.ruolo && 'ruolo ' + R.nomeRuolo(m.ruolo), m.mansione && 'mansione ' + m.mansione, m.contratto && 'contratto ' + m.contratto,
            m.email && 'email ' + m.email, m.telefono && 'telefono ' + m.telefono, m.onsite && 'on-site ' + m.onsite,
            m.attivo === true && 'accesso riattivato', m.attivo === false && 'disattivato'].filter(Boolean);
          return '<b>' + DO.esc(o.nome) + '</b>: ' + DO.esc(voci.join(', '));
        }).join('; ') + '</li>' : '')
        + (!pacchetto.backup && Object.keys(pacchetto.esistenti).length ? '<li>Operatori già presenti aggiornati: ' + Object.keys(pacchetto.esistenti).map((id) => {
          const o = A.operatori.find((x) => x.id === id), m = pacchetto.esistenti[id];
          return DO.esc(o.nome) + ' (' + [m.ruolo && 'ruolo ' + R.nomeRuolo(m.ruolo), m.contratto && 'contratto ' + m.contratto].filter(Boolean).join(', ') + ')';
        }).join(', ') + '</li>' : '')
        + (pacchetto.backup ? '<li>Tariffe, sport, competizioni e mansioni come nel backup (i deployment on-site non si reimportano)</li>'
          + (pacchetto.operativo ? '<li>Telefono di reperibilità e giorni di blocco come nel backup</li>' : '') + '</ul>'
          : '<li><b>' + pacchetto.assenze + '</b> giorni di assenza da segnare come "Non disponibile"</li>'
          + '<li>Tariffe, sport e competizioni (Europa League e Conference League con compenso dimezzato)</li></ul>')
        + (pacchetto.avvisi.length ? '<p class="nota"><b>Da controllare:</b> ' + pacchetto.avvisi.map(DO.esc).join(' ') + '</p>' : '')
        + '<p class="nota">Gli operatori nuovi arrivano senza codice di accesso: crealo dalla scheda Operatori quando vuoi invitarli.'
          + (pacchetto.backup ? '' : ' Gli eventi con operatore risultano già inviati, con la conferma del file.') + '</p>'
        + '<div class="dialog-azioni"><button type="button" class="bottone" id="imp-annulla">Annulla</button><button type="button" class="primario" id="imp-conferma">Importa</button></div>';
    } catch (err) {
      pacchetto = null;
      box.innerHTML = '<p class="errore">' + DO.esc(err.message) + '</p>';
    }
  });

  $('imp-anteprima').addEventListener('click', async (e) => {
    if (e.target.id === 'imp-annulla') { pacchetto = null; $('imp-anteprima').hidden = true; return; }
    if (e.target.id !== 'imp-conferma' || !pacchetto) return;
    e.target.disabled = true;
    e.target.textContent = 'Importazione…';
    try {
      // operatori già presenti: ruolo (dai turni Remote TL / Remote Support) e contratto se mancava
      for (const id of Object.keys(pacchetto.esistenti)) {
        const o = A.operatori.find((x) => x.id === id);
        if (o) await DO.dati.salvaOperatore(Object.assign({}, o, pacchetto.esistenti[id]));
      }
      await DO.dati.importa(pacchetto);
      if (pacchetto.operativo) await DO.dati.salvaOperativo(pacchetto.operativo);
      DO.avviso('Importazione completata: ' + pacchetto.eventi.length + ' eventi.', 'ok', 6000);
      pacchetto = null;
      $('imp-anteprima').hidden = true;
    } catch (err) {
      DO.avviso(err.message, 'errore', 8000);
      e.target.disabled = false;
      e.target.textContent = 'Importa';
    }
  });

  A.registra({
    aggiorna: () => { if (A.vista === 'impostazioni') { disegnaRegole(); disegnaOperativo(); disegnaVisualizzatori(); if (!bozzaComp) disegnaCompetizioni(); } },
    mostra: (nome) => { if (nome === 'impostazioni') { disegnaRegole(); disegnaOperativo(); disegnaVisualizzatori(); disegnaCompetizioni(true); } },
  });
})(window.DO);
