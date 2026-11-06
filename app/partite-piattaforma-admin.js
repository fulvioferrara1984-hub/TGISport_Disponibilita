/* Disponibilità Ops — partite remote dalla piattaforma, lato dashboard: esegue il giro (app/partite-piattaforma.js) con le scritture
 * in transazione e disegna il riquadro «Partite remote dalla piattaforma» per i casi dubbi. Letture una tantum, mai in ascolto.
 * DO.admin, DO.dati e DO.avviso si leggono al momento della chiamata. */
(function (DO) {
  'use strict';

  // ciò che il riquadro mostra: l'esito dell'ultimo giro riuscito (resta com'era se un giro non parte)
  let dubbi = [], sconosciute = [], daRivedere = [], competizioni = [];

  const elemento = () => (typeof document === 'undefined' ? null : document.getElementById('remote-piattaforma'));
  const giornoBreve = (d) => { const g = DO.giorno(d); return g.breve.toLowerCase() + ' ' + String(d).slice(8, 10) + '/' + String(d).slice(5, 7); };

  // Esegue le azioni del giro una dopo l'altra. progettiFinestra: eventi della piattaforma letti per la finestra (mai null).
  // Restituisce i campi scritti davvero ({ id: campi }): chi calcola subito dopo (Invia convocazioni) li sovrappone ad A.eventi,
  // perché la transazione finisce prima che l'ascolto delle partite porti la modifica.
  async function esegui(progettiFinestra) {
    const A = DO.admin, P = DO.partitePiattaforma, D = DO.dati;
    const scritte = {};
    if (!Array.isArray(progettiFinestra)) return scritte;
    // competizioni non lette (null): senza i nomi il giro potrebbe dare «sconosciuta» a competizioni che non lo sono, quindi non parte
    const comp = await Promise.resolve().then(() => D.leggiCompetizioniPiattaforma()).catch(() => null);
    if (comp === null || comp === undefined) return scritte;
    const oggi = DO.oggi(), ora = new Date().toTimeString().slice(0, 5);
    // partite collegate il cui evento non è nella finestra (spostato più avanti, eliminato): si rileggono per ID; un ID assente non è stato letto
    const ids = P.daRileggere(A.eventi, progettiFinestra, oggi);
    const letti = ids.length ? await Promise.resolve().then(() => D.leggiProgetti(ids)).catch(() => ({})) : {};
    const az = P.giro({ progetti: progettiFinestra, letti: letti || {}, partite: A.eventi, competizioniPiattaforma: comp, regole: A.regole, oggi, ora });
    competizioni = comp;
    dubbi = az.dubbi; sconosciute = az.sconosciute; daRivedere = az.daRivedere;

    const n = { create: 0, collegate: 0, aggiornate: 0, rimandate: 0, annullate: 0, ripristinate: 0, nonRiuscite: 0 };
    // Il collega in sola visualizzazione e la copia locale (non ancora dal server) non scrivono mai: nemmeno con azioni calcolate.
    if (P.puoScrivere(A)) {
      // una risposta false della transazione (la partita è cambiata) non conta e non è un errore; un errore vero conta e si prosegue
      const passo = async (chiave, scrivi) => {
        try { if (await scrivi()) [].concat(typeof chiave === 'function' ? chiave() : chiave).forEach((k) => { n[k]++; }); } catch (err) { n.nonRiuscite++; console.warn('Partita dalla piattaforma non scritta:', err && err.message); }
      };
      for (const x of az.crea) await passo('create', () => D.creaPartitaPiattaforma(x.evento.id, x.campi, P.NOTE.creata(x.evento.codice)));
      const aggiorna = async (x, campi) => { const ok = await D.aggiornaDallaPiattaforma(x.partita.id, P.atteso(x.partita), campi, x.nota); if (ok) scritte[x.partita.id] = campi; return ok; };
      for (const x of az.collega) await passo(() => (x.rimanda ? ['collegate', 'rimandate'] : 'collegate'), () => aggiorna(x, x.campi));
      for (const x of az.allinea) await passo(() => (x.rimanda ? 'rimandate' : 'aggiornate'), () => aggiorna(x, x.campi));
      for (const x of az.annulla) await passo('annullate', () => aggiorna(x, { stato: 'annullato' }));
      for (const x of az.ripristina) await passo('ripristinate', () => aggiorna(x, x.campi));
    }
    const testo = P.testoAvviso(n);
    if (testo) DO.avviso(testo, 'ok', 8000);
    disegna();
    return scritte;
  }

  // ---------- riquadro ----------
  function disegna() {
    const box = elemento();
    if (!box) return;
    const A = DO.admin, P = DO.partitePiattaforma, R = DO.regole;
    const esc = DO.esc;
    const riga = (testo, etichetta, extra, tasti) => '<li>' + testo + ' <span class="tag-piattaforma">' + esc(etichetta) + '</span>' + (extra || '') + (tasti || '') + '</li>';
    const tasto = (azione, id, testo, solo) => '<button type="button" class="bottone' + (solo ? ' solo-modifica' : '') + '" data-azione="' + azione + '" data-id="' + esc(id) + '">' + esc(testo) + '</button>';
    const ko = (e) => { const m = R.minuti(e.ko); return m === null ? '' : ' · ' + R.hhmm(m); };
    const righe = [];
    dubbi.forEach((x) => {
      const e = x.evento;
      const nome = P.nomeCompetizione(e, competizioni, A.regole);
      righe.push({ data: e.data, html: riga('<b>' + giornoBreve(e.data) + '</b> ' + esc(P.titoloPiattaforma(e) + ko(e)), 'da collegare', '',
        x.candidate.map((c) => tasto('collega', e.id + '|' + c.id, 'Collega a «' + (c.titolo || 'partita') + '»', true)).join('')
        + (nome ? tasto('crea', e.id, 'Crea nuova', true) : '')) });
    });
    sconosciute.forEach((x) => {
      const e = x.evento;
      righe.push({ data: e.data, html: riga('<b>' + giornoBreve(e.data) + '</b> ' + esc(String(e.competizione || '').trim() + ' · ' + P.titoloPiattaforma(e)), 'competizione sconosciuta',
        '<span class="tenue">: aggiungila nelle Impostazioni di Disponibilità o scrivi il nome in Settings → Competitions della piattaforma</span>') });
    });
    daRivedere.forEach((x) => {
      const p = x.partita;
      const op = (A.operatori.find((o) => o.id === p.operatoreId) || {}).nome || 'operatore rimosso';
      righe.push({ data: p.data, html: riga('<b>' + giornoBreve(p.data) + '</b> ' + esc((p.titolo || 'Partita') + ' · ' + op), 'da rivedere: ' + x.motivo, '',
        tasto('apri', p.id, 'Apri evento', false) + tasto('scollega', p.id, 'Scollega', true)) });
    });
    righe.sort((a, b) => String(a.data).localeCompare(String(b.data)));
    box.hidden = !righe.length;
    if (!righe.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="scheda-testa"><h2>Partite remote dalla piattaforma</h2></div><ul class="righe-piattaforma">' + righe.map((r) => r.html).join('') + '</ul>';
  }

  // Dopo un aggiornamento delle partite (nessuna lettura nuova): toglie dal riquadro le righe che non servono più.
  // «da rivedere»: la partita ora è annullata o senza progettoId; dubbio: una partita è ora collegata all'evento, oppure non resta
  // nessuna candidata ancora libera. Una partita non più tra quelle caricate resta com'era (decide il prossimo giro).
  function filtra() {
    const eventi = (DO.admin && DO.admin.eventi) || [];
    const per = new Map(eventi.map((p) => [p.id, p]));
    daRivedere = daRivedere.filter((x) => { const p = per.get(x.partita.id); return !p || (!!p.progettoId && p.stato !== 'annullato'); });
    dubbi = dubbi.filter((x) => !eventi.some((p) => p.progettoId === x.evento.id)).map((x) => {
      const libere = x.candidate.filter((c) => { const p = per.get(c.id); return !!p && !p.progettoId && p.stato !== 'annullato'; });
      return libere.length === x.candidate.length ? x : Object.assign({}, x, { candidate: libere });
    }).filter((x) => x.candidate.length);
  }

  // ---------- pulsanti del riquadro ----------
  async function clic(bottone) {
    const A = DO.admin, P = DO.partitePiattaforma, D = DO.dati;
    const azione = bottone.dataset.azione, id = bottone.dataset.id || '';
    if (azione === 'apri') {
      const p = A.eventi.find((x) => x.id === id) || (daRivedere.find((x) => x.partita.id === id) || {}).partita;
      if (p && DO.convocazioni) DO.convocazioni.apriEvento(p);
      return;
    }
    if (!P.puoScrivere(A)) return;
    let scrivi = null, togli = null;
    if (azione === 'collega') {
      const [idEv, idPa] = id.split('|');
      const d = dubbi.find((x) => x.evento.id === idEv), c = d && d.candidate.find((p) => p.id === idPa);
      if (!c) return;
      const col = P.collegamento(c, d.evento, A.regole, DO.oggi());
      scrivi = () => D.aggiornaDallaPiattaforma(c.id, P.atteso(c), col.campi, col.nota);
      togli = () => { dubbi = dubbi.filter((x) => x !== d); };
    } else if (azione === 'crea') {
      const d = dubbi.find((x) => x.evento.id === id), nome = d && P.nomeCompetizione(d.evento, competizioni, A.regole);
      if (!d || !nome) return;
      scrivi = () => D.creaPartitaPiattaforma(d.evento.id, P.partitaDa(d.evento, nome, A.regole), P.NOTE.creata(d.evento.codice));
      togli = () => { dubbi = dubbi.filter((x) => x !== d); };
    } else if (azione === 'scollega') {
      const r = daRivedere.find((x) => x.partita.id === id);
      if (!r) return;
      scrivi = () => D.aggiornaDallaPiattaforma(r.partita.id, P.atteso(r.partita), { progettoId: '' }, P.NOTE.scollegata);
      togli = () => { daRivedere = daRivedere.filter((x) => x !== r); };
    } else return;
    bottone.disabled = true;
    try {
      if (await scrivi()) { togli(); disegna(); return; }
      // la transazione ha trovato la partita cambiata: la riga resta, il prossimo giro la ricalcola
      DO.avviso('La partita è cambiata nel frattempo: non è stato modificato nulla. Ricontrolla.', 'errore', 8000);
    } catch (err) {
      DO.avviso(err && err.message ? err.message : 'Scrittura non riuscita.', 'errore');
    }
    bottone.disabled = false;
  }

  const box = elemento();
  if (box) box.addEventListener('click', (ev) => { const b = ev.target.closest('[data-azione]'); if (b) clic(b); });

  // a ogni aggiornamento delle partite (stesso aggancio degli altri moduli della dashboard)
  if (DO.admin && DO.admin.registra) DO.admin.registra({ aggiorna: () => { filtra(); disegna(); } });

  DO.partiteAdmin = { esegui, disegna, filtra, stato: () => ({ dubbi, sconosciute, daRivedere }) };
})(window.DO);
