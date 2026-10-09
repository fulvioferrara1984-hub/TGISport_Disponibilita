/* Disponibilità Ops — scheda Convocazioni: partite e turni di supervisione, assegnazioni, invio agli operatori.
 * Prende il posto del foglio "Convocazioni" del file Excel. */
(function (DO) {
  'use strict';

  const $ = DO.$, A = DO.admin, R = DO.regole;
  let lun = DO.lunedi(DO.oggi());
  let inModifica = null;

  const STATI = {
    'da-assegnare': { nome: 'Da assegnare', cls: 'st-vuoto' },
    assegnato: { nome: 'Da inviare', cls: 'st-P' },
    convocato: { nome: 'In attesa di risposta', cls: 'st-blu' },
    confermato: { nome: 'Confermato', cls: 'st-D' },
    rifiutato: { nome: 'Rifiutato', cls: 'st-A' },
    annullato: { nome: 'Annullato', cls: 'st-annullato' },
  };

  const plurale = (n, uno, molti) => n + ' ' + (n === 1 ? uno : molti);
  const operatore = (id) => A.operatori.find((o) => o.id === id);
  const nomeOp = (id) => (operatore(id) || {}).nome || 'operatore rimosso';
  const titolo = (e) => (e.tipo === 'supervisione' ? 'Supervisione' + (e.competizione ? ' ' + e.competizione : '') : e.titolo || 'Partita');
  const ordina = (a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'supervisione' ? -1 : 1)
    || (R.convocazione(a, A.regole) || '99').localeCompare(R.convocazione(b, A.regole) || '99') || titolo(a).localeCompare(titolo(b));
  // altri impegni dello stesso operatore nello stesso giorno: doppio turno
  const altriImpegni = (e, idOp) => A.eventi.filter((x) => x.id !== e.id && x.operatoreId === idOp && x.data === e.data && x.stato !== 'annullato');
  // doppio turno (orari separati) o turni sovrapposti, per l'operatore idOp su questo evento
  const conflitto = (e, idOp) => R.conflitto(e, altriImpegni(e, idOp), A.regole);
  const orariTurno = (x) => { const a = R.convocazione(x, A.regole), b = R.fine(x, A.regole); return (a || '—') + (b ? '–' + b : ''); };
  const elencoTurni = (lista) => lista.map((x) => titolo(x) + ' ' + orariTurno(x)).join(', ');

  // ---------- disegno ----------
  function filtroStato(e) {
    const f = $('ev-filtro-stato').value;
    if (f === 'sostituire') return e.daSostituire && e.stato !== 'annullato';
    return e.stato === f;
  }

  function eventiVisibili() {
    const comp = $('ev-filtro-comp').value, f = $('ev-filtro-stato').value, oggi = DO.oggi();
    return A.eventi.filter((e) => (!comp || e.competizione === comp)
      && (f ? filtroStato(e) && (e.data >= oggi || f === 'rifiutato') : e.data >= lun && e.data <= DO.aggiungi(lun, 6)));
  }

  function disegna() {
    if (A.vista !== 'convocazioni') return;
    if (!$('ev-mese').dataset.scelto) $('ev-mese').value = lun.slice(0, 7);
    const f = $('ev-filtro-stato').value;
    $('ev-navigatore').classList.toggle('spento', !!f);
    $('ev-etichetta').textContent = f ? 'Tutte le date' : DO.etichettaSettimana(lun);
    // la vista principale è la settimana: un filtro per stato è una lista a parte, con il ritorno ben visibile
    $('ev-filtro-attivo').hidden = !f;
    if (f) $('ev-filtro-attivo').innerHTML = 'Stai vedendo: <b>' + DO.esc($('ev-filtro-stato').selectedOptions[0].textContent.replace(' (tutte)', '')) + '</b>, tutte le date'
      + '<button type="button" class="bottone" id="ev-torna">← Torna alla settimana</button>';
    aggiornaCompetizioni();
    const lista = eventiVisibili();
    const attivi = lista.filter((e) => e.stato !== 'annullato');
    $('ev-riepilogo').textContent = attivi.length ? attivi.length + (attivi.length === 1 ? ' evento' : ' eventi') + ' · ' + attivi.filter((e) => !e.operatoreId).length + ' da assegnare' : '';
    disegnaConteggi();

    const giorni = f ? [...new Set(lista.map((e) => e.data))].sort() : DO.settimana(lun);
    if (!lista.length && f) { $('ev-giorni').innerHTML = '<div class="griglia-vuota">Nessun evento in questo stato.</div>'; return; }
    $('ev-giorni').innerHTML = giorni.map((d) => {
      const evs = lista.filter((e) => e.data === d).sort(ordina);
      const g = DO.giorno(d);
      const testa = '<div class="ev-giorno-testa' + (d === DO.oggi() ? ' oggi' : '') + '"><b>' + g.nome + ' ' + g.num + ' ' + g.mese + '</b>'
        + '<span>' + (evs.length ? plurale(evs.filter((e) => e.stato !== 'annullato').length, 'evento', 'eventi') : 'nessun evento') + '</span>'
        + '<button type="button" class="link" data-nuova-sup="' + d + '">+ supervisione</button>'
        + '<button type="button" class="link" data-nuove="' + d + '">+ partite</button></div>';
      return '<div class="ev-giorno' + (d < DO.oggi() ? ' passato' : '') + '">' + testa + evs.map(riga).join('') + '</div>';
    }).join('');
  }

  function riga(e) {
    const st = STATI[e.stato] || STATI['da-assegnare'];
    const conv = R.convocazione(e, A.regole), fine = R.fine(e, A.regole), notte = R.notturno(e, A.regole), annullato = e.stato === 'annullato';
    const tag = [];
    if (e.tipo === 'supervisione') tag.push('<span class="tag tag-sup">Supervisione</span>');
    if (R.uefa(e.competizione, A.regole)) tag.push('<span class="tag">UEFA ½</span>');
    if (e.gettone === 'maggiorato') tag.push('<span class="tag tag-magg">Maggiorato</span>');
    if (e.daSostituire && !annullato) tag.push('<span class="tag tag-errore">Da sostituire</span>');
    // nella finestra di blocco gli operatori non possono più cambiare: ciò che manca va sistemato ora
    if ((e.stato === 'da-assegnare' || e.stato === 'convocato') && e.data >= DO.oggi() && DO.bloccato(e.data, DO.oggi(), A.operativo.giorniBlocco)) {
      tag.push('<span class="tag tag-ridosso">⏰ a ridosso</span>');
    }
    return '<div class="ev-riga' + (annullato ? ' annullato' : '') + (e.tipo === 'supervisione' ? ' sup' : '') + '" data-id="' + e.id + '">'
      + '<div class="ev-ora">' + (e.tipo === 'supervisione' ? '<b>' + (conv || '—') + '</b><small>' + (fine ? 'fine ' + fine : 'inizio turno') + '</small>'
        : '<b>' + (e.orario || '—') + '</b><small>ritrovo ' + (conv || '—') + '</small>' + (fine ? '<small>fine ' + fine + '</small>' : ''))
        + (notte ? '<small class="notte">notturno</small>' : '') + '</div>'
      + '<div class="ev-info"><b>' + DO.esc(e.tipo === 'supervisione' ? 'Supervisione' : e.titolo) + '</b>'
        + '<small>' + DO.esc([e.competizione, e.round && (/^\d+$/.test(e.round) ? 'giornata ' + e.round : e.round)].filter(Boolean).join(' · ')) + '</small>'
        + (tag.length ? '<span class="ev-tag">' + tag.join('') + '</span>' : '')
        + (e.note ? '<small class="ev-nota">' + DO.esc(e.note) + '</small>' : '') + '</div>'
      + '<div class="ev-op">' + selettore(e) + avvisiOperatore(e) + '</div>'
      + '<div class="ev-stato"><span class="stato-chip ' + st.cls + '" title="' + DO.esc(e.risposta || '') + '">' + st.nome + '</span>'
        + (e.stato === 'rifiutato' && e.risposta ? '<small class="testo-errore">' + DO.esc(e.risposta) + '</small>' : '') + '</div>'
      + '<button type="button" class="icona ev-modifica" data-modifica-evento="' + e.id + '" aria-label="Modifica evento">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg></button>'
      + '</div>';
  }

  // Menu operatori: solo i TL per la supervisione; prima chi è disponibile, con i segnali di disponibilità e doppio turno.
  function selettore(e) {
    const ammessi = A.operatori.filter((o) => (o.attivo || o.id === e.operatoreId) && (e.tipo !== 'supervisione' || o.ruolo === 'TL' || o.id === e.operatoreId));
    const peso = { D: 0, P: 1, '': 2, A: 3 };
    const voci = ammessi.map((o) => {
      const v = A.valore(o.id, e.data), { livello } = conflitto(e, o.id);
      const segno = livello === 'sovrapposto' ? '⛔' : livello === 'doppio' ? '⚠' : { D: '✓', P: '½', A: '✕' }[v.s] || '·';
      const extra = (v.s === 'P' && v.n ? ' — ' + v.n : v.s === 'A' ? ' — non disponibile' : !v.s ? ' — disponibilità non indicata' : '')
        + (livello === 'sovrapposto' ? ' · sovrapposto' : livello === 'doppio' ? ' · ha già un turno' : '');
      return { o, peso: peso[v.s || ''] + (livello === 'sovrapposto' ? 0.8 : livello ? 0.5 : 0), testo: segno + ' ' + o.nome + extra };
    }).sort((a, b) => a.peso - b.peso || a.o.nome.localeCompare(b.o.nome, 'it'));
    return '<select data-assegna="' + e.id + '"' + (e.stato === 'annullato' ? ' disabled' : '') + ' aria-label="Operatore">'
      + '<option value="">— ' + (e.tipo === 'supervisione' ? 'Scegli un TL' : 'Scegli operatore') + ' —</option>'
      + voci.map((x) => '<option value="' + x.o.id + '"' + (x.o.id === e.operatoreId ? ' selected' : '') + '>' + DO.esc(x.testo) + '</option>').join('')
      + '</select>';
  }

  function avvisiOperatore(e) {
    if (!e.operatoreId || e.stato === 'annullato') return '';
    const out = [], v = A.valore(e.operatoreId, e.data), c = conflitto(e, e.operatoreId);
    if (c.livello === 'sovrapposto') out.push('<small class="avviso-op rosso">⛔ Turni sovrapposti con ' + DO.esc(elencoTurni(c.con)) + '</small>');
    else if (c.livello === 'doppio') out.push('<small class="avviso-op giallo">⚠ Doppio turno: anche ' + DO.esc(elencoTurni(c.con)) + '</small>');
    if (v.s === 'A') out.push('<small class="avviso-op rosso">✕ Ha indicato non disponibile' + (v.n ? ': ' + DO.esc(v.n) : '') + '</small>');
    else if (v.s === 'P') out.push('<small class="avviso-op giallo">½ Parziale' + (v.n ? ': ' + DO.esc(v.n) : '') + '</small>');
    const o = operatore(e.operatoreId);
    if (o && !o.contratto) out.push('<small class="avviso-op">Contratto non indicato</small>');
    return out.join('');
  }

  function disegnaConteggi() {
    const oggi = DO.oggi(), futuri = A.eventi.filter((e) => e.data >= oggi && e.stato !== 'annullato');
    const n = {
      'da-assegnare': futuri.filter((e) => e.stato === 'da-assegnare').length,
      assegnato: futuri.filter((e) => e.stato === 'assegnato').length,
      convocato: futuri.filter((e) => e.stato === 'convocato').length,
      rifiutato: A.eventi.filter((e) => e.stato === 'rifiutato').length,
      sostituire: futuri.filter((e) => e.daSostituire).length,
    };
    const etichette = { 'da-assegnare': 'da assegnare', assegnato: 'da inviare', convocato: 'in attesa di risposta', rifiutato: 'rifiutate', sostituire: 'da sostituire' };
    $('ev-conteggi').innerHTML = Object.keys(n).filter((k) => n[k]).map((k) =>
      '<button type="button" class="conteggio-conv conv-' + k + ($('ev-filtro-stato').value === k ? ' attivo' : '') + '" data-filtra="' + k + '"><b>' + n[k] + '</b> ' + etichette[k] + '</button>').join('');
    $('ev-invia').textContent = n.assegnato ? 'Invia convocazioni (' + n.assegnato + ')' : 'Invia convocazioni';
    $('ev-invia').disabled = !n.assegnato;
    $('badge-conv').textContent = n.rifiutato + n.sostituire ? String(n.rifiutato + n.sostituire) : '';
  }

  function aggiornaCompetizioni() {
    const nomi = A.regole.competizioni.map((c) => c.nome);
    A.eventi.forEach((e) => { if (e.competizione && !nomi.includes(e.competizione)) nomi.push(e.competizione); });
    const sel = $('ev-filtro-comp'), attuale = sel.value;
    const html = '<option value="">Tutte le competizioni</option>' + nomi.map((n) => '<option>' + DO.esc(n) + '</option>').join('');
    if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; sel.value = attuale; }
  }

  // elenchi dei menu nelle finestre (competizioni e sport dalle regole)
  function riempiElenchi(radice) {
    radice.querySelectorAll('select[data-elenco]').forEach((sel) => {
      const voci = sel.dataset.elenco === 'sport' ? A.regole.sport : A.regole.competizioni.map((c) => c.nome);
      sel.innerHTML = '<option value="">—</option>' + voci.map((v) => '<option>' + DO.esc(v) + '</option>').join('');
    });
  }
  const sportDi = (comp) => (R.competizione(comp, A.regole) || {}).sport || '';

  // ---------- assegnazione ----------
  $('ev-giorni').addEventListener('change', async (ev) => {
    const sel = ev.target.closest('[data-assegna]');
    if (!sel) return;
    const e = A.eventi.find((x) => x.id === sel.dataset.assegna), nuovo = sel.value;
    if (!e) return;
    if (nuovo) {
      const o = operatore(nuovo), v = A.valore(nuovo, e.data), c = conflitto(e, nuovo);
      const avvisi = [], quando = DO.giorno(e.data).nome.toLowerCase() + ' ' + DO.giorno(e.data).num;
      if (c.livello === 'sovrapposto') avvisi.push('TURNI SOVRAPPOSTI: ' + o.nome + ' il ' + quando + ' ha già un turno in orari che si sovrappongono (' + elencoTurni(c.con) + '; questo turno ' + orariTurno(e) + ').');
      else if (c.livello === 'doppio') avvisi.push('DOPPIO TURNO: ' + o.nome + ' ha già un turno il ' + quando + ' (' + elencoTurni(c.con) + '; questo turno ' + orariTurno(e) + ').');
      if (v.s === 'A') avvisi.push(o.nome + ' ha indicato NON DISPONIBILE per questo giorno' + (v.n ? ' (' + v.n + ')' : '') + '.');
      if (avvisi.length && !confirm(avvisi.join('\n\n') + '\n\nAssegnare comunque?')) { sel.value = e.operatoreId || ''; return; }
    }
    const nota = !nuovo ? 'Tolto ' + nomeOp(e.operatoreId)
      : e.operatoreId ? 'Sostituito ' + nomeOp(e.operatoreId) + ' con ' + nomeOp(nuovo) : 'Assegnato a ' + nomeOp(nuovo);
    sel.disabled = true;
    try {
      await DO.dati.aggiornaEvento(e.id, {
        operatoreId: nuovo, stato: nuovo ? 'assegnato' : 'da-assegnare', inviata: false, risposta: '', rispostaIl: '', daSostituire: false,
      }, nota);
    } catch (err) {
      DO.avviso(err.message, 'errore');
      sel.value = e.operatoreId || '';
    } finally {
      sel.disabled = false;
    }
  });

  // ---------- navigazione e filtri ----------
  $('ev-prec').addEventListener('click', () => { lun = DO.aggiungi(lun, -7); disegna(); });
  $('ev-succ').addEventListener('click', () => { lun = DO.aggiungi(lun, 7); disegna(); });
  $('ev-oggi').addEventListener('click', () => { lun = DO.lunedi(DO.oggi()); $('ev-filtro-stato').value = ''; disegna(); });
  $('ev-filtro-comp').addEventListener('change', disegna);
  $('ev-mese').addEventListener('change', () => { $('ev-mese').dataset.scelto = '1'; });
  $('ev-filtro-attivo').addEventListener('click', (e) => { if (e.target.id === 'ev-torna') { $('ev-filtro-stato').value = ''; disegna(); } });
  // all'apertura si parte sempre dalla settimana corrente (il browser altrimenti ricorda l'ultimo filtro)
  $('ev-filtro-stato').value = '';
  $('ev-filtro-comp').value = '';
  $('ev-filtro-stato').addEventListener('change', disegna);
  $('ev-conteggi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtra]');
    if (!b) return;
    $('ev-filtro-stato').value = $('ev-filtro-stato').value === b.dataset.filtra ? '' : b.dataset.filtra;
    disegna();
  });
  $('ev-giorni').addEventListener('click', (e) => {
    const m = e.target.closest('[data-modifica-evento]');
    if (m) apriEvento(A.eventi.find((x) => x.id === m.dataset.modificaEvento));
    const s = e.target.closest('[data-nuova-sup]');
    if (s) apriSupervisione(s.dataset.nuovaSup, s.dataset.nuovaSup);
    const p = e.target.closest('[data-nuove]');
    if (p) apriPartite(p.dataset.nuove);
  });

  // ---------- modifica evento ----------
  function apriEvento(e) {
    if (!e) return;
    inModifica = e;
    const f = $('form-evento');
    riempiElenchi(f);
    const sup = e.tipo === 'supervisione';
    $('evd-titolo').textContent = sup ? 'Turno di supervisione' : 'Partita';
    $('evd-titolo-riga').hidden = sup;
    $('evd-orario-riga').hidden = sup;
    aggiungiOpzione($('evd-competizione'), e.competizione);
    aggiungiOpzione($('evd-sport'), e.sport);
    $('evd-competizione').value = e.competizione || '';
    $('evd-round').value = e.round || '';
    $('evd-partita').value = e.titolo || '';
    $('evd-data').value = e.data;
    $('evd-orario').value = e.orario || '';
    $('evd-convocazione').value = sup ? R.convocazione(e, A.regole) : e.convocazione || '';
    $('evd-fine').value = e.fine || '';
    $('evd-sport').value = e.sport || '';
    $('evd-note').value = e.note || '';
    $('evd-maggiorato').checked = e.gettone === 'maggiorato';
    $('evd-sostituire').checked = !!e.daSostituire;
    $('evd-annulla-evento').textContent = e.stato === 'annullato' ? 'Ripristina evento' : 'Annulla evento';
    $('evd-errore').hidden = true;
    ritrovoAuto();
    $('evd-storico').innerHTML = (e.storico || []).length ? '<b>Storico</b>' + e.storico.slice().reverse().map((s) =>
      '<span>' + DO.quando(s.quando) + ' · ' + DO.esc(s.testo) + '</span>').join('') : '';
    $('dlg-evento').showModal();
  }

  function aggiungiOpzione(sel, valore) {
    if (valore && ![...sel.options].some((o) => o.value === valore)) sel.insertAdjacentHTML('beforeend', '<option>' + DO.esc(valore) + '</option>');
  }

  // orari automatici con le regole della competizione scelta: lasciando vuoto il campo si usano questi
  function ritrovoAuto() {
    if (!inModifica) return;
    const sup = inModifica.tipo === 'supervisione';
    const bozza = { tipo: inModifica.tipo, competizione: $('evd-competizione').value, orario: sup ? '' : $('evd-orario').value, convocazione: sup ? $('evd-convocazione').value : '' };
    const auto = R.convocazione(bozza, A.regole), fineAuto = R.fine(bozza, A.regole);
    $('evd-ritrovo-auto').textContent = sup ? '' : auto ? '(automatico ' + auto + ')' : '';
    $('evd-convocazione').placeholder = auto;
    $('evd-fine-auto').textContent = fineAuto ? '(automatica ' + fineAuto + ')' : '';
    $('evd-fine').placeholder = fineAuto;
  }
  $('evd-orario').addEventListener('input', ritrovoAuto);
  $('evd-convocazione').addEventListener('input', ritrovoAuto);
  $('evd-competizione').addEventListener('change', ritrovoAuto);
  $('evd-competizione').addEventListener('change', () => { if (!$('evd-sport').value) $('evd-sport').value = sportDi($('evd-competizione').value); });

  $('form-evento').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const e = inModifica, sup = e.tipo === 'supervisione';
    const campi = {
      competizione: $('evd-competizione').value, round: $('evd-round').value.trim(), data: $('evd-data').value,
      sport: $('evd-sport').value, note: $('evd-note').value.trim(), gettone: $('evd-maggiorato').checked ? 'maggiorato' : '',
      daSostituire: $('evd-sostituire').checked,
    };
    if (sup) { campi.convocazione = $('evd-convocazione').value; campi.orario = ''; } else {
      campi.titolo = $('evd-partita').value.trim();
      campi.orario = $('evd-orario').value;
      campi.convocazione = $('evd-convocazione').value;
    }
    campi.fine = $('evd-fine').value;
    if (!campi.data) { mostraErrore('evd-errore', 'Indica la data.'); return; }
    campi.convocazioneCalcolata = R.convocazione(Object.assign({}, e, campi), A.regole);
    campi.fineCalcolata = R.fine(Object.assign({}, e, campi), A.regole);
    // una convocazione già inviata con data o orari cambiati va rimandata all'operatore
    const cambiato = e.inviata && (campi.data !== e.data || campi.orario !== (e.orario || '') || campi.convocazioneCalcolata !== R.convocazione(e, A.regole));
    if (cambiato && e.stato !== 'annullato') Object.assign(campi, { inviata: false, stato: 'assegnato', risposta: '' });
    try {
      await DO.dati.aggiornaEvento(e.id, campi, cambiato ? 'Modificati data/orari: convocazione da rimandare' : 'Modificato');
      $('dlg-evento').close();
      if (cambiato) DO.avviso('Data o orari cambiati: la convocazione va inviata di nuovo.', 'ok', 6000);
    } catch (err) { mostraErrore('evd-errore', err.message); }
  });

  $('evd-annulla-evento').addEventListener('click', async () => {
    const e = inModifica;
    const ripristina = e.stato === 'annullato';
    if (!ripristina && !confirm('Annullare "' + titolo(e) + '"? Non conterà più nei riepiloghi' + (e.inviata ? ' e l\'operatore lo vedrà come annullato.' : '.'))) return;
    const stato = ripristina ? (e.operatoreId ? (e.inviata ? 'convocato' : 'assegnato') : 'da-assegnare') : 'annullato';
    try {
      await DO.dati.aggiornaEvento(e.id, { stato }, ripristina ? 'Ripristinato' : 'Annullato');
      $('dlg-evento').close();
    } catch (err) { mostraErrore('evd-errore', err.message); }
  });

  $('evd-elimina').addEventListener('click', async () => {
    const e = inModifica;
    const msg = e.inviata ? 'L\'evento è già stato inviato all\'operatore: se non si svolge è meglio "Annulla evento". Eliminarlo comunque?' : 'Eliminare definitivamente "' + titolo(e) + '"?';
    if (!confirm(msg)) return;
    try {
      await DO.dati.eliminaEvento(e.id);
      $('dlg-evento').close();
    } catch (err) { mostraErrore('evd-errore', err.message); }
  });

  function mostraErrore(id, testo) { $(id).textContent = testo; $(id).hidden = false; }

  // ---------- nuove partite ----------
  function apriPartite(data) {
    const f = $('form-partite');
    riempiElenchi(f);
    $('evp-righe').value = data ? data.slice(8) + '/' + data.slice(5, 7) + ' ' : '';
    $('evp-errore').hidden = true;
    anteprimaPartite();
    $('dlg-partite').showModal();
    $('evp-righe').focus();
  }
  $('ev-nuove').addEventListener('click', () => apriPartite(''));
  $('evp-competizione').addEventListener('change', () => { $('evp-sport').value = sportDi($('evp-competizione').value); });

  // "17/10 15:00 Venezia-Napoli": l'anno si ricava dalla stagione (agosto–luglio)
  function leggiRighe() {
    const ok = [], errori = [], st = R.stagione(DO.oggi());
    $('evp-righe').value.split('\n').map((r) => r.trim()).filter(Boolean).forEach((r, i) => {
      const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s+(\d{1,2})[:.](\d{2})\s+(.+)$/.exec(r);
      if (!m) { errori.push('Riga ' + (i + 1) + ': "' + r + '"'); return; }
      const g = Number(m[1]), me = Number(m[2]);
      let anno = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : Number(me >= 8 ? st.da.slice(0, 4) : st.a.slice(0, 4));
      const data = anno + '-' + String(me).padStart(2, '0') + '-' + String(g).padStart(2, '0');
      if (isNaN(DO.daIso(data)) || me > 12 || g > 31) { errori.push('Riga ' + (i + 1) + ': data non valida'); return; }
      ok.push({ data, orario: String(m[4]).padStart(2, '0') + ':' + m[5], titolo: m[6].trim() });
    });
    return { ok, errori };
  }
  function anteprimaPartite() {
    const { ok, errori } = leggiRighe();
    $('evp-anteprima').textContent = ok.length ? ok.length + (ok.length === 1 ? ' partita riconosciuta' : ' partite riconosciute') + (errori.length ? ' · da correggere: ' + errori.join('; ') : '') : 'Scrivi una partita per riga, es. 17/10 15:00 Venezia-Napoli.';
    $('evp-crea').textContent = ok.length ? 'Crea ' + ok.length + (ok.length === 1 ? ' partita' : ' partite') : 'Crea partite';
  }
  $('evp-righe').addEventListener('input', anteprimaPartite);
  $('form-partite').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { ok, errori } = leggiRighe();
    if (errori.length) { mostraErrore('evp-errore', 'Correggi le righe: ' + errori.join('; ')); return; }
    if (!ok.length) { mostraErrore('evp-errore', 'Nessuna partita da creare.'); return; }
    const comune = { tipo: 'partita', competizione: $('evp-competizione').value, round: $('evp-round').value.trim(), sport: $('evp-sport').value };
    try {
      await DO.dati.creaEventi(ok.map((p) => {
        const e = Object.assign({}, comune, p);
        return Object.assign(e, { convocazioneCalcolata: R.convocazione(e, A.regole), fineCalcolata: R.fine(e, A.regole) });
      }));
      $('dlg-partite').close();
      lun = DO.lunedi(ok[0].data);
      $('ev-filtro-stato').value = '';
      DO.avviso(ok.length + (ok.length === 1 ? ' partita creata.' : ' partite create.'), 'ok');
      disegna();
    } catch (err) { mostraErrore('evp-errore', err.message); }
  });

  // ---------- nuovi turni di supervisione ----------
  function apriSupervisione(da, a) {
    const f = $('form-supervisione');
    riempiElenchi(f);
    const sab = DO.aggiungi(lun, 5);
    $('evs-da').value = da || sab;
    $('evs-a').value = a || DO.aggiungi(sab, 1);
    const tl = A.operatori.filter((o) => o.attivo && o.ruolo === 'TL');
    $('evs-tl').innerHTML = '<option value="">— da assegnare —</option>' + tl.map((o) => '<option value="' + o.id + '">' + DO.esc(o.nome) + '</option>').join('');
    $('evs-errore').hidden = true;
    $('dlg-supervisione').showModal();
  }
  $('ev-nuova-sup').addEventListener('click', () => apriSupervisione());
  $('form-supervisione').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const da = $('evs-da').value, a = $('evs-a').value, ritrovo = $('evs-ritrovo').value;
    if (!da || !a || a < da) { mostraErrore('evs-errore', 'Controlla le date.'); return; }
    const giorni = [];
    for (let d = da; d <= a; d = DO.aggiungi(d, 1)) giorni.push(d);
    if (giorni.length > 31) { mostraErrore('evs-errore', 'Al massimo 31 giorni alla volta.'); return; }
    const comp = $('evs-competizione').value;
    try {
      await DO.dati.creaEventi(giorni.map((d) => ({ tipo: 'supervisione', competizione: comp, sport: sportDi(comp), data: d, titolo: 'Supervisione',
        orario: '', convocazione: ritrovo, convocazioneCalcolata: ritrovo, fineCalcolata: R.fine({ tipo: 'supervisione', convocazione: ritrovo }, A.regole),
        operatoreId: $('evs-tl').value })));
      $('dlg-supervisione').close();
      lun = DO.lunedi(da);
      $('ev-filtro-stato').value = '';
      DO.avviso(giorni.length + (giorni.length === 1 ? ' turno creato.' : ' turni creati.'), 'ok');
      disegna();
    } catch (err) { mostraErrore('evs-errore', err.message); }
  });

  // ---------- esportazione mensile (solo presenze, nessun compenso) ----------
  async function esportaMese(mese) {
    let X;
    try { X = await DO.caricaXlsx(); } catch (e) { DO.avviso(e.message, 'errore'); return; }
    const { convocazioni, presenze } = R.righeMese(A.eventi, A.operatori, A.regole, mese);
    if (convocazioni.length === 1) { DO.avviso('Nessun evento in questo mese.'); return; }
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(convocazioni), 'Convocazioni');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(presenze), 'Presenze');
    X.writeFile(wb, 'Convocazioni_' + mese + '.xlsx');
  }
  $('ev-esporta').addEventListener('click', () => esportaMese($('ev-mese').value || lun.slice(0, 7)));

  // ---------- invio delle convocazioni ----------
  let daInviare = [];
  $('ev-invia').addEventListener('click', () => {
    daInviare = A.eventi.filter((e) => e.stato === 'assegnato' && e.data >= DO.oggi()).sort((a, b) => a.data.localeCompare(b.data));
    const perOp = {};
    daInviare.forEach((e) => { (perOp[e.operatoreId] = perOp[e.operatoreId] || []).push(e); });
    $('evi-elenco').innerHTML = '<p style="margin: 0 0 10px;">Le convocazioni compaiono sulla pagina di ciascun operatore, che potrà confermare. Chi ha un\'email la riceve anche per posta.</p><ul class="elenco-semplice">'
      + Object.keys(perOp).map((id) => {
        const o = operatore(id) || {};
        return '<li><b>' + DO.esc(o.nome || '?') + '</b>: ' + perOp[id].length + (perOp[id].length === 1 ? ' convocazione' : ' convocazioni')
          + (o.email ? '' : ' <span class="testo-errore">(senza email)</span>') + (o.uid === '' ? ' <span class="testo-errore">(senza codice: non può ancora vederle)</span>' : '') + '</li>';
      }).join('') + '</ul>';
    $('evi-conferma').textContent = 'Invia ' + daInviare.length + (daInviare.length === 1 ? ' convocazione' : ' convocazioni');
    $('dlg-invia').showModal();
  });
  $('form-invia').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = $('evi-conferma');
    b.disabled = true;
    const perOp = {};
    const eventi = daInviare.map((e) => Object.assign({}, e, { convocazioneCalcolata: R.convocazione(e, A.regole), fineCalcolata: R.fine(e, A.regole) }));
    eventi.forEach((e) => { (perOp[e.operatoreId] = perOp[e.operatoreId] || []).push(e); });
    const contatti = Object.keys(perOp).map((id) => {
      const o = operatore(id) || {};
      return { nome: o.nome || '', email: o.email || '', eventi: perOp[id].map((e) => ({
        data: e.data, titolo: titolo(e), tipo: e.tipo, competizione: e.competizione || '', round: e.round || '', orario: e.orario || '', convocazione: e.convocazioneCalcolata, fine: e.fineCalcolata,
      })) };
    });
    try {
      const r = await DO.dati.inviaConvocazioni(eventi, contatti, A.linkSito());
      $('dlg-invia').close();
      DO.avviso(eventi.length + (eventi.length === 1 ? ' convocazione inviata.' : ' convocazioni inviate.'), 'ok');
      r.inviate.then((x) => { if (x.email) DO.avviso('Email inviate a ' + x.email + (x.email === 1 ? ' operatore.' : ' operatori.'), 'ok'); })
        .catch((e) => DO.avviso('Convocazioni visibili sulla piattaforma, ma le email non sono partite: ' + e.message, 'errore', 8000));
    } catch (err) {
      DO.avviso(err.message, 'errore');
    } finally {
      b.disabled = false;
    }
  });

  A.registra({
    aggiorna: disegna,
    mostra: (nome) => { if (nome === 'convocazioni') disegna(); },
    vaiA: (data) => { if (data) lun = DO.lunedi(data); $('ev-filtro-stato').value = ''; disegna(); },
  });
})(window.DO);
