/* Disponibilità Ops — pagina degli operatori: compilazione settimanale e invio ai supervisori. */
(function (DO) {
  'use strict';

  const $ = DO.$;
  const SETTIMANE_INDIETRO = 4;   // settimane passate consultabili (sola lettura)

  let operatore = null;
  let salvati = {};               // ultima versione inviata, data → { s, n }
  let bozza = {};                 // modifiche non ancora inviate, data → { s, n }
  let oggi = DO.iso(new Date()), limite = DO.aggiungi(oggi, 83);
  let lun = DO.lunedi(oggi);
  let invio = false;

  const chiaveBozza = () => 'do-bozza-' + operatore.id;
  const vuoto = { s: '', n: '' };
  const valore = (d) => bozza[d] || salvati[d] || vuoto;
  const uguali = (a, b) => (a.s || '') === (b.s || '') && (a.n || '') === (b.n || '');
  const modificabile = (d) => d >= oggi && d <= limite;
  const nModifiche = () => Object.keys(bozza).length;

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
      return '<li class="giorno' + (bozza[d] ? ' modificato' : '') + (attivo ? '' : ' passato') + '" data-data="' + d + '">'
        + '<div class="giorno-data"><b>' + g.nome + '</b><small>' + g.num + ' ' + g.mese + '</small>'
        + (d === oggi ? '<span class="oggi">Oggi</span>' : '') + '</div>'
        + '<div class="giorno-scelte"><div class="stati" role="radiogroup" aria-label="Disponibilità di ' + g.nome + ' ' + g.num + '">' + stati + '</div>'
        + '<input type="text" class="nota-giorno" maxlength="200" placeholder="' + (v.s === 'P' ? 'Orari (es. solo dalle 18:00)' : 'Nota facoltativa') + '" value="' + DO.esc(v.n) + '"'
        + (attivo ? '' : ' disabled') + ' aria-label="Nota per ' + g.nome + ' ' + g.num + '"></div></li>';
    }).join('');
    disegnaBarra();
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
    const b = e.target.closest('[data-stato]');
    if (!b) return;
    const d = b.closest('.giorno').dataset.data, v = valore(d);
    imposta(d, { s: v.s === b.dataset.stato ? '' : b.dataset.stato, n: v.n });
    $('conferma').hidden = true;
    disegna();
  });

  $('giorni').addEventListener('input', (e) => {
    if (!e.target.classList.contains('nota-giorno')) return;
    const li = e.target.closest('.giorno'), d = li.dataset.data;
    imposta(d, { s: valore(d).s, n: e.target.value });
    li.classList.toggle('modificato', !!bozza[d]);
    disegnaBarra();
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
      const r = await DO.chiama('inviaDisponibilita', { giorni });
      Object.keys(giorni).forEach((d) => { salvati[d] = { s: giorni[d].s, n: giorni[d].n }; });
      bozza = {};
      salvaBozza();
      operatore.ultimoInvio = r.inviatoIl;
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
  async function carica() {
    $('pagina').hidden = false;
    $('giorni').innerHTML = '<li class="caricamento"><span></span></li>';
    const r = await DO.chiama('mieDisponibilita', { da: DO.aggiungi(DO.lunedi(oggi), -7 * (SETTIMANE_INDIETRO + 1)), a: DO.aggiungi(oggi, 7 * 26) });
    oggi = r.oggi;
    limite = r.limite;
    lun = DO.lunedi(oggi);
    operatore = r.operatore;
    salvati = r.giorni || {};
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

  async function accedi(codice) {
    const ricorda = $('accesso-ricorda').checked;
    const r = await DO.chiama('accedi', { ruolo: 'operatore', codice });
    DO.salvaSessione({ token: r.token, operatore: r.operatore }, ricorda);
    return r;
  }

  async function entra() {
    $('pagina').hidden = true;
    $('barra-invio').hidden = true;
    $('accesso-demo').hidden = !DO.inDemo;
    // link d'invito: index.html#codice=XXXX-XXXX entra direttamente
    const dalLink = new URLSearchParams(location.hash.slice(1)).get('codice');
    if (dalLink) {
      history.replaceState(null, '', location.pathname + location.search);
      try { await accedi(dalLink); } catch (e) { DO.avviso(e.message, 'errore'); }
    }
    if (!DO.sessione()) await DO.chiediAccesso(() => accedi($('accesso-codice').value));
    try {
      await carica();
    } catch (e) {
      $('giorni').innerHTML = '<li class="griglia-vuota">' + DO.esc(e.message) + '</li>';
    }
  }

  function esci() {
    if (nModifiche() && !confirm('Hai modifiche non inviate: restano salvate su questo dispositivo. Uscire comunque?')) return;
    DO.chiudiSessione();
    operatore = null;
    location.reload();
  }
  $('btn-esci').addEventListener('click', esci);

  DO.avviaSessione('operatore', (messaggio) => {
    DO.avviso(messaggio, 'errore');
    operatore = null;
    entra();
  });
  DO.mostraDemo();
  entra();
})(window.DO);
