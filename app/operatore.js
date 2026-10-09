/* Disponibilità Ops — pagina degli operatori: compilazione settimanale e invio ai supervisori. */
(function (DO) {
  'use strict';

  const $ = DO.$;
  const SETTIMANE_INDIETRO = 4;   // settimane passate consultabili (sola lettura)

  let operatore = null;
  let salvati = {};               // ultima versione inviata, data → { s, n }
  let bozza = {};                 // modifiche non ancora inviate, data → { s, n }
  let richieste = [];             // richieste aperte dei supervisori: { id, da, a, messaggio }
  let convocazioni = [];          // convocazioni ricevute (partite e turni Remote TL / Remote Support)
  let oggi = DO.iso(new Date()), limite = DO.aggiungi(oggi, 83);
  let lun = DO.lunedi(oggi);
  let invio = false;
  let operativo = Object.assign({}, DO.OPERATIVO_PREDEFINITO);   // telefono di reperibilità e giorni di blocco
  let onsite = [];                // deployment on-site mandati all'operatore
  let giorniOn = {};              // giorni in cui è on-site: data → { luogo, … }
  let richiesteEvento = [];       // richieste di disponibilità per una singola partita o turno
  const noteAperte = new Set();   // giorni in cui l'operatore ha chiesto di scrivere una nota

  const chiaveBozza = () => 'do-bozza-' + operatore.id;
  const vuoto = { s: '', n: '' };
  const valore = (d) => bozza[d] || salvati[d] || vuoto;
  const uguali = (a, b) => (a.s || '') === (b.s || '') && (a.n || '') === (b.n || '');
  // negli ultimi giorni prima dell'evento non si cambia più nulla: si telefona al supervisore
  const nellaFinestra = (d) => DO.bloccato(d, oggi, operativo.giorniBlocco);
  const bloccatoOra = (d) => d >= oggi && d <= limite && nellaFinestra(d);
  const modificabile = (d) => d >= oggi && d <= limite && !nellaFinestra(d) && !giorniOn[d];
  const aggiornaOnsite = () => { giorniOn = operatore ? DO.onsite.giorniOnsite(onsite, operatore.id) : {}; };
  const nModifiche = () => Object.keys(bozza).length;
  // pagina rimasta aperta da ieri: prima di agire si riallinea la data di oggi (e quindi la finestra di blocco)
  function riallineaOggi() {
    const adesso = DO.iso(new Date());
    if (adesso <= oggi) return false;
    oggi = adesso;
    Object.keys(bozza).forEach((d) => { if (!modificabile(d)) delete bozza[d]; });
    salvaBozza();
    return true;
  }
  const richiesto = (d) => modificabile(d) && richieste.some((x) => d >= x.da && d <= x.a);

  function giorniDi(x) {
    const out = [];
    for (let d = x.da > oggi ? x.da : oggi; d <= x.a && d <= limite; d = DO.aggiungi(d, 1)) out.push(d);
    return out.filter(modificabile);
  }

  function salvaBozza() {
    DO.scrivi(chiaveBozza(), nModifiche() ? bozza : null, true);
  }

  function imposta(d, nuovo) {
    if (!modificabile(d)) return;
    if (uguali(nuovo, salvati[d] || vuoto)) delete bozza[d];
    else bozza[d] = { s: nuovo.s || '', n: nuovo.n || '' };
    salvaBozza();
  }

  // ---------- disegno ----------
  function disegna() {
    const giorni = DO.settimana(lun);
    $('sett-etichetta').textContent = DO.etichettaSettimana(lun);
    const conti = { D: 0, P: 0, A: 0, vuoti: 0 };
    giorni.forEach((d) => { const s = valore(d).s; if (s) conti[s]++; else if (modificabile(d)) conti.vuoti++; });
    $('sett-riepilogo').textContent = lun === DO.lunedi(oggi) ? 'Questa settimana' + (conti.vuoti ? ' · ' + conti.vuoti + ' da compilare' : '')
      : conti.vuoti ? conti.vuoti + ' giorni da compilare' : conti.D + ' disponibili · ' + conti.A + ' non disponibili';
    $('sett-prec').disabled = lun <= DO.aggiungi(DO.lunedi(oggi), -7 * SETTIMANE_INDIETRO);
    $('sett-succ').disabled = DO.aggiungi(lun, 7) > limite;
    $('sett-oggi').disabled = lun === DO.lunedi(oggi);
    const qualcosa = giorni.some(modificabile);
    document.querySelectorAll('[data-tutti], #copia-prec').forEach((b) => { b.disabled = !qualcosa; });

    $('giorni').innerHTML = giorni.map((d) => {
      const g = DO.giorno(d), v = valore(d), attivo = modificabile(d);
      const stati = Object.keys(DO.STATI).map((s) =>
        '<button type="button" role="radio" class="st-' + s + '" data-stato="' + s + '" aria-checked="' + (v.s === s) + '"' + (attivo ? '' : ' disabled') + '>'
        + '<span class="pallino"></span><span>' + DO.STATI[s].nome + '</span></button>').join('');
      // la nota si mostra solo quando serve: per i parziali, se c'è già o se l'operatore la chiede
      const conNota = v.s === 'P' || v.n || noteAperte.has(d);
      const nota = conNota
        ? '<input type="text" class="nota-giorno" maxlength="200" placeholder="' + (v.s === 'P' ? 'Orari (es. solo dalle 18:00)' : 'Nota facoltativa') + '" value="' + DO.esc(v.n) + '"'
          + (attivo ? '' : ' disabled') + ' aria-label="Nota per ' + g.nome + ' ' + g.num + '">'
        : attivo ? '<button type="button" class="link aggiungi-nota" data-nota>+ Aggiungi una nota</button>' : '';
      return '<li class="giorno' + (bozza[d] ? ' modificato' : '') + (attivo ? '' : ' passato') + (richiesto(d) && !v.s ? ' da-fare' : '') + '" data-data="' + d + '">'
        + '<div class="giorno-data"><b>' + g.nome + '</b><small>' + g.num + ' ' + g.mese + '</small>'
        + (d === oggi ? '<span class="oggi">Oggi</span>' : '') + (richiesto(d) ? '<span class="richiesto">Richiesto</span>' : '')
        + (giorniOn[d] ? '<span class="onsite-tag">On-site · ' + DO.esc(giorniOn[d].luogo) + '</span>'
          : bloccatoOra(d) ? '<span class="bloccato-tag">Bloccato: contatta il supervisore</span>' : '')
        + convocazioni.filter((c) => c.data === d && c.stato !== 'annullato' && c.stato !== 'rifiutato')
          .map((c) => '<span class="giorno-convocato">Convocato · ritrovo ' + DO.esc(ritrovo(c) || '—') + '</span>').join('') + '</div>'
        + '<div class="giorno-scelte"><div class="stati" role="radiogroup" aria-label="Disponibilità di ' + g.nome + ' ' + g.num + '">' + stati + '</div>'
        + nota + '</div></li>';
    }).join('');
    disegnaRichieste();
    disegnaRichiesteEvento();
    disegnaOnsite();
    disegnaConvocazioni();
    disegnaBarra();
  }

  // ---------- convocazioni ----------
  const ritrovo = (c) => c.convocazione || c.convocazioneCalcolata || '';
  const fineTurno = (c) => c.fine || c.fineCalcolata || '';

  function tasto(azione, c) {
    if (azione === 'conferma') return '<button type="button" class="primario" data-rispondi="confermato" data-id="' + c.id + '">Confermo</button>';
    if (azione === 'rifiuta') return '<button type="button" class="bottone" data-rispondi="rifiutato" data-id="' + c.id + '">Non posso</button>';
    if (azione === 'riconferma') return '<button type="button" class="link" data-rispondi="confermato" data-id="' + c.id + '">Posso, confermo</button>';
    // telefona: numero di reperibilità impostato dai supervisori
    const numero = String(operativo.telefono || '').replace(/[^\d+]/g, '');
    return numero ? '<a class="bottone telefona" href="tel:' + numero + '">📞 Contatta il supervisore</a>'
      : '<span class="conv-senza-numero">Chiedi ai supervisori il numero di reperibilità</span>';
  }

  // deployment accettati (o annullati dopo l'accettazione) ancora in corso o futuri
  const onsiteMiei = () => onsite.filter((d) => d.a >= oggi && ['accettato', 'annullato'].includes(DO.onsite.statoPerOperatore(d, operatore, oggi)));
  const giorniElenco = (d) => '<ul class="onsite-giorni">' + d.giorni.map((x) => {
    const g = DO.giorno(x.data);
    return '<li><b>' + g.breve + ' ' + g.num + ' ' + g.mese + '</b> · ' + DO.esc(x.attivita) + (x.partita ? ' · ' + DO.esc(x.partita) : '') + '</li>';
  }).join('') + '</ul>';

  function schedaOnsite(d) {
    const g = DO.giorno(d.da), annullato = d.stato === 'annullata';
    return '<div class="convocazione onsite' + (annullato ? ' annullata' : '') + '">'
      + '<div class="conv-data"><small>' + g.breve + '</small><b>' + g.num + '</b><small>' + g.meseBreve + '</small></div>'
      + '<div class="conv-info"><b>On-site · ' + DO.esc(d.luogo) + (d.titolo ? ' · ' + DO.esc(d.titolo) : '') + '</b>'
      + '<span>' + DO.esc(d.sport) + ' · ' + DO.onsite.periodoBreve(d.da, d.a) + ' · posto on-site ' + DO.onsite.ruoloAccettato(d, operatore.id) + '</span>'
      + giorniElenco(d) + (d.note ? '<span class="onsite-nota">' + DO.esc(d.note) + '</span>' : '') + '</div>'
      + '<div class="conv-azioni">' + (annullato ? '<span class="stato-chip st-annullato">Annullato dal supervisore</span>'
        : '<span class="stato-chip st-D">Confermato</span>' + tasto('telefona')) + '</div></div>';
  }

  function disegnaConvocazioni() {
    const box = $('mie-convocazioni');
    const prossime = convocazioni.filter((c) => c.data >= oggi).sort((a, b) => (a.data + ritrovo(a)).localeCompare(b.data + ritrovo(b)));
    const deployment = onsiteMiei();
    box.hidden = false;
    if (!prossime.length && !deployment.length) {
      box.innerHTML = '<div class="scheda-testa"><h2>Le tue convocazioni</h2></div>'
        + '<p class="conv-vuoto">Nessuna convocazione in programma. Quando i supervisori ti convocano la trovi qui, da confermare.</p>';
      return;
    }
    const daRispondere = prossime.filter((c) => c.stato === 'convocato').length;
    const voci = deployment.map((d) => ({ chiave: d.da, html: schedaOnsite(d) }));
    box.innerHTML = '<div class="scheda-testa"><h2>Le tue convocazioni</h2><span class="spazio"></span>'
      + (daRispondere ? '<span class="stato-chip st-blu">' + daRispondere + ' da confermare</span>' : '') + '</div>'
      + prossime.map((c) => ({ chiave: c.data + ritrovo(c), html: rigaConvocazione(c) })).concat(voci)
        .sort((a, b) => a.chiave.localeCompare(b.chiave)).map((v) => v.html).join('');
  }

  function rigaConvocazione(c) {
    const g = DO.giorno(c.data), sup = DO.turnoRemoto(c.tipo);
    const fine = DO.esc(fineTurno(c)), inizio = DO.esc(ritrovo(c) || '—');
    const orari = sup ? (fine ? 'Turno <span class="ritrovo">' + inizio + ' – ' + fine + '</span>' : 'Inizio turno <span class="ritrovo">' + inizio + '</span>')
      : (c.orario ? 'Evento alle ' + DO.esc(c.orario) + ' · ' : '') + '<span class="ritrovo">Ritrovo ' + inizio + (fine ? ' – fine turno ' + fine : '') + '</span>';
    const { azioni: elenco, spiegazione } = DO.azioniConvocazione(c.stato, nellaFinestra(c.data));
    const etichetta = { annullato: '<span class="stato-chip st-annullato">Annullata</span>', confermato: '<span class="stato-chip st-D">Confermata</span>', rifiutato: '<span class="stato-chip st-A">Non puoi</span>' }[c.stato] || '';
    const azioni = etichetta + elenco.map((a) => tasto(a, c)).join('');
    return '<div class="convocazione' + (c.stato === 'annullato' ? ' annullata' : '') + '">'
      + '<div class="conv-data"><small>' + g.breve + '</small><b>' + g.num + '</b><small>' + g.meseBreve + '</small></div>'
      + '<div class="conv-info"><b>' + DO.esc(sup ? DO.nomeTurno(c.tipo) : c.titolo) + '</b>'
      + (sup ? '' : '<span>' + DO.esc([c.competizione, c.round && (/^\d+$/.test(c.round) ? 'giornata ' + c.round : c.round)].filter(Boolean).join(' · ')) + '</span>')
      + '<span>' + orari + '</span>'
      + (spiegazione ? '<small class="conv-spiegazione">Mancano ' + operativo.giorniBlocco + ' giorni o meno: per rinunciare chiama il supervisore.</small>' : '') + '</div>'
      + '<div class="conv-azioni">' + azioni + '</div></div>';
  }

  $('mie-convocazioni').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rispondi]');
    if (!b) return;
    const c = convocazioni.find((x) => x.id === b.dataset.id), stato = b.dataset.rispondi;
    if (riallineaOggi()) disegna();
    if (stato === 'rifiutato' && !DO.azioniConvocazione(c.stato, nellaFinestra(c.data)).azioni.includes('rifiuta')) {
      DO.avviso(DO.NON_PIU_RINUNCIABILE, 'errore', 8000);
      disegna();
      return;
    }
    let motivo = '';
    if (stato === 'rifiutato') {
      motivo = prompt('Perché non puoi? (facoltativo, lo leggono i supervisori)', '');
      if (motivo === null) return;
    }
    b.disabled = true;
    try {
      await DO.dati.rispondiConvocazione(c, stato, motivo);
      Object.assign(c, { stato, risposta: motivo });
      salvaCopia();
      disegna();
      DO.avviso(stato === 'confermato' ? 'Convocazione confermata.' : 'Abbiamo avvisato i supervisori.', 'ok');
    } catch (err) {
      DO.avviso(err.message, 'errore', 8000);
      disegna();
    }
  });

  // ---------- richieste on-site ----------
  // "il 12 e il 13 ottobre", "il 31 ottobre e l'1 novembre"
  function elencoDate(date) {
    const parti = date.map((d, i) => {
      const g = DO.giorno(d), dopo = date[i + 1] && DO.giorno(date[i + 1]);
      return ([1, 8, 11].includes(g.num) ? 'l\'' : 'il ') + g.num + (dopo && dopo.mese === g.mese ? '' : ' ' + g.mese);
    });
    return parti.length > 1 ? parti.slice(0, -1).join(', ') + ' e ' + parti[parti.length - 1] : parti[0] || '';
  }

  function disegnaOnsite() {
    const box = $('richieste-onsite');
    const visibili = operatore ? onsite.filter((d) => d.a >= oggi
      && ['da-rispondere', 'rifiutato', 'esaurito', 'escluso'].includes(DO.onsite.statoPerOperatore(d, operatore, oggi))) : [];
    box.hidden = !visibili.length;
    if (!visibili.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="scheda-testa"><h2>Richieste on-site</h2></div>' + visibili.sort((a, b) => a.da.localeCompare(b.da)).map((d) => {
      const stato = DO.onsite.statoPerOperatore(d, operatore, oggi), ruolo = operatore.onsite, g = DO.giorno(d.da);
      const liberi = DO.onsite.postiLiberi(d)[ruolo] || 0;
      const conflitti = DO.onsite.conflittiRemoti(d, convocazioni), giaOnsite = DO.onsite.conflittiOnsite(d, onsite, operatore.id);
      const accetta = (testo, cls) => '<button type="button" class="' + cls + '" data-onsite="accetta" data-id="' + d.id + '">' + testo + '</button>';
      const nonPosso = '<button type="button" class="bottone" data-onsite="rifiuta" data-id="' + d.id + '">Non posso</button>';
      let azioni;
      if (stato === 'escluso') azioni = '<small class="conv-spiegazione">' + DO.onsite.MESSAGGI.escluso + '</small>';
      else if (stato === 'esaurito') azioni = '<span class="stato-chip">Posti esauriti</span>';
      else if (conflitti.length || giaOnsite.length) {
        azioni = (conflitti.length ? '<small class="conv-spiegazione">Hai già convocazioni ' + elencoDate(conflitti) + ': chiama il supervisore</small>' : '')
          + (giaOnsite.length ? '<small class="conv-spiegazione">Sei già on-site ' + elencoDate(giaOnsite) + ': chiama il supervisore</small>' : '')
          + tasto('telefona') + (stato === 'da-rispondere' ? nonPosso : '');
      } else if (stato === 'rifiutato') azioni = '<span class="stato-chip st-A">Hai risposto: non posso</span>' + accetta('Ho cambiato idea, accetto', 'link');
      else azioni = nonPosso + accetta('Accetto', 'primario');
      return '<div class="convocazione onsite">'
        + '<div class="conv-data"><small>' + g.breve + '</small><b>' + g.num + '</b><small>' + g.meseBreve + '</small></div>'
        + '<div class="conv-info"><b>On-site · ' + DO.esc(d.luogo) + (d.titolo ? ' · ' + DO.esc(d.titolo) : '') + '</b>'
        + '<span>' + DO.esc(d.sport) + ' · ' + DO.onsite.periodoBreve(d.da, d.a) + ' · posto on-site ' + ruolo
        + (stato === 'esaurito' || stato === 'escluso' ? '' : ' · ' + (liberi === 1 ? '1 posto libero' : liberi + ' posti liberi')) + '</span>'
        + giorniElenco(d) + (d.note ? '<span class="onsite-nota">' + DO.esc(d.note) + '</span>' : '') + '</div>'
        + '<div class="conv-azioni">' + azioni + '</div></div>';
    }).join('');
  }

  $('richieste-onsite').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-onsite]');
    if (!b) return;
    const d = onsite.find((x) => x.id === b.dataset.id), accetto = b.dataset.onsite === 'accetta';
    if (riallineaOggi()) disegna();
    if (accetto && !confirm('Accetti il deployment on-site a ' + d.luogo + ' (' + DO.onsite.periodoBreve(d.da, d.a) + ')?\n'
      + 'Dopo non potrai ritirarti dal sito: per qualunque cambio dovrai chiamare il supervisore.')) return;
    b.disabled = true;
    try {
      await DO.dati.rispondiOnsite(d.id, accetto);
      DO.avviso(accetto ? 'Posto confermato: trovi il deployment nelle tue convocazioni.' : 'Risposta inviata ai supervisori.', 'ok');
    } catch (err) {
      DO.avviso(err.message, 'errore', 8000);
    }
    try { onsite = await DO.dati.mieiOnsite(); } catch (err) { /* resta la lista di prima */ }
    aggiornaOnsite();
    salvaCopia();
    disegna();
  });

  // ---------- richieste di disponibilità per un evento ----------
  function disegnaRichiesteEvento() {
    const box = $('richieste-evento');
    const stato = (r) => DO.richiesteEvento.statoPerOperatore(r, operatore.id, oggi);
    const visibili = operatore ? richiesteEvento.filter((r) => stato(r) !== 'nascosta') : [];
    box.hidden = !visibili.length;
    if (!visibili.length) { box.innerHTML = ''; return; }
    const chiave = (r) => r.evento.data + (r.evento.ritrovo || '');
    box.innerHTML = '<div class="scheda-testa"><h2>Ti chiediamo se sei disponibile</h2></div>' + visibili.sort((a, b) => chiave(a).localeCompare(chiave(b))).map((r) => {
      const e = r.evento, g = DO.giorno(e.data), st = stato(r), sup = DO.turnoRemoto(e.tipo);
      const rispondi = (v, testo, cls) => '<button type="button" class="' + cls + '" data-evento-risposta="' + v + '" data-id="' + DO.esc(r.id) + '">' + testo + '</button>';
      const orari = sup ? 'turno ' + (e.ritrovo || '—') + (e.fine ? ' – ' + e.fine : '')
        : (e.orario ? 'evento ' + e.orario + ' · ' : '') + 'ritrovo ' + (e.ritrovo || '—') + (e.fine ? ' – fine ' + e.fine : '');
      const azioni = {
        'da-rispondere': rispondi('no', 'No', 'bottone') + rispondi('si', 'Sì, sono disponibile', 'primario'),
        'risposto-si': '<span class="stato-chip st-D">Hai risposto: sì</span>' + rispondi('no', 'Non sono più disponibile', 'link'),
        'risposto-no': '<span class="stato-chip st-A">Hai risposto: no</span>' + rispondi('si', 'Ho cambiato idea, sono disponibile', 'link'),
        coperto: '<span class="stato-chip">Posto già coperto, grazie</span>',
      }[st];
      return '<div class="convocazione richiesta-evento' + (st === 'coperto' ? ' coperta' : '') + '">'
        + '<div class="conv-data"><small>' + g.breve + '</small><b>' + g.num + '</b><small>' + g.meseBreve + '</small></div>'
        + '<div class="conv-info"><b>' + DO.esc(sup ? DO.nomeTurno(e.tipo) : e.titolo) + '</b>'
        + (sup ? '' : '<span>' + DO.esc([e.competizione, e.round && (/^\d+$/.test(e.round) ? 'giornata ' + e.round : e.round)].filter(Boolean).join(', ')) + '</span>')
        + '<span>' + g.breve + ' ' + g.num + ' ' + g.mese + ' · <span class="ritrovo">' + DO.esc(orari) + '</span></span>'
        + (r.messaggio ? '<span class="onsite-nota">' + DO.esc(r.messaggio) + '</span>' : '') + '</div>'
        + '<div class="conv-azioni">' + azioni + '</div></div>';
    }).join('');
  }

  $('richieste-evento').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-evento-risposta]');
    if (!b) return;
    const risposta = b.dataset.eventoRisposta;
    if (riallineaOggi()) disegna();
    b.disabled = true;
    try {
      await DO.dati.rispondiRichiestaEvento(b.dataset.id, risposta);
      DO.avviso(risposta === 'si' ? 'Grazie: i supervisori sanno che sei disponibile.' : 'Risposta inviata ai supervisori.', 'ok');
    } catch (err) {
      DO.avviso(err.message, 'errore', 8000);
    }
    try { richiesteEvento = await DO.dati.mieRichiesteEvento(); } catch (err) { /* resta la lista di prima */ }
    salvaCopia();
    disegna();
  });

  function disegnaRichieste() {
    $('richieste').innerHTML = richieste.map((x) => {
      const giorni = giorniDi(x);
      const mancanti = giorni.filter((d) => !valore(d).s).length;
      const daInviare = !mancanti && giorni.some((d) => bozza[d]);
      const stato = mancanti ? '<b>' + mancanti + (mancanti === 1 ? ' giorno da compilare' : ' giorni da compilare') + '</b>'
        : daInviare ? '<b>Compilata</b>: ricordati di premere Invia' : '<b>Completata</b>, grazie!';
      const vai = DO.lunedi(giorni.find((d) => !valore(d).s) || giorni[0] || x.da);
      return '<div class="richiesta' + (mancanti || daInviare ? '' : ' fatta') + '">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
        + '<div class="richiesta-testo"><span>I supervisori chiedono le tue disponibilità <b>' + DO.periodo(x.da, x.a) + '</b></span>'
        + (x.messaggio ? '<q>' + DO.esc(x.messaggio) + '</q>' : '') + '<small>' + stato + '</small></div>'
        + (mancanti && vai !== lun ? '<button type="button" class="bottone" data-vai="' + vai + '">Vai al periodo</button>' : '') + '</div>';
    }).join('');
  }

  function disegnaBarra() {
    const n = nModifiche();
    const ultimo = operatore.ultimoInvio ? 'Ultimo invio: ' + DO.quando(operatore.ultimoInvio) : 'Non hai ancora inviato le tue disponibilità';
    $('stato-invio').innerHTML = n ? '<b>' + n + (n === 1 ? ' modifica' : ' modifiche') + '</b> non ancora ' + (n === 1 ? 'inviata' : 'inviate') + '<br>' + DO.esc(ultimo)
      : DO.esc(ultimo) + (operatore.ultimoInvio ? '<br>Tutto inviato' : '');
    $('annulla-bozza').hidden = !n;
    $('btn-invia').disabled = invio;
    $('btn-invia').textContent = invio ? 'Invio in corso…' : 'Invia ai supervisori';
  }

  // ---------- interazione ----------
  $('giorni').addEventListener('click', (e) => {
    const li = e.target.closest('.giorno');
    if (!li) return;
    const d = li.dataset.data;
    if (e.target.closest('[data-nota]')) {
      noteAperte.add(d);
      disegna();
      $('giorni').querySelector('[data-data="' + d + '"] .nota-giorno').focus();
      return;
    }
    const b = e.target.closest('[data-stato]');
    if (!b) return;
    const v = valore(d), nuovo = v.s === b.dataset.stato ? '' : b.dataset.stato;
    imposta(d, { s: nuovo, n: v.n });
    $('conferma').hidden = true;
    disegna();
    // per un parziale servono gli orari: si porta subito il cursore sulla nota
    if (nuovo === 'P' && !v.n) $('giorni').querySelector('[data-data="' + d + '"] .nota-giorno').focus();
  });

  $('giorni').addEventListener('input', (e) => {
    if (!e.target.classList.contains('nota-giorno')) return;
    const li = e.target.closest('.giorno'), d = li.dataset.data;
    noteAperte.add(d);
    imposta(d, { s: valore(d).s, n: e.target.value });
    li.classList.toggle('modificato', !!bozza[d]);
    disegnaBarra();
  });

  $('richieste').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vai]');
    if (!b) return;
    lun = b.dataset.vai;
    disegna();
    $('settimana-scheda').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.querySelectorAll('[data-tutti]').forEach((b) => b.addEventListener('click', () => {
    DO.settimana(lun).forEach((d) => imposta(d, { s: b.dataset.tutti, n: '' }));
    disegna();
  }));

  $('copia-prec').addEventListener('click', () => {
    const prima = DO.settimana(DO.aggiungi(lun, -7));
    if (!prima.some((d) => valore(d).s)) { DO.avviso('La settimana precedente è vuota.'); return; }
    DO.settimana(lun).forEach((d, i) => imposta(d, valore(prima[i])));
    disegna();
    DO.avviso('Copiata la settimana precedente: controlla e invia.');
  });

  $('sett-prec').addEventListener('click', () => { lun = DO.aggiungi(lun, -7); disegna(); });
  $('sett-succ').addEventListener('click', () => { lun = DO.aggiungi(lun, 7); disegna(); });
  $('sett-oggi').addEventListener('click', () => { lun = DO.lunedi(oggi); disegna(); });

  $('annulla-bozza').addEventListener('click', () => {
    if (!confirm('Annullare le modifiche non inviate?')) return;
    bozza = {};
    salvaBozza();
    disegna();
  });

  // Si inviano le modifiche di tutte le settimane più i giorni della settimana in vista:
  // così premere Invia vale anche come conferma, quando non c'è nulla da cambiare.
  $('btn-invia').addEventListener('click', async () => {
    if (riallineaOggi()) { disegna(); DO.avviso('È cambiato il giorno: le modifiche sui giorni ormai bloccati sono state tolte.', 'errore', 8000); }
    const giorni = {};
    DO.settimana(lun).filter(modificabile).forEach((d) => { giorni[d] = valore(d); });
    Object.keys(bozza).forEach((d) => { if (modificabile(d)) giorni[d] = bozza[d]; });
    // contate qui: se Google perde la prima risposta e l'invio viene ripetuto, il server vede zero differenze
    const cambiati = Object.keys(bozza).filter(modificabile).length;
    invio = true;
    disegnaBarra();
    try {
      const r = await DO.dati.inviaDisponibilita(giorni);
      Object.keys(giorni).forEach((d) => { salvati[d] = { s: giorni[d].s, n: giorni[d].n }; });
      bozza = {};
      salvaBozza();
      operatore.ultimoInvio = r.inviatoIl;
      salvaCopia();
      const n = Math.max(r.modifiche, cambiati);
      $('conferma-testo').textContent = (n ? n + (n === 1 ? ' giorno aggiornato. ' : ' giorni aggiornati. ') : 'Nessuna modifica: hai confermato le disponibilità. ')
        + 'I supervisori hanno ricevuto la notifica.';
      $('conferma').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      DO.avviso(err.message, 'errore');
    } finally {
      invio = false;
      disegna();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (operatore && nModifiche()) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- avvio ----------
  function salvaCopia() {
    DO.salvaCopia({ operatore, giorni: salvati, richieste, convocazioni, operativo, onsite, richiesteEvento, oggi, limite });
  }

  function applica(r) {
    oggi = r.oggi;
    limite = r.limite;
    operatore = r.operatore;
    salvati = r.giorni || {};
    richieste = r.richieste || [];
    if (r.convocazioni) convocazioni = r.convocazioni;
    if (r.operativo) operativo = Object.assign({}, DO.OPERATIVO_PREDEFINITO, r.operativo);
    if (r.onsite) onsite = r.onsite;
    if (r.richiesteEvento) richiesteEvento = r.richiesteEvento;
    aggiornaOnsite();
    // la bozza salvata sul dispositivo perde i giorni passati, quelli ormai bloccati e quelli uguali all'inviato
    bozza = DO.leggi(chiaveBozza()) || {};
    let scartati = 0;
    Object.keys(bozza).forEach((d) => {
      if ((bloccatoOra(d) || giorniOn[d]) && !uguali(bozza[d], salvati[d] || vuoto)) scartati++;
      if (!modificabile(d) || uguali(bozza[d], salvati[d] || vuoto)) delete bozza[d];
    });
    salvaBozza();
    if (scartati) DO.avviso('Alcune modifiche non inviate riguardavano giorni ormai bloccati e sono state scartate.', 'errore', 8000);
    $('saluto').textContent = 'Ciao ' + operatore.nome.split(' ')[0];
    $('utente').innerHTML = '<b>' + DO.esc(operatore.nome) + '</b>' + (operatore.mansione ? ' · ' + DO.esc(operatore.mansione) : '');
    $('utente').hidden = false;
    $('btn-esci').hidden = false;
    $('barra-invio').hidden = false;
    disegna();
  }

  // Con una richiesta da compilare si apre direttamente il periodo richiesto, altrimenti la settimana corrente.
  function settimanaIniziale() {
    const daFare = richieste.map(giorniDi).flat().find((d) => !valore(d).s);
    return DO.lunedi(daFare || oggi);
  }

  // Si mostra subito l'ultima versione salvata sul dispositivo, poi si aggiorna con quella del server.
  async function carica(idOperatore) {
    $('pagina').hidden = false;
    const copia = DO.leggiCopia();
    const giaVisibile = !!(copia && copia.operatore && copia.operatore.id === idOperatore);
    if (giaVisibile) {
      // la copia può essere di ieri: i giorni ormai passati non devono risultare modificabili
      const adesso = DO.iso(new Date());
      applica(Object.assign({}, copia, { oggi: adesso > copia.oggi ? adesso : copia.oggi }));
      lun = settimanaIniziale();
      disegna();
      $('aggiornamento').hidden = false;
    } else {
      $('giorni').innerHTML = '<li class="caricamento"><span></span></li>';
    }
    try {
      const [r, conv, op, ons, rev] = await Promise.all([
        DO.dati.mieDisponibilita(), DO.dati.mieConvocazioni().catch(() => null),
        DO.dati.leggiOperativo().catch(() => Object.assign({}, DO.OPERATIVO_PREDEFINITO)),
        DO.dati.mieiOnsite().catch(() => null),
        DO.dati.mieRichiesteEvento().catch(() => null),
      ]);
      if (conv) r.convocazioni = conv;
      if (ons) r.onsite = ons;
      if (rev) r.richiesteEvento = rev;
      r.operativo = op;
      const settimana = lun;
      applica(r);
      lun = giaVisibile ? settimana : settimanaIniziale();
      disegna();
      salvaCopia();
    } catch (e) {
      if (!giaVisibile) $('giorni').innerHTML = '<li class="griglia-vuota">' + DO.esc(e.message) + '</li>';
      else if (operatore) DO.avviso('Non riesco ad aggiornare i dati: ' + e.message, 'errore');
    } finally {
      $('aggiornamento').hidden = true;
    }
  }

  const accedi = (codice) => DO.dati.accediOperatore(codice, $('accesso-ricorda').checked);

  async function entra() {
    $('pagina').hidden = true;
    $('barra-invio').hidden = true;
    $('accesso-demo').hidden = !DO.inDemo;
    let op = null;
    try {
      const u = await DO.dati.utente();
      op = u && u.operatore;
    } catch (e) {
      $('pagina').hidden = false;
      $('giorni').innerHTML = '<li class="griglia-vuota">Non riesco a collegarmi: ' + DO.esc(e.message) + '<br>Controlla la connessione e ricarica la pagina.</li>';
      return;
    }
    // link d'invito: index.html#codice=XXXX-XXXX entra direttamente
    const dalLink = new URLSearchParams(location.hash.slice(1)).get('codice');
    if (dalLink) {
      history.replaceState(null, '', location.pathname + location.search);
      try { op = await accedi(dalLink); } catch (e) { DO.avviso(e.message, 'errore'); }
    }
    if (!op) op = await DO.chiediAccesso(() => accedi($('accesso-codice').value));
    await carica(op.id);
  }

  async function esci() {
    if (nModifiche() && !confirm('Hai modifiche non inviate: restano salvate su questo dispositivo. Uscire comunque?')) return;
    await DO.dati.esci();
    DO.dimentica();
    operatore = null;
    location.reload();
  }
  $('btn-esci').addEventListener('click', esci);

  DO.avviaPagina('operatore', (messaggio) => {
    DO.avviso(messaggio, 'errore');
    operatore = null;
    entra();
  });
  DO.mostraDemo();
  entra();
})(window.DO);
