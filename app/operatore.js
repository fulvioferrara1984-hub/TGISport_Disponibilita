/* Disponibilità Ops — pagina degli operatori: compilazione settimanale e invio ai supervisori. */
(function (DO) {
  'use strict';

  const $ = DO.$;
  const SETTIMANE_INDIETRO = 4;   // settimane passate consultabili (sola lettura)

  let operatore = null;
  let salvati = {};               // ultima versione inviata, data → { s, n }
  let bozza = {};                 // modifiche non ancora inviate, data → { s, n }
  let richieste = [];             // richieste aperte dei supervisori: { id, da, a, messaggio }
  let oggi = DO.iso(new Date()), limite = DO.aggiungi(oggi, 83);
  let lun = DO.lunedi(oggi);
  let invio = false;
  const noteAperte = new Set();   // giorni in cui l'operatore ha chiesto di scrivere una nota

  const chiaveBozza = () => 'do-bozza-' + operatore.id;
  const vuoto = { s: '', n: '' };
  const valore = (d) => bozza[d] || salvati[d] || vuoto;
  const uguali = (a, b) => (a.s || '') === (b.s || '') && (a.n || '') === (b.n || '');
  const modificabile = (d) => d >= oggi && d <= limite;
  const nModifiche = () => Object.keys(bozza).length;
  const richiesto = (d) => modificabile(d) && richieste.some((x) => d >= x.da && d <= x.a);

  function giorniDi(x) {
    const out = [];
    for (let d = x.da > oggi ? x.da : oggi; d <= x.a && d <= limite; d = DO.aggiungi(d, 1)) out.push(d);
    return out;
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
        + (d === oggi ? '<span class="oggi">Oggi</span>' : '') + (richiesto(d) ? '<span class="richiesto">Richiesto</span>' : '') + '</div>'
        + '<div class="giorno-scelte"><div class="stati" role="radiogroup" aria-label="Disponibilità di ' + g.nome + ' ' + g.num + '">' + stati + '</div>'
        + nota + '</div></li>';
    }).join('');
    disegnaRichieste();
    disegnaBarra();
  }

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
    DO.salvaCopia({ operatore, giorni: salvati, richieste, oggi, limite });
  }

  function applica(r) {
    oggi = r.oggi;
    limite = r.limite;
    operatore = r.operatore;
    salvati = r.giorni || {};
    richieste = r.richieste || [];
    // la bozza salvata sul dispositivo perde i giorni passati e quelli ormai uguali all'inviato
    bozza = DO.leggi(chiaveBozza()) || {};
    Object.keys(bozza).forEach((d) => { if (!modificabile(d) || uguali(bozza[d], salvati[d] || vuoto)) delete bozza[d]; });
    salvaBozza();
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
      const r = await DO.dati.mieDisponibilita();
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
