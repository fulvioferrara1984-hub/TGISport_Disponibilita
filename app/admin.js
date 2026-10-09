/* Disponibilità Ops — dashboard dei supervisori: griglia settimanale, convocazioni, richieste, aggiornamenti, operatori.
 * I dati arrivano in tempo reale dall'archivio (Firebase o demo): niente ricariche né controlli periodici. */
(function (DO) {
  'use strict';

  const $ = DO.$;
  const SIMBOLI = { D: '✓', P: '½', A: '✕' };

  let oggi = DO.oggi(), limite = DO.limite();
  let lun = DO.lunedi(oggi);
  let operatori = [], disp = {}, feed = [], richieste = [], nonLettiOps = new Set(), eventi = [], regole = DO.regole.complete(null);
  let onsite = [], compensiOnsite = {};   // deployment on-site e compensi (solo supervisori)
  let operativo = Object.assign({}, DO.OPERATIVO_PREDEFINITO);
  let giornoSel = '', selezionati = new Set();
  let vista = 'griglia', ferma = null, visti = null;

  const visibili = () => {
    const mansione = $('filtro-mansione').value, testo = $('filtro-testo').value.trim().toLowerCase();
    return operatori.filter((o) => o.attivo && (!mansione || o.mansione === mansione) && (!testo || (o.nome + ' ' + o.mansione).toLowerCase().includes(testo)))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  };
  // Nei giorni on-site la disponibilità vale «non disponibile · On-site · luogo»: calcolata, mai salvata.
  let onsitePerOp = {};
  const giorniOnsite = (id) => onsitePerOp[id] || (onsitePerOp[id] = DO.onsite.giorniOnsite(onsite, id));
  const valore = (id, d) => {
    const on = giorniOnsite(id)[d];
    return on ? { s: 'A', n: 'On-site · ' + on.luogo, onsite: on } : (disp[id] && disp[id][d]) || { s: '', n: '' };
  };
  const etichettaGiorno = (d) => { const g = DO.giorno(d); return g.nome + ' ' + g.num + ' ' + g.mese; };
  const linkSito = () => new URL('index.html', location.href).href;

  // ---------- schede ----------
  function mostra(nome) {
    vista = nome;
    nascondiPopup();
    document.querySelectorAll('#schede [data-vista]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === nome)));
    VISTE.forEach((v) => { $('vista-' + v).hidden = v !== nome; });
    history.replaceState(null, '', nome === VISTE[0] ? location.pathname : '#' + nome);
    if (nome === 'operatori') disegnaOperatori();
    if (nome === 'impostazioni') caricaImpostazioni();
    moduli.forEach((m) => m.mostra && m.mostra(nome));
  }
  const VISTE = ['convocazioni', 'griglia', 'aggiornamenti', 'riepilogo', 'operatori', 'impostazioni'];
  $('schede').addEventListener('click', (e) => { const b = e.target.closest('[data-vista]'); if (b) mostra(b.dataset.vista); });

  // ---------- dati in tempo reale ----------
  function aggiorna(stato) {
    oggi = DO.oggi();
    limite = DO.limite();
    operatori = stato.operatori;
    disp = stato.disponibilita;
    feed = stato.invii;
    eventi = stato.eventi || [];
    regole = stato.regole || DO.regole.complete(null);
    operativo = stato.operativo || Object.assign({}, DO.OPERATIVO_PREDEFINITO);
    onsite = stato.onsite || [];
    compensiOnsite = stato.compensiOnsite || {};
    onsitePerOp = {};
    richieste = statoRichieste(stato.richieste);
    nonLettiOps = new Set(feed.filter((x) => !x.letto).map((x) => x.operatoreId));
    impostaNonLetti(feed.filter((x) => !x.letto).length);
    avvisaNuovi();
    aggiornaMansioni();
    disegnaGriglia();
    disegnaPannello();
    disegnaSintesiRichieste();
    disegnaFeed();
    if (vista === 'operatori') disegnaOperatori();
    moduli.forEach((m) => m.aggiorna && m.aggiorna());
  }

  // Le altre schede (convocazioni, riepilogo, impostazioni) sono in file a parte e leggono da qui.
  const moduli = [];
  const impegni = (id, d) => eventi.filter((e) => e.operatoreId === id && e.data === d && e.stato !== 'annullato');
  DO.admin = {
    registra: (m) => moduli.push(m),
    get operatori() { return operatori; },
    get disp() { return disp; },
    get eventi() { return eventi; },
    get regole() { return regole; },
    get operativo() { return operativo; },
    get onsite() { return onsite; },
    get compensiOnsite() { return compensiOnsite; },
    get vista() { return vista; },
    valore, impegni, etichettaGiorno, linkSito, mostra: (n) => mostra(n),
  };

  function vaiSettimana(nuovo) {
    lun = nuovo;
    disegnaGriglia();
  }

  // Avanzamento di ogni richiesta: chi ha già compilato tutti i giorni ancora modificabili.
  function statoRichieste(elenco) {
    return elenco.filter((x) => x.a >= DO.aggiungi(oggi, -7)).map((x) => {
      const giorni = [];
      for (let d = x.da > oggi ? x.da : oggi; d <= x.a && d <= limite; d = DO.aggiungi(d, 1)) giorni.push(d);
      const destinatari = (x.destinatari || []).map((id) => operatori.find((o) => o.id === id)).filter(Boolean)
        .map((o) => ({ id: o.id, nome: o.nome, mancanti: giorni.filter((d) => !valore(o.id, d).s).length }));
      return { id: x.id, creata: x.creata, da: x.da, a: x.a, messaggio: x.messaggio || '', scaduta: x.a < oggi, destinatari };
    });
  }

  // Invii arrivati mentre la dashboard è aperta: avviso a schermo e, se attivata, notifica del computer.
  function avvisaNuovi() {
    if (!visti) { visti = new Set(feed.map((x) => x.id)); return; }
    const nuovi = feed.filter((x) => !visti.has(x.id));
    nuovi.forEach((x) => visti.add(x.id));
    const nomi = [...new Set(nuovi.map((x) => x.nome))].join(', ');
    if (!nomi) return;
    DO.avviso('Nuovo aggiornamento da ' + nomi + '.', 'ok', 6000);
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('Disponibilità aggiornate', { body: nomi + ' ha inviato le disponibilità.', icon: 'app/favicon-180.png' });
    }
  }

  // ---------- griglia ----------
  function aggiornaMansioni() {
    const mansioni = [...new Set(operatori.map((o) => o.mansione).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
    ['filtro-mansione', 'ric-mansione'].forEach((id) => {
      const sel = $(id), attuale = sel.value;
      sel.innerHTML = '<option value="">Tutte le mansioni</option>' + mansioni.map((m) => '<option>' + DO.esc(m) + '</option>').join('');
      sel.value = mansioni.includes(attuale) ? attuale : '';
    });
    $('elenco-mansioni').innerHTML = mansioni.map((m) => '<option value="' + DO.esc(m) + '">').join('');
  }

  function disegnaGriglia() {
    const giorni = DO.settimana(lun), ops = visibili();
    $('sett-etichetta').textContent = DO.etichettaSettimana(lun);
    const risposto = ops.filter((o) => giorni.some((d) => valore(o.id, d).s)).length;
    $('sett-riepilogo').textContent = ops.length ? risposto + ' su ' + ops.length + ' hanno risposto' : '';
    $('sett-oggi').disabled = lun === DO.lunedi(oggi);
    if (!giorni.includes(giornoSel)) chiudiPannello();
    nascondiPopup();

    if (!operatori.some((o) => o.attivo)) {
      $('griglia').innerHTML = '<div class="griglia-vuota">Non ci sono ancora operatori attivi.<br><button type="button" class="link" data-vai="operatori">Aggiungili dalla scheda Operatori</button></div>';
      return;
    }
    if (!ops.length) { $('griglia').innerHTML = '<div class="griglia-vuota">Nessun operatore corrisponde ai filtri.</div>'; return; }

    const testa = giorni.map((d) => {
      const g = DO.giorno(d), conti = { D: 0, P: 0, A: 0 };
      ops.forEach((o) => { const s = valore(o.id, d).s; if (s) conti[s]++; });
      return '<th><button type="button" class="giorno-testa' + (d === oggi ? ' oggi' : '') + (d < oggi ? ' passato' : '') + '" data-giorno="' + d + '" aria-pressed="' + (d === giornoSel) + '" title="Prepara la convocazione per ' + etichettaGiorno(d) + '">'
        + '<b><span>' + g.breve + '</span> <span>' + g.num + '</span></b><span class="conti"><span class="st-D" title="Disponibili">' + conti.D + '</span>'
        + '<span class="st-P" title="Parziali">' + conti.P + '</span><span class="st-A" title="Non disponibili">' + conti.A + '</span></span></button></th>';
    }).join('');

    const corpo = ops.map((o) => {
      const celle = giorni.map((d) => {
        const v = valore(o.id, d);
        const chip = v.onsite ? '<span class="chip st-onsite"><span class="lungo">On-site</span><span class="corto">OS</span></span>'
          : v.s
          ? '<span class="chip st-' + v.s + '"><span class="lungo">' + DO.STATI[v.s].breve + '</span><span class="corto">' + SIMBOLI[v.s] + '</span>' + (v.n ? '<span class="con-nota"></span>' : '') + '</span>'
          : '<span class="chip vuoto"><span class="lungo">' + (v.n ? 'Nota' : '—') + '</span><span class="corto">·</span>' + (v.n ? '<span class="con-nota"></span>' : '') + '</span>';
        const imp = impegni(o.id, d).length;
        return '<td class="cella' + (d === giornoSel ? ' selezionato' : '') + (d < oggi ? ' passato' : '') + (imp ? ' impegnato' : '') + '" data-op="' + o.id + '" data-d="' + d + '" tabindex="0" aria-label="'
          + DO.esc(o.nome + ', ' + etichettaGiorno(d) + ': ' + DO.nomeStato(v.s) + (v.n ? '. ' + v.n : '')) + '">' + chip + '</td>';
      }).join('');
      const sotto = [o.mansione, o.ultimoInvio ? 'inviato ' + DO.quando(o.ultimoInvio) : 'mai inviato'].filter(Boolean).join(' · ');
      return '<tr><td class="colonna-op"><div class="op-cella"><b>' + (nonLettiOps.has(o.id) ? '<span class="nuovo" title="Aggiornamento non letto"></span>' : '')
        + '<span>' + DO.esc(o.nome) + '</span></b><small>' + DO.esc(sotto) + '</small></div></td>' + celle + '</tr>';
    }).join('');

    $('griglia').innerHTML = '<table class="griglia"><thead><tr><th class="colonna-op">Operatore</th>' + testa + '</tr></thead><tbody>' + corpo + '</tbody></table>';
  }

  $('griglia').addEventListener('click', (e) => {
    const b = e.target.closest('[data-giorno]');
    if (b) apriPannello(b.dataset.giorno === giornoSel ? '' : b.dataset.giorno);
    const vai = e.target.closest('[data-vai]');
    if (vai) mostra(vai.dataset.vai);
  });
  $('sett-prec').addEventListener('click', () => vaiSettimana(DO.aggiungi(lun, -7)));
  $('sett-succ').addEventListener('click', () => vaiSettimana(DO.aggiungi(lun, 7)));
  $('sett-oggi').addEventListener('click', () => vaiSettimana(DO.lunedi(oggi)));
  $('filtro-mansione').addEventListener('change', () => { disegnaGriglia(); disegnaPannello(); });
  $('filtro-testo').addEventListener('input', () => { disegnaGriglia(); disegnaPannello(); });

  $('btn-csv').addEventListener('click', () => {
    const giorni = DO.settimana(lun);
    const campo = (t) => '"' + String(t || '').replace(/"/g, '""') + '"';
    const righe = [['Operatore', 'Mansione', 'Email', 'Telefono'].concat(giorni.map(etichettaGiorno)).map(campo).join(';')];
    visibili().forEach((o) => {
      righe.push([o.nome, o.mansione, o.email, o.telefono].concat(giorni.map((d) => {
        const v = valore(o.id, d);
        return (v.s ? DO.nomeStato(v.s) : '') + (v.n ? ' (' + v.n + ')' : '');
      })).map(campo).join(';'));
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + righe.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'Disponibilita_' + lun + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------- popup sulle caselle: col mouse al passaggio, sul telefono al tocco ----------
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.setAttribute('role', 'tooltip');
  popup.hidden = true;
  document.body.appendChild(popup);
  let cellaPopup = null;

  function mostraPopup(td) {
    const o = operatori.find((x) => x.id === td.dataset.op);
    if (!o) return;
    const d = td.dataset.d, v = valore(o.id, d);
    cellaPopup = td;
    popup.innerHTML = '<div class="popup-testa"><b>' + DO.esc(o.nome) + '</b><span>' + etichettaGiorno(d) + '</span></div>'
      + '<div class="popup-stato st-' + v.s + '"><span class="pallino"></span>' + DO.nomeStato(v.s) + '</div>'
      + (v.n ? '<p class="popup-nota">' + DO.esc(v.n) + '</p>' : v.s ? '<p class="popup-vuota">Nessuna nota</p>' : '')
      + (v.t ? '<small>Aggiornato ' + DO.quando(v.t) + '</small>' : '')
      + impegni(o.id, d).map((e) => '<p class="popup-impegno">' + (e.tipo === 'supervisione' ? 'Supervisione' : DO.esc(e.titolo))
        + ' · ritrovo ' + DO.regole.convocazione(e, regole) + '</p>').join('')
      + (o.telefono ? '<small>' + DO.esc(o.telefono) + '</small>' : '');
    popup.hidden = false;
    const r = td.getBoundingClientRect(), w = popup.offsetWidth, h = popup.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const sotto = r.bottom + 8 + h < innerHeight;
    popup.style.left = left + 'px';
    popup.style.top = (sotto ? r.bottom + 6 : r.top - h - 6) + 'px';
    popup.classList.toggle('sopra', !sotto);
  }
  function nascondiPopup() {
    popup.hidden = true;
    cellaPopup = null;
  }
  $('griglia').addEventListener('pointerover', (e) => {
    const td = e.target.closest('td.cella');
    if (td && e.pointerType === 'mouse' && td !== cellaPopup) mostraPopup(td);
  });
  $('griglia').addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && cellaPopup && !cellaPopup.contains(e.relatedTarget)) nascondiPopup();
  });
  $('griglia').addEventListener('click', (e) => {
    const td = e.target.closest('td.cella');
    if (!td) return;
    if (td === cellaPopup && e.pointerType !== 'mouse') nascondiPopup(); else mostraPopup(td);
  });
  // da tastiera (Tab) il popup segue la casella; al tocco ci pensa il clic
  $('griglia').addEventListener('focusin', (e) => { if (e.target.matches('td.cella:focus-visible')) mostraPopup(e.target); });
  document.addEventListener('click', (e) => { if (cellaPopup && !e.target.closest('td.cella')) nascondiPopup(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') nascondiPopup(); });
  window.addEventListener('scroll', nascondiPopup, { passive: true });
  $('griglia').addEventListener('scroll', nascondiPopup, { passive: true });
  window.addEventListener('resize', nascondiPopup);

  // ---------- convocazione ----------
  function gruppi() {
    const g = { D: [], P: [], A: [], vuoti: [] };
    visibili().forEach((o) => { const s = valore(o.id, giornoSel).s; (g[s] || g.vuoti).push(o); });
    return g;
  }

  function apriPannello(d) {
    giornoSel = d;
    selezionati = new Set();
    if (d) { const g = gruppi(); g.D.concat(g.P).forEach((o) => selezionati.add(o.id)); }
    $('dashboard').classList.toggle('con-pannello', !!d);
    $('pannello-conv').hidden = !d;
    disegnaGriglia();
    disegnaPannello();
    if (d && window.innerWidth <= 1080) $('pannello-conv').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function chiudiPannello() {
    if (!giornoSel) return;
    giornoSel = '';
    $('dashboard').classList.remove('con-pannello');
    $('pannello-conv').hidden = true;
  }
  $('conv-chiudi').addEventListener('click', () => { chiudiPannello(); disegnaGriglia(); });

  function disegnaPannello() {
    if (!giornoSel) return;
    $('conv-giorno').textContent = etichettaGiorno(giornoSel);
    const g = gruppi();
    const voce = (o) => {
      const v = valore(o.id, giornoSel);
      return '<li><label><input type="checkbox" data-op="' + o.id + '"' + (selezionati.has(o.id) ? ' checked' : '') + '>'
        + '<span class="chi"><b>' + DO.esc(o.nome) + '</b><small>' + DO.esc(o.mansione || '—') + '</small>'
        + (v.n ? '<em>' + DO.esc(v.n) + '</em>' : '') + '</span></label></li>';
    };
    const sezione = (cls, titolo, ops, html) => '<h3 class="' + cls + '"><span class="pallino"></span>' + titolo + ' · ' + ops.length + '</h3>' + html;
    $('conv-corpo').innerHTML =
      sezione('st-D', 'Disponibili', g.D, g.D.length ? '<ul class="elenco-conv">' + g.D.map(voce).join('') + '</ul>' : '<p class="nota">Nessuno.</p>')
      + (g.P.length ? sezione('st-P', 'Parziali', g.P, '<ul class="elenco-conv">' + g.P.map(voce).join('') + '</ul>') : '')
      + (g.A.length ? sezione('st-A', 'Non disponibili', g.A, '<ul class="elenco-semplice">' + g.A.map((o) => '<li>' + DO.esc(o.nome)
        + (valore(o.id, giornoSel).n ? ' <small>· ' + DO.esc(valore(o.id, giornoSel).n) + '</small>' : '') + '</li>').join('') + '</ul>') : '')
      + (g.vuoti.length ? sezione('', 'Senza risposta', g.vuoti, '<ul class="elenco-semplice">' + g.vuoti.map((o) => '<li>' + DO.esc(o.nome) + '</li>').join('')
        + '</ul><button type="button" class="link" id="conv-sollecito">Chiedi a loro le disponibilità…</button>') : '');
    aggiornaAzioniConv();
  }

  $('conv-corpo').addEventListener('change', (e) => {
    const id = e.target.dataset.op;
    if (!id) return;
    if (e.target.checked) selezionati.add(id); else selezionati.delete(id);
    aggiornaAzioniConv();
  });
  $('conv-corpo').addEventListener('click', (e) => {
    if (e.target.id === 'conv-sollecito') apriRichiesta({ da: giornoSel, a: giornoSel, soli: gruppi().vuoti.map((o) => o.id) });
  });

  const scelti = () => visibili().filter((o) => selezionati.has(o.id));
  function aggiornaAzioniConv() {
    const n = scelti().length;
    $('conv-email').textContent = n ? 'Scrivi email ai ' + n + ' selezionati' : 'Seleziona chi convocare';
    ['conv-email', 'conv-copia-email', 'conv-copia-tel', 'conv-copia-elenco'].forEach((id) => { $(id).disabled = !n; });
  }

  $('conv-email').addEventListener('click', () => {
    const email = scelti().map((o) => o.email).filter(Boolean);
    if (!email.length) { DO.avviso('I selezionati non hanno un\'email registrata.', 'errore'); return; }
    const oggetto = 'Convocazione ' + etichettaGiorno(giornoSel);
    const testo = 'Ciao,\nti convochiamo per ' + etichettaGiorno(giornoSel) + '.\n\nEvento: \nOrario di ritrovo: \nLuogo: \n\nConferma per favore la tua presenza.\n\nGrazie,\nTGI Sport';
    location.href = 'mailto:?bcc=' + encodeURIComponent(email.join(',')) + '&subject=' + encodeURIComponent(oggetto) + '&body=' + encodeURIComponent(testo);
  });
  $('conv-copia-email').addEventListener('click', () => {
    const email = scelti().map((o) => o.email).filter(Boolean);
    DO.copia(email.join(', '), email.length + ' email copiate.');
  });
  $('conv-copia-tel').addEventListener('click', () => {
    const tel = scelti().filter((o) => o.telefono).map((o) => o.nome + ': ' + o.telefono);
    DO.copia(tel.join('\n'), tel.length + ' numeri copiati.');
  });
  $('conv-copia-elenco').addEventListener('click', () => {
    const righe = scelti().map((o) => {
      const v = valore(o.id, giornoSel);
      return '• ' + o.nome + (o.mansione ? ' (' + o.mansione + ')' : '') + (v.s === 'P' ? ' – parziale' : '') + (v.n ? ': ' + v.n : '');
    });
    DO.copia(etichettaGiorno(giornoSel) + '\n' + righe.join('\n'), 'Elenco copiato.');
  });

  // ---------- richieste di disponibilità ----------
  let soloQuesti = null, timerAnteprima = null;

  function apriRichiesta(opzioni) {
    const o = opzioni || {};
    const prossimo = DO.aggiungi(DO.lunedi(oggi), 7);
    $('ric-da').min = $('ric-a').min = oggi;
    $('ric-da').max = $('ric-a').max = limite;
    $('ric-da').value = o.da && o.da >= oggi ? o.da : prossimo;
    $('ric-a').value = o.a && o.a >= oggi ? o.a : DO.aggiungi(prossimo, 6);
    $('ric-mansione').value = '';
    $('ric-mancanti').checked = true;
    $('ric-messaggio').value = '';
    $('ric-email').checked = true;
    $('ric-errore').hidden = true;
    soloQuesti = o.soli ? new Set(o.soli) : null;
    $('dlg-richiesta').showModal();
    caricaAnteprima();
  }
  $('btn-richiedi').addEventListener('click', () => apriRichiesta());
  $('btn-richiedi-2').addEventListener('click', () => apriRichiesta());

  document.querySelectorAll('[data-periodo]').forEach((b) => b.addEventListener('click', () => {
    const inizio = DO.aggiungi(DO.lunedi(oggi), 7);
    const giorni = Number(b.dataset.periodo);
    $('ric-da').value = giorni === 0 ? oggi : inizio;
    $('ric-a').value = giorni === 0 ? DO.aggiungi(DO.lunedi(oggi), 6) : DO.aggiungi(inizio, giorni - 1);
    soloQuesti = null;
    caricaAnteprima();
  }));
  ['ric-da', 'ric-a'].forEach((id) => $(id).addEventListener('change', () => {
    if ($('ric-da').value > $('ric-a').value) $('ric-a').value = $('ric-da').value;
    soloQuesti = null;
    clearTimeout(timerAnteprima);
    timerAnteprima = setTimeout(caricaAnteprima, 300);
  }));
  ['ric-mansione', 'ric-mancanti'].forEach((id) => $(id).addEventListener('change', () => { soloQuesti = null; disegnaDestinatari(true); }));

  // giorni del periodo ancora modificabili dagli operatori, e quanti ne mancano a ognuno
  function giorniRichiesta() {
    const out = [];
    for (let d = $('ric-da').value > oggi ? $('ric-da').value : oggi; d && d <= $('ric-a').value && d <= limite; d = DO.aggiungi(d, 1)) out.push(d);
    return out;
  }
  const mancanti = (id, giorni) => giorni.filter((d) => !valore(id, d).s).length;

  // tutte le disponibilità sono già in memoria: l'anteprima è immediata
  function caricaAnteprima() {
    if ($('ric-da').value && $('ric-a').value) disegnaDestinatari(true);
  }

  function disegnaDestinatari(preseleziona) {
    const giorni = giorniRichiesta(), mansione = $('ric-mansione').value, soloMancanti = $('ric-mancanti').checked;
    const ops = operatori.filter((o) => o.attivo && (!mansione || o.mansione === mansione)).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    const spuntati = new Set([...$('ric-destinatari').querySelectorAll('input:checked')].map((x) => x.value));
    $('ric-destinatari').innerHTML = ops.length ? ops.map((o) => {
      const m = mancanti(o.id, giorni);
      const si = preseleziona ? (soloQuesti ? soloQuesti.has(o.id) : !soloMancanti || m > 0) : spuntati.has(o.id);
      return '<li><label><input type="checkbox" value="' + o.id + '"' + (si ? ' checked' : '') + '><span class="chi"><b>' + DO.esc(o.nome) + '</b><small>'
        + DO.esc(o.mansione || '—') + ' · ' + (m ? (m === giorni.length ? 'nessun giorno compilato' : m + (m === 1 ? ' giorno mancante' : ' giorni mancanti')) : 'già tutto compilato')
        + (o.email ? '' : ' · senza email') + '</small></span></label></li>';
    }).join('') : '<li class="nota">Nessun operatore attivo con questa mansione.</li>';
    aggiornaBottoneRichiesta();
  }
  $('ric-destinatari').addEventListener('change', aggiornaBottoneRichiesta);
  $('ric-tutti').addEventListener('click', () => {
    const caselle = [...$('ric-destinatari').querySelectorAll('input')];
    const tutti = caselle.every((x) => x.checked);
    caselle.forEach((x) => { x.checked = !tutti; });
    aggiornaBottoneRichiesta();
  });

  function aggiornaBottoneRichiesta() {
    const n = $('ric-destinatari').querySelectorAll('input:checked').length;
    $('ric-invia').disabled = !n;
    $('ric-invia').textContent = n ? 'Invia la richiesta a ' + n + (n === 1 ? ' operatore' : ' operatori') : 'Scegli gli operatori';
    $('ric-periodo').textContent = $('ric-da').value && $('ric-a').value ? 'Periodo: ' + DO.periodo($('ric-da').value, $('ric-a').value) : '';
  }

  function messaggioWhatsApp(da, a, testo) {
    return 'Ciao! I supervisori TGI Sport chiedono le tue disponibilità ' + DO.periodo(da, a) + '.'
      + (testo ? '\n' + testo : '') + '\n\nInseriscile qui: ' + linkSito();
  }

  $('form-richiesta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const destinatari = [...$('ric-destinatari').querySelectorAll('input:checked')].map((x) => x.value);
    const da = $('ric-da').value, a = $('ric-a').value, messaggio = $('ric-messaggio').value.trim(), email = $('ric-email').checked;
    $('ric-invia').disabled = true;
    $('ric-invia').textContent = 'Invio in corso…';
    $('ric-errore').hidden = true;
    const contatti = operatori.filter((o) => destinatari.includes(o.id)).map((o) => ({ nome: o.nome, email: o.email }));
    try {
      const r = await DO.dati.creaRichiesta({ da, a, messaggio, destinatari, contatti, email, urlSito: linkSito() });
      $('dlg-richiesta').close();
      // la richiesta è già sulla pagina degli operatori; le email partono in sottofondo
      const righe = ['La richiesta compare già sulla pagina di ciascun operatore.'];
      if (email) righe.push('Email in partenza…');
      if (r.senzaEmail.length) righe.push('Senza email registrata: ' + r.senzaEmail.join(', ') + '.');
      $('esito-testo').innerHTML = righe.map((x) => '<p>' + DO.esc(x) + '</p>').join('');
      $('esito-whatsapp').onclick = () => DO.copia(messaggioWhatsApp(da, a, messaggio), 'Messaggio copiato: incollalo su WhatsApp.');
      $('dlg-esito').showModal();
      if (email) {
        r.inviate.then((x) => {
          const testo = x.email ? 'Email inviata a ' + x.email + (x.email === 1 ? ' operatore.' : ' operatori.') : 'Nessuna email inviata.';
          const avvisi = (x.nonInviate && x.nonInviate.length ? ' Non partita per: ' + x.nonInviate.join(', ') + '.' : '')
            + (x.quotaRestante !== undefined && x.quotaRestante < 20 ? ' Oggi Google permette ancora ' + x.quotaRestante + ' email.' : '');
          const p = $('esito-testo').querySelector('p:nth-child(2)');
          if (p && $('dlg-esito').open) p.textContent = testo + avvisi;
          DO.avviso(testo + avvisi, avvisi ? 'errore' : 'ok', 6000);
        }).catch((e) => DO.avviso('Richiesta salvata, ma le email non sono partite: ' + e.message, 'errore', 8000));
      }
    } catch (err) {
      $('ric-errore').textContent = err.message;
      $('ric-errore').hidden = false;
      aggiornaBottoneRichiesta();
    }
  });

  function schedaRichiesta(x, compatta) {
    const tot = x.destinatari.length, fatti = x.destinatari.filter((o) => !o.mancanti).length;
    const mancano = x.destinatari.filter((o) => o.mancanti);
    const perc = tot ? Math.round(fatti / tot * 100) : 0;
    const titolo = 'Disponibilità ' + DO.periodo(x.da, x.a);
    if (compatta) {
      return '<div class="sintesi-richiesta"><span class="pallino' + (fatti === tot ? ' st-D' : '') + '"></span><span><b>' + titolo + '</b>: '
        + fatti + ' su ' + tot + ' hanno risposto</span><div class="barra-avanzamento"><span style="width:' + perc + '%"></span></div>'
        + '<button type="button" class="link" data-vista-richieste>Dettagli</button></div>';
    }
    return '<li class="richiesta-admin' + (x.scaduta ? ' scaduta' : '') + '"><div class="richiesta-admin-testa"><div><b>' + titolo + '</b>'
      + '<small>Inviata ' + DO.quando(x.creata) + (x.scaduta ? ' · periodo concluso' : '') + '</small></div>'
      + '<span class="conteggio">' + fatti + '/' + tot + '</span></div>'
      + '<div class="barra-avanzamento"><span style="width:' + perc + '%"></span></div>'
      + (x.messaggio ? '<q>' + DO.esc(x.messaggio) + '</q>' : '')
      + (mancano.length && !x.scaduta ? '<p class="nota"><b>Mancano ancora:</b> ' + mancano.map((o) => DO.esc(o.nome) + ' <span class="giorni-mancanti">(' + o.mancanti + ')</span>').join(', ') + '</p>'
        : !x.scaduta ? '<p class="nota st-D-testo">Hanno risposto tutti.</p>' : '')
      + '<div class="richiesta-admin-azioni">'
      + '<button type="button" class="bottone" data-ric-vedi="' + x.id + '">Vedi nella griglia</button>'
      + (mancano.length && !x.scaduta ? '<button type="button" class="bottone" data-ric-sollecita="' + x.id + '">Sollecita chi manca</button>' : '')
      + '<button type="button" class="bottone" data-ric-whatsapp="' + x.id + '">Copia messaggio WhatsApp</button>'
      + '<button type="button" class="bottone pericolo" data-ric-chiudi="' + x.id + '">Chiudi</button></div></li>';
  }

  function disegnaSintesiRichieste() {
    const aperte = richieste.filter((x) => !x.scaduta);
    $('richieste-sintesi').innerHTML = aperte.map((x) => schedaRichiesta(x, true)).join('');
    $('richieste-sintesi').hidden = !aperte.length;
    $('richieste-lista').innerHTML = richieste.map((x) => schedaRichiesta(x, false)).join('');
    $('richieste-box').hidden = !richieste.length;
  }

  $('richieste-sintesi').addEventListener('click', (e) => { if (e.target.closest('[data-vista-richieste]')) mostra('aggiornamenti'); });
  $('richieste-lista').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const x = richieste.find((y) => y.id === (b.dataset.ricVedi || b.dataset.ricSollecita || b.dataset.ricWhatsapp || b.dataset.ricChiudi));
    if (!x) return;
    if (b.dataset.ricVedi) { mostra('griglia'); vaiSettimana(DO.lunedi(x.da > oggi ? x.da : oggi)); }
    if (b.dataset.ricSollecita) apriRichiesta({ da: x.da, a: x.a, soli: x.destinatari.filter((o) => o.mancanti).map((o) => o.id) });
    if (b.dataset.ricWhatsapp) DO.copia(messaggioWhatsApp(x.da > oggi ? x.da : oggi, x.a, x.messaggio), 'Messaggio copiato: incollalo su WhatsApp.');
    if (b.dataset.ricChiudi) {
      if (!confirm('Chiudere la richiesta? Sparirà dalla pagina degli operatori.')) return;
      try {
        await DO.dati.chiudiRichiesta(x.id);
      } catch (err) { DO.avviso(err.message, 'errore'); }
    }
  });

  // ---------- aggiornamenti ----------
  function impostaNonLetti(n) {
    $('badge').textContent = n ? String(n) : '';
    document.title = (n ? '(' + n + ') ' : '') + 'Supervisori · Disponibilità TGI Sport';
  }

  function disegnaFeed() {
    if (!feed.length) { $('feed').innerHTML = '<li class="griglia-vuota">Nessun invio per ora.</li>'; return; }
    $('feed').innerHTML = feed.map((x) => {
      if (x.tipo === 'convocazione') return vocePerConvocazione(x);
      if (x.tipo === 'onsite') return vocePerOnsite(x);
      const n = x.modifiche.length;
      const modifiche = x.modifiche.slice(0, 14).map((m) => {
        const g = DO.giorno(m.d);
        return '<li class="st-' + m.a + '"><span class="pallino"></span><b>' + g.breve + ' ' + g.num + ' ' + g.meseBreve + '</b>'
          + (m.da ? '<i>' + DO.nomeStato(m.da) + ' →</i>' : '') + DO.nomeStato(m.a) + (m.n ? ' · ' + DO.esc(m.n) : '') + '</li>';
      }).join('') + (n > 14 ? '<li>+ altri ' + (n - 14) + '</li>' : '');
      return '<li class="feed-voce' + (x.letto ? '' : ' non-letto') + '"><span class="iniziali">' + DO.esc(DO.iniziali(x.nome)) + '</span>'
        + '<div><p class="feed-titolo"><b>' + DO.esc(x.nome) + '</b> ' + (n ? 'ha aggiornato ' + n + (n === 1 ? ' giorno' : ' giorni') : 'ha confermato le disponibilità senza modifiche') + '</p>'
        + '<span class="feed-quando">' + DO.quando(x.quando) + '</span>' + (n ? '<ul class="modifiche">' + modifiche + '</ul>' : '') + '</div>'
        + '<div class="feed-azioni">' + (n ? '<button type="button" class="bottone" data-vedi="' + x.id + '">Vedi nella griglia</button>' : '')
        + (x.letto ? '' : '<button type="button" class="link" data-letto="' + x.id + '">Segna come letto</button>') + '</div></li>';
    }).join('');
  }

  function vocePerConvocazione(x) {
    const ev = x.evento || {}, si = ev.stato === 'confermato', g = ev.data ? DO.giorno(ev.data) : null;
    return '<li class="feed-voce' + (x.letto ? '' : ' non-letto') + '"><span class="iniziali">' + DO.esc(DO.iniziali(x.nome)) + '</span>'
      + '<div><p class="feed-titolo"><b>' + DO.esc(x.nome) + '</b> ' + (si ? 'ha confermato' : '<span class="testo-errore">non può partecipare</span>') + ': '
      + DO.esc(ev.titolo || '') + (g ? ' · ' + g.breve + ' ' + g.num + ' ' + g.meseBreve : '') + '</p>'
      + '<span class="feed-quando">' + DO.quando(x.quando) + '</span>'
      + (ev.motivo ? '<ul class="modifiche"><li>' + DO.esc(ev.motivo) + '</li></ul>' : '') + '</div>'
      + '<div class="feed-azioni"><button type="button" class="bottone" data-vedi-evento="' + DO.esc(ev.data || '') + '" data-id="' + x.id + '">Vedi convocazione</button>'
      + (x.letto ? '' : '<button type="button" class="link" data-letto="' + x.id + '">Segna come letto</button>') + '</div></li>';
  }

  function vocePerOnsite(x) {
    const ev = x.evento || {}, si = ev.stato === 'accettato';
    const periodo = ev.da && ev.a ? ' ' + DO.onsite.periodoBreve(ev.da, ev.a) : '';
    return '<li class="feed-voce' + (x.letto ? '' : ' non-letto') + '"><span class="iniziali">' + DO.esc(DO.iniziali(x.nome)) + '</span>'
      + '<div><p class="feed-titolo"><b>' + DO.esc(x.nome) + '</b> ' + (si ? 'ha accettato l\'on-site' : '<span class="testo-errore">non può per l\'on-site</span>')
      + ' · ' + DO.esc(ev.luogo || '') + periodo + (si && ev.ruolo ? ' (' + DO.esc(ev.ruolo) + ')' : '') + '</p>'
      + '<span class="feed-quando">' + DO.quando(x.quando) + '</span></div>'
      + '<div class="feed-azioni"><button type="button" class="bottone" data-vedi-onsite="' + DO.esc(ev.id || '') + '" data-id="' + x.id + '">Vedi deployment</button>'
      + (x.letto ? '' : '<button type="button" class="link" data-letto="' + x.id + '">Segna come letto</button>') + '</div></li>';
  }

  async function segnaLetti(ids) {
    const daSegnare = (ids || feed.filter((x) => !x.letto).map((x) => x.id));
    if (!daSegnare.length) return;
    try { await DO.dati.segnaLetti(daSegnare); } catch (e) { DO.avviso(e.message, 'errore'); }
  }

  $('feed').addEventListener('click', (e) => {
    const letto = e.target.closest('[data-letto]');
    if (letto) segnaLetti([letto.dataset.letto]);
    const vediEv = e.target.closest('[data-vedi-evento]');
    if (vediEv) {
      const x = feed.find((v) => v.id === vediEv.dataset.id);
      if (x && !x.letto) segnaLetti([x.id]);
      mostra('convocazioni');
      moduli.forEach((m) => m.vaiA && m.vaiA(vediEv.dataset.vediEvento));
    }
    const vediOn = e.target.closest('[data-vedi-onsite]');
    if (vediOn) {
      const x = feed.find((v) => v.id === vediOn.dataset.id), dep = onsite.find((d) => d.id === vediOn.dataset.vediOnsite);
      if (x && !x.letto) segnaLetti([x.id]);
      mostra('convocazioni');
      if (dep) { moduli.forEach((m) => m.vaiA && m.vaiA(dep.da)); DO.onsiteAdmin.apri(dep.id); } else DO.avviso('Deployment non più disponibile.', 'errore');
    }
    const vedi = e.target.closest('[data-vedi]');
    if (vedi) {
      const x = feed.find((v) => v.id === vedi.dataset.vedi);
      if (!x.letto) segnaLetti([x.id]);
      $('filtro-mansione').value = '';
      $('filtro-testo').value = x.nome;
      mostra('griglia');
      vaiSettimana(DO.lunedi(x.modifiche.map((m) => m.d).sort()[0] || oggi));
    }
  });
  $('btn-tutti-letti').addEventListener('click', () => segnaLetti(null));

  function aggiornaBottoneNotifiche() {
    const b = $('btn-notifiche-desktop');
    if (!('Notification' in window)) { b.hidden = true; return; }
    b.disabled = Notification.permission !== 'default';
    b.textContent = Notification.permission === 'granted' ? 'Notifiche sul computer attive'
      : Notification.permission === 'denied' ? 'Notifiche bloccate dal browser' : 'Attiva notifiche sul computer';
  }
  $('btn-notifiche-desktop').addEventListener('click', async () => {
    await Notification.requestPermission();
    aggiornaBottoneNotifiche();
  });

  // ---------- operatori ----------
  function disegnaOperatori() {
    const elenco = operatori.slice().sort((a, b) => (b.attivo - a.attivo) || a.nome.localeCompare(b.nome, 'it'));
    if (!elenco.length) {
      $('tabella-operatori').innerHTML = '<div class="griglia-vuota">Nessun operatore. Crea il primo con <b>+ Nuovo operatore</b>.</div>';
      return;
    }
    $('tabella-operatori').innerHTML = '<table class="tabella"><thead><tr><th>Operatore</th><th>Ruolo</th><th class="solo-desktop">Contratto</th><th class="solo-desktop">Contatti</th><th>Stato</th><th class="solo-desktop">Ultimo invio</th><th></th></tr></thead><tbody>'
      + elenco.map((o) => '<tr class="' + (o.attivo ? '' : 'disattivo') + '">'
        + '<td><b>' + DO.esc(o.nome) + '</b><br><small class="tenue">' + DO.esc(o.mansione || '—') + '</small></td>'
        + '<td><span class="etichetta ruolo-' + o.ruolo + '">' + o.ruolo + '</span>'
        + (o.onsite ? ' <span class="etichetta etichetta-onsite">on-site ' + o.onsite + '</span>' : '') + '</td>'
        + '<td class="solo-desktop">' + (o.contratto ? DO.esc(o.contratto) : '<span class="testo-errore">da indicare</span>') + '</td>'
        + '<td class="solo-desktop">' + DO.esc(o.email || '—') + '<br><small class="tenue">' + DO.esc(o.telefono || '') + '</small></td>'
        + '<td><span class="etichetta' + (o.attivo ? '' : ' spenta') + '">' + (o.attivo ? 'Attivo' : 'Disattivato') + '</span>'
        + (o.uid === '' ? '<br><small class="testo-errore">senza codice</small>' : '') + '</td>'
        + '<td class="solo-desktop">' + (o.ultimoInvio ? DO.quando(o.ultimoInvio) : '<span class="tenue">mai</span>') + '</td>'
        + '<td class="azioni"><button type="button" class="bottone" data-modifica="' + o.id + '">Modifica</button> '
        + '<button type="button" class="bottone" data-codice="' + o.id + '">' + (o.uid === '' ? 'Crea codice' : 'Nuovo codice') + '</button> '
        + '<button type="button" class="bottone pericolo" data-elimina="' + o.id + '">Elimina</button></td></tr>').join('')
      + '</tbody></table>';
  }

  let inModifica = null;
  function apriOperatore(o) {
    inModifica = o || null;
    $('dlg-operatore-titolo').textContent = o ? 'Modifica operatore' : 'Nuovo operatore';
    $('op-nome').value = o ? o.nome : '';
    $('op-mansione').value = o ? o.mansione : '';
    $('op-email').value = o ? o.email : '';
    $('op-telefono').value = o ? o.telefono : '';
    $('op-contratto').value = o ? o.contratto : 'P.IVA';
    $('op-ruolo').value = o ? o.ruolo : 'OP';
    $('op-onsite').value = o ? o.onsite || '' : '';
    $('op-attivo').checked = o ? o.attivo : true;
    $('op-attivo-riga').hidden = !o;
    $('op-errore').hidden = true;
    $('dlg-operatore').showModal();
  }
  $('btn-nuovo-op').addEventListener('click', () => apriOperatore(null));
  document.querySelectorAll('[data-chiudi]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  $('form-operatore').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bottone = $('op-salva');
    bottone.disabled = true;
    try {
      const r = await DO.dati.salvaOperatore({
        id: inModifica && inModifica.id, nome: $('op-nome').value, mansione: $('op-mansione').value,
        email: $('op-email').value, telefono: $('op-telefono').value, attivo: $('op-attivo').checked,
        contratto: $('op-contratto').value, ruolo: $('op-ruolo').value, onsite: $('op-onsite').value,
      });
      $('dlg-operatore').close();
      if (r.codice) mostraCodice(r.operatore, r.codice);
      else DO.avviso('Operatore salvato.', 'ok');
    } catch (err) {
      $('op-errore').textContent = err.message;
      $('op-errore').hidden = false;
    } finally {
      bottone.disabled = false;
    }
  });

  function mostraCodice(o, codice) {
    const link = linkSito() + '#codice=' + codice;
    $('cod-nome').textContent = o.nome;
    $('cod-codice').textContent = codice;
    $('cod-link').value = link;
    $('cod-copia-link').onclick = () => DO.copia(link, 'Link copiato.');
    $('cod-copia-msg').onclick = () => DO.copia('Ciao ' + o.nome.split(' ')[0] + ', da ora puoi indicare le tue disponibilità settimanali per TGI Sport qui:\n'
      + link + '\n\nIl tuo codice personale è ' + codice + ': non condividerlo.', 'Messaggio copiato: incollalo su WhatsApp o in una email.');
    $('dlg-codice').showModal();
  }

  $('tabella-operatori').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const o = operatori.find((x) => x.id === (b.dataset.modifica || b.dataset.codice || b.dataset.elimina));
    if (!o) return;
    if (b.dataset.modifica) { apriOperatore(o); return; }
    if (b.dataset.codice) {
      if (o.uid !== '' && !confirm('Generare un nuovo codice per ' + o.nome + '? Quello attuale smetterà di funzionare.')) return;
      try { mostraCodice(o, (await DO.dati.nuovoCodice(o.id)).codice); } catch (err) { DO.avviso(err.message, 'errore'); }
      return;
    }
    if (!confirm('Eliminare ' + o.nome + ' e tutte le sue disponibilità? Per sospenderlo e basta, usa Modifica → Attivo.')) return;
    try {
      await DO.dati.eliminaOperatore(o.id);
      DO.avviso(o.nome + ' eliminato.', 'ok');
    } catch (err) { DO.avviso(err.message, 'errore'); }
  });

  // ---------- impostazioni ----------
  // promemoria automatici: con uno script delle email non aggiornato la casella e i giorni restano spenti
  function mostraPromemoria(r) {
    const disponibili = r.promemoriaAttivi !== undefined;
    $('imp-promemoria').checked = !!r.promemoriaAttivi;
    $('imp-promemoria-giorni').value = disponibili ? r.promemoriaGiorni : '';
    $('imp-promemoria').disabled = $('imp-promemoria-giorni').disabled = !disponibili;
    $('imp-promemoria-stato').textContent = DO.regole.statoPromemoria(r);
  }

  async function caricaImpostazioni() {
    $('imp-email').placeholder = 'Caricamento…';
    try {
      const r = await DO.dati.leggiImpostazioni();
      $('imp-email').value = r.emailSupervisori.split(',').filter(Boolean).join(', ');
      $('imp-email-attive').checked = r.emailAttive;
      mostraPromemoria(r);
    } catch (e) {
      DO.avviso('Impostazioni email non disponibili: ' + e.message, 'errore');
    } finally {
      $('imp-email').placeholder = 'nome.cognome@tgisport.it, …';
    }
  }

  $('form-email').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dati = {
      emailSupervisori: $('imp-email').value, emailAttive: $('imp-email-attive').checked,
      // il link nelle email porta a questa pagina, direttamente agli aggiornamenti
      urlAdmin: location.href.split('#')[0] + '#aggiornamenti',
    };
    if (!$('imp-promemoria-giorni').disabled) {
      const giorni = DO.regole.numero($('imp-promemoria-giorni').value, { min: 1, max: 7, intero: true });
      if (giorni === null) { DO.avviso('I giorni del promemoria vanno da 1 a 7.', 'errore'); return; }
      Object.assign(dati, { promemoriaAttivi: $('imp-promemoria').checked, promemoriaGiorni: giorni });
    }
    const b = e.target.querySelector('button[type="submit"]');
    b.disabled = true;
    try {
      mostraPromemoria(await DO.dati.salvaImpostazioni(dati));
      DO.avviso('Impostazioni salvate.', 'ok');
    } catch (err) {
      DO.avviso(err.message, 'errore');
    } finally {
      b.disabled = false;
    }
  });

  $('form-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('pw-nuova').value !== $('pw-conferma').value) { DO.avviso('Le due password nuove non coincidono.', 'errore'); return; }
    try {
      await DO.dati.cambiaPassword($('pw-attuale').value, $('pw-nuova').value);
      e.target.reset();
      DO.avviso('Password cambiata.', 'ok');
    } catch (err) { DO.avviso(err.message, 'errore'); }
  });

  // ---------- accesso ----------
  async function entra() {
    $('pagina').hidden = true;
    $('schede').hidden = true;
    $('btn-esci').hidden = true;
    $('accesso-demo').hidden = !DO.inDemo;
    let u = null;
    try {
      u = await DO.dati.utente();
    } catch (e) {
      $('accesso').hidden = false;
      $('accesso-errore').textContent = 'Non riesco a collegarmi: ' + e.message + '. Controlla la connessione e ricarica la pagina.';
      $('accesso-errore').hidden = false;
      return;
    }
    if (!u) {
      await DO.chiediAccesso(() => {
        const email = $('accesso-email').value, password = $('accesso-password').value;
        if (!primoAccesso) return DO.dati.accediSupervisore(email, password, $('accesso-ricorda').checked);
        if (password !== $('accesso-conferma').value) throw new Error('Le due password non coincidono.');
        // account creato: si torna su "Entra", il messaggio "controlla la posta" resta visibile
        return DO.dati.creaSupervisore(email, password).catch((e) => { if (e.info) modoAccesso(false); throw e; });
      });
    }
    $('pagina').hidden = false;
    $('schede').hidden = false;
    $('btn-esci').hidden = false;
    aggiornaBottoneNotifiche();
    const iniziale = location.hash.slice(1);
    mostra(VISTE.includes(iniziale) ? iniziale : VISTE[0]);
    $('griglia').innerHTML = '<div class="caricamento"><span></span></div>';
    visti = null;
    ferma = DO.dati.ascolta(aggiorna);
  }

  // Primo accesso: ogni supervisore crea la propria password e conferma l'indirizzo con il link ricevuto.
  let primoAccesso = false;
  function modoAccesso(crea) {
    primoAccesso = crea;
    $('accesso-titolo').textContent = crea ? 'Primo accesso' : 'Dashboard supervisori';
    $('accesso-testo').textContent = crea ? 'Scegli la tua password (almeno 8 caratteri): riceverai un\'email per confermare l\'indirizzo.'
      : 'Entra con la tua email TGI Sport e la tua password.';
    $('accesso-conferma-riga').hidden = !crea;
    $('accesso-conferma').required = crea;
    $('accesso-password').autocomplete = crea ? 'new-password' : 'current-password';
    $('accesso-entra').textContent = crea ? 'Crea account' : 'Entra';
    $('accesso-modo').textContent = crea ? 'Hai già un account? Entra' : 'Primo accesso? Crea la tua password';
    $('accesso-errore').hidden = true;
    $('accesso-info').hidden = true;
  }
  $('accesso-modo').addEventListener('click', () => modoAccesso(!primoAccesso));
  $('accesso-recupera').addEventListener('click', async () => {
    $('accesso-errore').hidden = true;
    $('accesso-info').hidden = true;
    if (!$('accesso-email').value) { $('accesso-email').focus(); $('accesso-errore').textContent = 'Scrivi prima la tua email.'; $('accesso-errore').hidden = false; return; }
    try {
      await DO.dati.recuperaPassword($('accesso-email').value);
    } catch (e) {
      const dove = e.info ? $('accesso-info') : $('accesso-errore');
      dove.textContent = e.message;
      dove.hidden = false;
    }
  });

  $('btn-esci').addEventListener('click', async () => {
    if (ferma) ferma();
    await DO.dati.esci();
    DO.dimentica();
    location.replace(location.pathname);
  });

  DO.avviaPagina('admin', (messaggio) => {
    if (ferma) { ferma(); ferma = null; }
    DO.avviso(messaggio, 'errore');
    entra();
  });
  DO.mostraDemo();
  entra();
})(window.DO);
