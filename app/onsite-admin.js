/* Disponibilità Ops — on-site nella dashboard: richiesta di deployment («+ On-site») e scheda del deployment
 * con le risposte, le modifiche, la chiusura e l'annullamento. I calcoli stanno in app/onsite.js. */
(function (DO) {
  'use strict';

  const $ = DO.$, A = DO.admin, O = DO.onsite;
  const ALTRO = 'Altro';
  const STATO_DEP = { aperta: 'richiesta aperta', chiusa: 'richiesta chiusa', annullata: 'annullato' };
  let tolti = new Set();          // giorni tolti a mano dall'intervallo scelto
  let compensoAMano = false;      // il supervisore ha scritto un compenso diverso da quello proposto
  let aperto = null;              // deployment mostrato nella scheda

  const nomeOp = (id) => (A.operatori.find((o) => o.id === id) || {}).nome || 'operatore rimosso';
  const abilitati = () => A.operatori.filter((o) => o.attivo && (o.onsite === 'TL' || o.onsite === 'OP'))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  const giornoBreve = (d) => { const g = DO.giorno(d); return g.breve + ' ' + g.num + ' ' + g.meseBreve; };
  const spuntati = (lista) => [...lista.querySelectorAll('input:checked')].map((x) => x.value);
  const contatti = (ids) => A.operatori.filter((o) => ids.includes(o.id)).map((o) => ({ id: o.id, nome: o.nome, email: o.email, ruolo: o.onsite }));
  const corrente = () => A.onsite.find((x) => x.id === aperto);

  // ---------- richiesta ----------
  function dateScelte() {
    const da = $('ons-da').value, a = $('ons-a').value;
    return da && a && a >= da ? O.giorniDa(da, a).slice(0, 31).filter((d) => !tolti.has(d)) : [];
  }

  function righeAttuali() {
    const m = {};
    $('ons-giorni').querySelectorAll('li[data-data]').forEach((li) => {
      const scelta = li.querySelector('[data-attivita]').value;
      m[li.dataset.data] = {
        attivita: scelta === ALTRO ? li.querySelector('[data-altro]').value : scelta, altro: scelta === ALTRO,
        partita: scelta === 'MD' ? li.querySelector('[data-partita]').value : '',
      };
    });
    return m;
  }

  // le proposte per trasferte lunghe (MD-2, MD-3…) entrano nel menu accanto alle attività fisse
  const opzioni = (scelta) => (O.ATTIVITA.includes(scelta) || scelta === ALTRO ? O.ATTIVITA : O.ATTIVITA.concat(scelta)).concat(ALTRO);

  // proponi = true dopo un cambio di date: attività ricalcolate; altrimenti resta quanto scritto
  function disegnaGiorni(proponi) {
    const prima = righeAttuali(), giorni = dateScelte(), proposte = O.attivitaProposte(giorni.length);
    $('ons-giorni').innerHTML = giorni.map((d, i) => {
      const v = !proponi && prima[d] ? prima[d] : { attivita: proposte[i], altro: false, partita: (prima[d] || {}).partita || '' };
      const scelta = v.altro ? ALTRO : v.attivita;
      return '<li data-data="' + d + '"><b>' + giornoBreve(d) + '</b>'
        + '<select data-attivita aria-label="Attività del ' + giornoBreve(d) + '">'
        + opzioni(scelta).map((x) => '<option' + (x === scelta ? ' selected' : '') + '>' + DO.esc(x) + '</option>').join('') + '</select>'
        + '<span class="onsite-extra"><input type="text" data-altro maxlength="30" placeholder="Attività" value="' + DO.esc(v.altro ? v.attivita : '') + '"' + (v.altro ? '' : ' hidden') + '>'
        + '<input type="text" data-partita maxlength="80" placeholder="Partita (facoltativa)" value="' + DO.esc(v.partita) + '"' + (scelta === 'MD' ? '' : ' hidden') + '></span>'
        + '<button type="button" class="icona" data-togli-giorno="' + d + '" aria-label="Togli il ' + giornoBreve(d) + '">✕</button></li>';
    }).join('') || '<li class="nota">Scegli il primo e l\'ultimo giorno.</li>';
    aggiornaCompenso();
    disegnaDestinatari(false);
  }

  function aggiornaCompenso() {
    const n = dateScelte().length, tariffa = A.regole.tariffaOnsite, proposto = O.compensoProposto(n, tariffa);
    if (!compensoAMano) $('ons-compenso').value = n ? proposto : '';
    $('ons-compenso-nota').textContent = n ? n + (n === 1 ? ' giorno' : ' giorni') + ' × ' + DO.regole.euro(tariffa) + ' = ' + DO.regole.euro(proposto)
      + (compensoAMano ? ' (proposto; hai scritto un importo diverso)' : '') : '';
  }

  function disegnaDestinatari(preseleziona) {
    const posti = { TL: Number($('ons-tl').value) || 0, OP: Number($('ons-op').value) || 0 };
    const gia = new Set(spuntati($('ons-destinatari')));
    const giorni = dateScelte().map((data) => ({ data }));
    const ops = abilitati();
    $('ons-destinatari').innerHTML = ops.length ? ops.map((o) => {
      // chi ha un ruolo senza posti non vedrebbe la richiesta: non si può scegliere
      const conPosto = posti[o.onsite] > 0, si = conPosto && (preseleziona || gia.has(o.id));
      const remoti = O.conflittiRemoti({ giorni }, A.eventi.filter((e) => e.operatoreId === o.id), ['assegnato', 'convocato', 'confermato']);
      const onsite = O.conflittiOnsite({ id: null, giorni }, A.onsite, o.id);
      return '<li><label><input type="checkbox" value="' + o.id + '"' + (si ? ' checked' : '') + (conPosto ? '' : ' disabled') + '><span class="chi"><b>' + DO.esc(o.nome) + '</b>'
        + '<small>on-site ' + o.onsite + (conPosto ? '' : ' · nessun posto on-site ' + o.onsite + ' in questa richiesta') + (o.email ? '' : ' · senza email') + '</small>'
        + (remoti.length ? '<em>convocazioni remote in quei giorni: ' + remoti.map(giornoBreve).join(', ') + '</em>' : '')
        + (onsite.length ? '<em>già on-site in quei giorni: ' + onsite.map(giornoBreve).join(', ') + '</em>' : '') + '</span></label></li>';
    }).join('') : '<li class="nota">Nessun operatore abilitato: imposta «On-site» nella scheda di ciascun operatore.</li>';
    aggiornaBottone();
  }

  function aggiornaBottone() {
    const n = spuntati($('ons-destinatari')).length;
    $('ons-invia').disabled = !n;
    $('ons-invia').textContent = n ? 'Invia la richiesta a ' + n + (n === 1 ? ' operatore' : ' operatori') : 'Scegli gli operatori';
  }

  function apriRichiesta() {
    $('form-onsite').reset();
    tolti = new Set();
    compensoAMano = false;
    const domani = DO.aggiungi(DO.oggi(), 1);
    $('ons-da').min = $('ons-a').min = domani;
    $('ons-da').value = domani;
    $('ons-a').value = DO.aggiungi(domani, 3);
    $('ons-tl').value = 1;
    $('ons-op').value = 1;
    $('ons-sport-elenco').innerHTML = (A.regole.sport || []).map((s) => '<option value="' + DO.esc(s) + '">').join('');
    $('ons-errore').hidden = true;
    $('ons-giorni').innerHTML = '';
    $('ons-destinatari').innerHTML = '';
    disegnaGiorni(true);
    disegnaDestinatari(true);
    $('dlg-onsite').showModal();
  }

  // email in sottofondo: l'esito arriva dopo, nell'avviso e nella finestra se è ancora aperta
  function seguiEmail(inviate, prima) {
    inviate.then((x) => {
      const testo = x.email ? 'Email inviata a ' + x.email + (x.email === 1 ? ' operatore.' : ' operatori.') : 'Nessuna email inviata.';
      const avvisi = x.nonInviate && x.nonInviate.length ? ' Non partita per: ' + x.nonInviate.join(', ') + '.' : '';
      const p = $('esito-testo').querySelector('p:nth-child(2)');
      if (p && $('dlg-esito').open) p.textContent = testo + avvisi;
      DO.avviso(testo + avvisi, avvisi ? 'errore' : 'ok', 6000);
    }).catch((e) => DO.avviso(prima + ', ma le email non sono partite: ' + e.message, 'errore', 8000));
  }

  $('ev-onsite').addEventListener('click', apriRichiesta);
  $('ons-da').addEventListener('change', () => {
    if (!$('ons-a').value || $('ons-a').value < $('ons-da').value) $('ons-a').value = $('ons-da').value;
    tolti = new Set();
    disegnaGiorni(true);
  });
  $('ons-a').addEventListener('change', () => { tolti = new Set(); disegnaGiorni(true); });
  $('ons-giorni').addEventListener('click', (e) => {
    const b = e.target.closest('[data-togli-giorno]');
    if (!b) return;
    tolti.add(b.dataset.togliGiorno);
    disegnaGiorni(false);
  });
  $('ons-giorni').addEventListener('change', (e) => {
    if (!e.target.matches('[data-attivita]')) return;
    const li = e.target.closest('li');
    li.querySelector('[data-altro]').hidden = e.target.value !== ALTRO;
    li.querySelector('[data-partita]').hidden = e.target.value !== 'MD';
  });
  $('ons-compenso').addEventListener('input', () => { compensoAMano = $('ons-compenso').value !== ''; aggiornaCompenso(); });
  ['ons-tl', 'ons-op'].forEach((id) => $(id).addEventListener('input', () => disegnaDestinatari(true)));
  $('ons-destinatari').addEventListener('change', aggiornaBottone);

  $('form-onsite').addEventListener('submit', async (e) => {
    e.preventDefault();
    const righe = righeAttuali();
    const giorni = dateScelte().map((data) => ({ data, attivita: (righe[data] || {}).attivita || '', partita: (righe[data] || {}).partita || '' }));
    const destinatari = spuntati($('ons-destinatari')), email = $('ons-email').checked;
    const luogo = $('ons-luogo').value.trim(), sport = $('ons-sport').value.trim();
    $('ons-invia').disabled = true;
    $('ons-invia').textContent = 'Invio in corso…';
    $('ons-errore').hidden = true;
    try {
      const r = await DO.dati.creaOnsite(
        { titolo: $('ons-titolo').value, luogo, sport, note: $('ons-note').value, giorni, posti: { TL: $('ons-tl').value, OP: $('ons-op').value }, destinatari },
        { compenso: $('ons-compenso').value, email, contatti: contatti(destinatari), urlSito: A.linkSito() },
      );
      $('dlg-onsite').close();
      const righeEsito = ['La richiesta compare già sulla pagina di ciascun operatore scelto.'];
      if (email) righeEsito.push('Email in partenza…');
      if (r.senzaEmail.length) righeEsito.push('Senza email registrata: ' + r.senzaEmail.join(', ') + '.');
      $('esito-testo').innerHTML = righeEsito.map((x) => '<p>' + DO.esc(x) + '</p>').join('');
      $('esito-whatsapp').onclick = () => DO.copia('Ciao! Richiesta di deployment on-site a ' + luogo + ' (' + O.periodoBreve(giorni[0].data, giorni[giorni.length - 1].data)
        + ', ' + sport + ').\nRispondi qui: ' + A.linkSito(), 'Messaggio copiato: incollalo su WhatsApp.');
      $('dlg-esito').showModal();
      if (email) seguiEmail(r.inviate, 'Richiesta salvata');
    } catch (err) {
      $('ons-errore').textContent = err.message;
      $('ons-errore').hidden = false;
      aggiornaBottone();
    }
  });

  // ---------- scheda del deployment ----------
  function rispostaDi(d, id) {
    const ruolo = O.ruoloAccettato(d, id);
    if (ruolo) return { testo: 'Ha accettato · on-site ' + ruolo, cls: 'st-D', togli: d.stato !== 'annullata', ordine: ruolo === 'TL' ? 0 : 1 };
    if ((d.esclusi || []).includes(id)) return { testo: 'Fuori dal deployment', cls: 'st-annullato', ordine: 4 };
    if ((d.rifiuti || []).includes(id)) return { testo: 'Non può', cls: 'st-A', ordine: 3 };
    return { testo: 'Nessuna risposta', cls: 'st-vuoto', ordine: 2 };
  }

  function disegnaScheda() {
    const d = corrente();
    if (!d) { if ($('dlg-onsite-scheda').open) $('dlg-onsite-scheda').close(); return; }
    const compenso = A.compensiOnsite[d.id];
    $('onss-titolo').textContent = 'On-site · ' + d.luogo + (d.titolo ? ' · ' + d.titolo : '');
    $('onss-sotto').innerHTML = DO.esc(d.sport) + ' · ' + O.periodoBreve(d.da, d.a) + ' · <b>' + O.etichettaPosti(d) + '</b> · ' + STATO_DEP[d.stato]
      + (compenso !== undefined ? ' · compenso ' + DO.regole.euro(compenso) + ' a persona' : '') + (d.note ? '<br>' + DO.esc(d.note) : '');
    $('onss-giorni').innerHTML = (d.giorni || []).map((g) => '<li><b>' + giornoBreve(g.data) + '</b> · ' + DO.esc(g.attivita) + (g.partita ? ' · ' + DO.esc(g.partita) : '') + '</li>').join('');
    const persone = (d.destinatari || []).map((id) => Object.assign({ id, nome: nomeOp(id) }, rispostaDi(d, id)))
      .sort((x, y) => x.ordine - y.ordine || x.nome.localeCompare(y.nome, 'it'));
    $('onss-persone').innerHTML = persone.map((p) => '<li class="persona"><span class="chi"><b>' + DO.esc(p.nome) + '</b></span>'
      + '<span class="stato-chip ' + p.cls + '">' + p.testo + '</span>'
      + (p.togli ? '<button type="button" class="link testo-errore" data-togli="' + p.id + '">Togli</button>' : '') + '</li>').join('');
    const annullata = d.stato === 'annullata';
    $('onss-stato').hidden = $('onss-annulla').hidden = $('onss-modifica-apri').hidden = annullata;
    $('onss-stato').textContent = d.stato === 'chiusa' ? 'Riapri' : 'Chiudi richiesta';
    if (annullata) $('onss-modifica').hidden = true;
  }

  function apri(id) {
    aperto = id;
    $('onss-modifica').hidden = true;
    $('onss-errore').hidden = true;
    disegnaScheda();
    $('dlg-onsite-scheda').showModal();
  }

  async function azione(lavoro, fatto) {
    $('onss-errore').hidden = true;
    try {
      await lavoro();
      if (fatto) DO.avviso(fatto, 'ok');
    } catch (err) {
      $('onss-errore').textContent = err.message;
      $('onss-errore').hidden = false;
    }
  }

  $('onss-persone').addEventListener('click', (e) => {
    const b = e.target.closest('[data-togli]');
    if (!b) return;
    const nome = nomeOp(b.dataset.togli);
    if (!confirm('Togliere ' + nome + ' dal deployment? Il posto torna libero e non potrà più accettarlo.')) return;
    azione(() => DO.dati.togliOnsite(aperto, b.dataset.togli), nome + ': posto liberato.');
  });
  $('onss-stato').addEventListener('click', () => {
    const nuovo = corrente().stato === 'chiusa' ? 'aperta' : 'chiusa';
    azione(() => DO.dati.statoOnsite(aperto, nuovo), nuovo === 'chiusa' ? 'Richiesta chiusa: niente nuove accettazioni.' : 'Richiesta riaperta.');
  });
  $('onss-annulla').addEventListener('click', () => {
    if (!confirm('Annullare il deployment? È definitivo: chi ha accettato lo vedrà annullato e i giorni tornano liberi.')) return;
    azione(() => DO.dati.statoOnsite(aperto, 'annullata'), 'Deployment annullato.');
  });

  $('onss-modifica-apri').addEventListener('click', () => {
    const d = corrente();
    if (!d) return;
    $('onsm-luogo').value = d.luogo;
    $('onsm-sport').value = d.sport;
    $('onsm-titolo').value = d.titolo || '';
    $('onsm-note').value = d.note || '';
    $('onsm-tl').value = d.posti.TL;
    $('onsm-op').value = d.posti.OP;
    $('onsm-compenso').value = A.compensiOnsite[d.id] !== undefined ? A.compensiOnsite[d.id] : '';
    const nuovi = abilitati().filter((o) => !(d.destinatari || []).includes(o.id));
    $('onsm-aggiungi').innerHTML = nuovi.length ? nuovi.map((o) => {
      const conPosto = d.posti[o.onsite] > 0, onsite = O.conflittiOnsite(d, A.onsite, o.id);
      return '<li><label><input type="checkbox" value="' + o.id + '"' + (conPosto ? '' : ' disabled') + '><span class="chi"><b>' + DO.esc(o.nome) + '</b>'
        + '<small>on-site ' + o.onsite + (conPosto ? '' : ' · nessun posto on-site ' + o.onsite) + (o.email ? '' : ' · senza email') + '</small>'
        + (onsite.length ? '<em>già on-site in quei giorni: ' + onsite.map(giornoBreve).join(', ') + '</em>' : '') + '</span></label></li>';
    }).join('')
      : '<li class="nota">Tutti gli operatori abilitati hanno già ricevuto la richiesta.</li>';
    $('onsm-email').checked = true;
    $('onss-modifica').hidden = false;
  });

  $('onsm-salva').addEventListener('click', () => {
    const aggiunti = spuntati($('onsm-aggiungi')), email = $('onsm-email').checked;
    azione(async () => {
      const r = await DO.dati.modificaOnsite(aperto, {
        titolo: $('onsm-titolo').value, luogo: $('onsm-luogo').value, sport: $('onsm-sport').value, note: $('onsm-note').value,
        posti: { TL: $('onsm-tl').value, OP: $('onsm-op').value }, destinatariAggiunti: aggiunti,
      }, { compenso: $('onsm-compenso').value, email, contatti: contatti(aggiunti), urlSito: A.linkSito() });
      $('onss-modifica').hidden = true;
      if (email && aggiunti.length) seguiEmail(r.inviate, 'Deployment aggiornato');
    }, 'Deployment aggiornato.');
  });

  A.registra({ aggiorna: () => { if ($('dlg-onsite-scheda').open) disegnaScheda(); } });
  DO.onsiteAdmin = { apri };
})(window.DO);
