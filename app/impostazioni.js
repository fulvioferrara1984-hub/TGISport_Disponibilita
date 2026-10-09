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
    $('reg-anticipo').value = r.anticipoOre;
    $('reg-fine').value = r.fineOre;
    $('reg-durata-sup').value = r.durataSupervisioneOre;
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
    const anticipoOre = R.numero($('reg-anticipo').value, { min: 0, max: 12 }), fineOre = R.numero($('reg-fine').value, { min: 0, max: 12 });
    const durataSupervisioneOre = R.numero($('reg-durata-sup').value, { min: 1, max: 16 });
    if (anticipoOre === null || fineOre === null || durataSupervisioneOre === null) {
      DO.avviso('Compila le ore: ritrovo e fine turno da 0 a 12, durata della supervisione da 1 a 16.', 'errore');
      return;
    }
    const tariffaOnsite = R.numero($('reg-tariffa-onsite').value, { min: 0, max: 2000 });
    if (tariffaOnsite === null) { DO.avviso('La tariffa on-site va da 0 a 2000 € al giorno.', 'errore'); return; }
    salva({
      tariffe, anticipoOre, fineOre, durataSupervisioneOre, tariffaOnsite,
      notteDa: $('reg-notte-da').value || '22:00', notteA: $('reg-notte-a').value || '06:00',
    }, 'Regole salvate.');
  });

  // ---------- competizioni e sport ----------
  let bozzaComp = null;
  function disegnaCompetizioni(forza) {
    if (!bozzaComp || forza) bozzaComp = A.regole.competizioni.map((c) => Object.assign({}, c));
    const sport = A.regole.sport;
    $('reg-competizioni').innerHTML = bozzaComp.map((c, i) => '<li data-i="' + i + '">'
      + '<input type="text" value="' + DO.esc(c.nome) + '" data-campo="nome" aria-label="Nome competizione" maxlength="80">'
      + '<select data-campo="sport" aria-label="Sport"><option value="">—</option>' + sport.map((s) => '<option' + (s === c.sport ? ' selected' : '') + '>' + DO.esc(s) + '</option>').join('') + '</select>'
      // ore prima (ritrovo) e dopo (fine turno): vuoto = valori generali
      + '<input type="number" data-campo="prima" min="0" max="12" step="0.25" value="' + (c.prima === null || c.prima === undefined ? '' : c.prima) + '" placeholder="' + A.regole.anticipoOre + '" title="Ritrovo: ore prima" aria-label="Ritrovo: ore prima">'
      + '<input type="number" data-campo="dopo" min="0" max="12" step="0.25" value="' + (c.dopo === null || c.dopo === undefined ? '' : c.dopo) + '" placeholder="' + A.regole.fineOre + '" title="Fine turno: ore dopo" aria-label="Fine turno: ore dopo">'
      + '<label class="spunta"><input type="checkbox" data-campo="uefa"' + (c.uefa ? ' checked' : '') + '><span>UEFA ½</span></label>'
      + '<button type="button" class="icona" data-togli="' + i + '" aria-label="Togli">✕</button></li>').join('');
    if (document.activeElement !== $('reg-sport')) $('reg-sport').value = sport.join(', ');
  }
  $('reg-competizioni').addEventListener('input', (e) => {
    const li = e.target.closest('li'), campo = e.target.dataset.campo;
    if (!li || !campo) return;
    bozzaComp[li.dataset.i][campo] = campo === 'uefa' ? e.target.checked : e.target.value;
  });
  $('reg-competizioni').addEventListener('change', (e) => {
    const li = e.target.closest('li');
    if (li && e.target.dataset.campo) bozzaComp[li.dataset.i][e.target.dataset.campo] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  });
  $('reg-competizioni').addEventListener('click', (e) => {
    const b = e.target.closest('[data-togli]');
    if (!b) return;
    bozzaComp.splice(Number(b.dataset.togli), 1);
    disegnaCompetizioni();
  });
  $('reg-aggiungi-comp').addEventListener('click', () => {
    bozzaComp.push({ nome: '', sport: '', uefa: false });
    disegnaCompetizioni();
    $('reg-competizioni').lastElementChild.querySelector('input').focus();
  });
  $('form-competizioni').addEventListener('submit', (e) => {
    e.preventDefault();
    const oreDa = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
    const competizioni = bozzaComp.filter((c) => c.nome.trim()).map((c) => ({ nome: c.nome.trim(), sport: c.sport || '', uefa: !!c.uefa, prima: oreDa(c.prima), dopo: oreDa(c.dopo) }));
    const sport = $('reg-sport').value.split(',').map((s) => s.trim()).filter(Boolean);
    bozzaComp = null;
    salva({ competizioni, sport }, 'Competizioni salvate.');
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

  function leggiFile(X, buffer) {
    const wb = X.read(buffer, { type: 'array' });
    const foglio = (nome) => {
      const ws = wb.Sheets[nome];
      if (!ws) throw new Error('Nel file manca il foglio "' + nome + '".');
      return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    };
    const imp = foglio('Impostazioni'), conv = foglio('Convocazioni');
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
      const uefa = /champions|europa league|conference/i.test(c);
      if (!regole.competizioni.some((x) => x.nome === c)) regole.competizioni.push({ nome: c, sport: uefa ? 'Calcio' : '', uefa });
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
      if (!comp && precedente && precedente.round === round) {
        comp = precedente.competizione;
        avvisi.push('Riga ' + riga + ': competizione mancante, presa dalla riga sopra (' + comp + ').');
      }
      // Europa e Conference League erano registrate sotto "Champions League"
      if (comp === 'Champions League' && /europa/i.test(nota + ' ' + round)) comp = 'Europa League';
      if (comp === 'Champions League' && /conference/i.test(nota + ' ' + round)) comp = 'Conference League';
      const titoloRiga = testo(r[4]), sup = /^supporto/i.test(titoloRiga);
      const annullato = /^deleted/i.test(nota);
      const storico = [{ quando: new Date().toISOString(), testo: 'Importato dal file Excel (riga ' + riga + ')' }];
      const rimosso = /^deleted\s*-\s*(.+)$/i.exec(nota);
      if (rimosso) storico.push({ quando: new Date().toISOString(), testo: 'Rimosso ' + rimosso[1].trim() });
      const operatoreId = annullato ? '' : assicura(nomeOp, '');
      if (sup && operatoreId) {
        const o = operatori.find((x) => x.id === operatoreId);
        if (o) o.ruolo = 'TL';
        else if ((A.operatori.find((x) => x.id === operatoreId) || {}).ruolo !== 'TL') esistenti[operatoreId] = Object.assign(esistenti[operatoreId] || {}, { ruolo: 'TL' });
      }
      const orario = oraExcel(r[5]);
      const e = {
        tipo: sup ? 'supervisione' : 'partita', competizione: comp, round, sport: testo(r[2]), data, orario,
        titolo: sup ? 'Supervisione' : titoloRiga, convocazione: '', note: nota,
        gettone: /maggiorat/i.test(nota) ? 'maggiorato' : '', daSostituire: /^cambiare/i.test(nota),
        operatoreId, stato: annullato ? 'annullato' : operatoreId ? (testo(r[9]).toUpperCase() === 'SI' ? 'confermato' : 'convocato') : 'da-assegnare',
        inviata: !annullato && !!operatoreId, storico,
      };
      if (sup) { e.convocazione = R.convocazione(e, regole); e.orario = ''; }
      e.convocazioneCalcolata = R.convocazione(e, regole);
      e.fineCalcolata = R.fine(e, regole);
      // identificativo stabile: ripetere l'importazione aggiorna lo stesso evento anche se si aggiungono righe
      const base = 'xls-' + data + '-' + (chiave(e.titolo) || 'evento') + '-' + orario.replace(':', '') + '-' + chiave(comp);
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
        + '<li><b>' + ev.length + '</b> eventi (' + conta((x) => x.tipo === 'supervisione') + ' turni di supervisione): '
          + conta((x) => x.stato === 'confermato') + ' confermati, ' + conta((x) => x.stato === 'convocato') + ' in attesa di conferma, '
          + conta((x) => x.stato === 'da-assegnare') + ' da assegnare, ' + conta((x) => x.stato === 'annullato') + ' annullati'
          + (giaPresenti ? ' · <b>' + giaPresenti + '</b> già importati verranno aggiornati' : '') + '</li>'
        + '<li><b>' + nuoviOp.length + '</b> operatori nuovi' + (nuoviOp.length ? ': ' + nuoviOp.map((o) => DO.esc(o.nome) + ' (' + o.ruolo + ', ' + (o.contratto || 'contratto ?') + ')').join(', ') : '') + '</li>'
        + (Object.keys(pacchetto.esistenti).length ? '<li>Operatori già presenti aggiornati: ' + Object.keys(pacchetto.esistenti).map((id) => {
          const o = A.operatori.find((x) => x.id === id), m = pacchetto.esistenti[id];
          return DO.esc(o.nome) + ' (' + [m.ruolo && 'ruolo TL', m.contratto && 'contratto ' + m.contratto].filter(Boolean).join(', ') + ')';
        }).join(', ') + '</li>' : '')
        + '<li><b>' + pacchetto.assenze + '</b> giorni di assenza da segnare come "Non disponibile"</li>'
        + '<li>Tariffe, sport e competizioni (aggiunte Europa League e Conference League come UEFA ½)</li></ul>'
        + (pacchetto.avvisi.length ? '<p class="nota"><b>Da controllare:</b> ' + pacchetto.avvisi.map(DO.esc).join(' ') + '</p>' : '')
        + '<p class="nota">Gli operatori nuovi arrivano senza codice di accesso: crealo dalla scheda Operatori quando vuoi invitarli. Gli eventi con operatore risultano già inviati, con la conferma del file.</p>'
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
      // operatori già presenti: ruolo TL (dai turni di supervisione) e contratto se mancava
      for (const id of Object.keys(pacchetto.esistenti)) {
        const o = A.operatori.find((x) => x.id === id);
        if (o) await DO.dati.salvaOperatore(Object.assign({}, o, pacchetto.esistenti[id]));
      }
      await DO.dati.importa(pacchetto);
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
    aggiorna: () => { if (A.vista === 'impostazioni') { disegnaRegole(); disegnaOperativo(); if (!bozzaComp) disegnaCompetizioni(); } },
    mostra: (nome) => { if (nome === 'impostazioni') { disegnaRegole(); disegnaOperativo(); disegnaCompetizioni(true); } },
  });
})(window.DO);
