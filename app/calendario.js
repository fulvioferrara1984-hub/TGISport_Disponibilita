/* Disponibilità Ops — calendario mensile a schermo intero della scheda Convocazioni.
 * Solo lettura: mostra eventi e giorni on-site con il colore di stato (verde confermato, blu in attesa
 * di conferma, arancione/rosso senza operatore fuori/dentro la finestra di blocco) e il bordino
 * della competizione. Usa i dati già presenti nella dashboard. */
(function (DO) {
  'use strict';

  const $ = DO.$, A = DO.admin, R = DO.regole, O = DO.onsite;
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const NOMI_STATO = { 'da-assegnare': 'da assegnare', assegnato: 'da inviare', convocato: 'in attesa di risposta', confermato: 'confermato', rifiutato: 'ha rifiutato' };
  const MAX_VOCI = 4;   // oltre: le prime tre e «+N altri»
  const alTocco = window.matchMedia && window.matchMedia('(hover: none)').matches;
  let mese = '';        // 'aaaa-mm' mostrato
  let voceAperta = null; // al tocco: voce di cui si vedono i dettagli

  const nomeOp = (id) => (A.operatori.find((o) => o.id === id) || {}).nome || 'operatore rimosso';
  const spostaMese = (m, n) => { const [a, x] = m.split('-').map(Number); const d = new Date(a, x - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

  // Voci di un giorno: prima i giorni on-site, poi gli eventi in ordine di orario (annullati esclusi)
  function voci(d) {
    const oggi = DO.oggi(), n = A.operativo.giorniBlocco;
    const onsite = A.onsite.filter((x) => x.stato !== 'annullata' && (x.giorni || []).some((g) => g.data === d)).map((x) => {
      const g = x.giorni.find((y) => y.data === d);
      return { tipo: 'onsite', id: x.id, stato: O.statoCalendarioOnsite(x, oggi, n), colore: O.COLORE,
        testo: 'ON-SITE · ' + (g.partita || [g.attivita, x.luogo].filter(Boolean).join(' · ')), x, g };
    });
    const eventi = A.eventi.filter((e) => e.data === d).map((e) => {
      const stato = R.statoCalendario(e, oggi, n);
      if (!stato) return null;
      const sup = e.tipo === 'supervisione', ora = (sup ? R.convocazione(e, A.regole) : e.orario) || '';
      return { tipo: 'evento', id: e.id, stato, colore: R.coloreCompetizione(e.competizione, A.regole), ora,
        testo: (ora ? ora + ' ' : '') + (sup ? 'Supervisione' + (e.competizione ? ' ' + e.competizione : '') : e.titolo || 'Partita'), e };
    }).filter(Boolean).sort((a, b) => (a.ora || '99').localeCompare(b.ora || '99'));
    return onsite.concat(eventi);
  }

  function disegna() {
    if ($('calendario').hidden) return;
    const [a, m] = mese.split('-').map(Number), oggi = DO.oggi();
    $('cal-titolo').textContent = MESI[m - 1] + ' ' + a;
    const settimane = DO.grigliaMese(mese);
    $('cal-griglia').style.gridTemplateRows = 'repeat(' + settimane.length + ', minmax(0, 1fr))';
    $('cal-griglia').innerHTML = settimane.map((s) => s.map(({ data, delMese }) => {
      const tutte = voci(data), visibili = tutte.length > MAX_VOCI ? tutte.slice(0, MAX_VOCI - 1) : tutte;
      const altre = tutte.length - visibili.length;
      return '<div class="cal-giorno' + (delMese ? '' : ' fuori') + (data === oggi ? ' oggi' : '') + '">'
        + '<span class="cal-num">' + Number(data.slice(8)) + '</span>'
        + visibili.map((v) => '<button type="button" class="cal-voce cal-' + v.stato + '" style="--comp: ' + v.colore + '" data-tipo="' + v.tipo + '" data-id="' + v.id
          + '" data-giorno="' + data + '">' + DO.esc(v.testo) + '</button>').join('')
        + (altre ? '<button type="button" class="cal-altri" data-giorno="' + data + '">+' + altre + ' altri</button>' : '') + '</div>';
    }).join('')).join('');
    nascondiDettagli();
  }

  // ---------- dettagli al passaggio del mouse (al tocco sul telefono) ----------
  function testoDettagli(v) {
    const g = DO.giorno(v.tipo === 'onsite' ? v.g.data : v.e.data), giorno = g.nome + ' ' + g.num + ' ' + g.mese;
    if (v.tipo === 'onsite') {
      const x = v.x;
      const chi = ['TL', 'OP'].flatMap((r) => (x['accettati' + r] || []).map((id) => nomeOp(id) + ' (' + r + ')'));
      return '<b>ON-SITE · ' + DO.esc(x.luogo) + (x.titolo ? ' · ' + DO.esc(x.titolo) : '') + '</b>'
        + '<span>' + giorno + ' · ' + DO.esc(x.sport) + '</span>'
        + '<span>' + DO.esc(v.g.attivita) + (v.g.partita ? ' · ' + DO.esc(v.g.partita) : '') + '</span>'
        + '<span>Posti ' + O.etichettaPosti(x) + '</span>'
        + '<span>' + (chi.length ? DO.esc(chi.join(', ')) : 'Nessuno ha ancora accettato') + '</span>';
    }
    const e = v.e, sup = e.tipo === 'supervisione';
    const ritrovo = R.convocazione(e, A.regole), fine = R.fine(e, A.regole);
    const round = e.round && (/^\d+$/.test(e.round) ? 'giornata ' + e.round : e.round);
    return '<b>' + DO.esc(sup ? 'Supervisione' : e.titolo || 'Partita') + '</b>'
      + '<span>' + giorno + (e.competizione ? ' · ' + DO.esc([e.competizione, round].filter(Boolean).join(' · ')) : '') + '</span>'
      + (!sup && e.orario ? '<span>Evento alle ' + DO.esc(e.orario) + '</span>' : '')
      + '<span>' + (sup ? 'Turno ' : 'Ritrovo ') + (ritrovo || '—') + (fine ? ' – fine ' + fine : '') + '</span>'
      + '<span>' + (e.operatoreId ? DO.esc(nomeOp(e.operatoreId)) + ' · ' : 'Senza operatore · ') + (NOMI_STATO[e.stato] || e.stato)
        + (e.daSostituire ? ' · da sostituire' : '') + '</span>'
      + (e.note ? '<span class="cal-note">' + DO.esc(e.note) + '</span>' : '');
  }

  function voceDi(b) {
    return voci(b.dataset.giorno).find((v) => v.tipo === b.dataset.tipo && v.id === b.dataset.id);
  }

  function mostraDettagli(b) {
    const v = voceDi(b);
    if (!v) return;
    const box = $('cal-dettagli');
    box.innerHTML = testoDettagli(v) + (alTocco ? '<button type="button" class="primario" data-apri>' + (v.tipo === 'onsite' ? 'Apri la scheda' : 'Apri nella settimana') + '</button>' : '');
    box.hidden = false;
    const r = b.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    box.style.top = (r.bottom + h + 8 < window.innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
    voceAperta = b;
  }
  function nascondiDettagli() { $('cal-dettagli').hidden = true; voceAperta = null; }

  // ---------- apertura, chiusura, clic ----------
  function apri(dataRiferimento) {
    mese = String(dataRiferimento || DO.oggi()).slice(0, 7);
    $('calendario').hidden = false;
    document.body.classList.add('con-calendario');
    $('cal-schermo').hidden = !$('calendario').requestFullscreen;
    disegna();
    $('cal-chiudi').focus();
  }
  function chiudi() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $('calendario').hidden = true;
    document.body.classList.remove('con-calendario');
    nascondiDettagli();
  }
  function vaiAlGiorno(data) {
    chiudi();
    A.mostra('convocazioni');
    A.vaiA(data);
  }
  function apriVoce(b) {
    if (b.dataset.tipo === 'onsite') { chiudi(); A.mostra('convocazioni'); DO.onsiteAdmin.apri(b.dataset.id); } else vaiAlGiorno(b.dataset.giorno);
  }

  $('cal-griglia').addEventListener('click', (e) => {
    const voce = e.target.closest('.cal-voce');
    if (voce) {
      // al tocco il primo tocco mostra i dettagli; dal riquadro si apre
      if (alTocco && voceAperta !== voce) { mostraDettagli(voce); return; }
      apriVoce(voce);
      return;
    }
    const altri = e.target.closest('.cal-altri');
    if (altri) vaiAlGiorno(altri.dataset.giorno);
  });
  $('cal-dettagli').addEventListener('click', (e) => { if (e.target.closest('[data-apri]') && voceAperta) apriVoce(voceAperta); });
  if (!alTocco) {
    $('cal-griglia').addEventListener('mouseover', (e) => { const voce = e.target.closest('.cal-voce'); if (voce && voce !== voceAperta) mostraDettagli(voce); });
    $('cal-griglia').addEventListener('mouseleave', nascondiDettagli);
    $('cal-griglia').addEventListener('mouseout', (e) => { if (e.target.closest('.cal-voce') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.cal-voce'))) nascondiDettagli(); });
  }
  $('cal-prec').addEventListener('click', () => { mese = spostaMese(mese, -1); disegna(); });
  $('cal-succ').addEventListener('click', () => { mese = spostaMese(mese, 1); disegna(); });
  $('cal-oggi').addEventListener('click', () => { mese = DO.oggi().slice(0, 7); disegna(); });
  $('cal-chiudi').addEventListener('click', chiudi);
  $('cal-schermo').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else $('calendario').requestFullscreen().catch(() => {});
  });
  // Esc: se il browser è a tutto schermo esce prima da lì (lo fa lui), poi chiude il calendario
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || $('calendario').hidden || document.fullscreenElement) return;
    if (!$('cal-dettagli').hidden) { nascondiDettagli(); return; }
    chiudi();
  });

  A.registra({ aggiorna: disegna });
  DO.calendario = { apri };
})(window.DO);
