/* Disponibilità Ops — dashboard dei supervisori: griglia settimanale, convocazioni, aggiornamenti, operatori. */
(function (DO) {
  'use strict';

  const $ = DO.$;
  const OGNI_QUANTO = 45000;   // controllo dei nuovi invii (ms)

  let oggi = DO.iso(new Date());
  let lun = DO.lunedi(oggi);
  let operatori = [], disp = {}, feed = [];
  let giornoSel = '', selezionati = new Set();
  let nonLetti = 0, ultimoVisto = '', timer = null, vista = 'griglia';

  const visibili = () => {
    const mansione = $('filtro-mansione').value, testo = $('filtro-testo').value.trim().toLowerCase();
    return operatori.filter((o) => o.attivo && (!mansione || o.mansione === mansione) && (!testo || (o.nome + ' ' + o.mansione).toLowerCase().includes(testo)))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  };
  const valore = (id, d) => (disp[id] && disp[id][d]) || { s: '', n: '' };
  const etichettaGiorno = (d) => { const g = DO.giorno(d); return g.nome + ' ' + g.num + ' ' + g.mese; };
  const nonLettiPer = () => new Set(feed.filter((x) => !x.letto).map((x) => x.operatoreId));

  // ---------- schede ----------
  function mostra(nome) {
    vista = nome;
    document.querySelectorAll('#schede [data-vista]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === nome)));
    ['griglia', 'aggiornamenti', 'operatori', 'impostazioni'].forEach((v) => { $('vista-' + v).hidden = v !== nome; });
    history.replaceState(null, '', nome === 'griglia' ? location.pathname : '#' + nome);
    if (nome === 'aggiornamenti') caricaFeed();
    if (nome === 'operatori') disegnaOperatori();
    if (nome === 'impostazioni') caricaImpostazioni();
  }
  $('schede').addEventListener('click', (e) => { const b = e.target.closest('[data-vista]'); if (b) mostra(b.dataset.vista); });

  // ---------- griglia ----------
  async function caricaGriglia() {
    $('sett-etichetta').textContent = DO.etichettaSettimana(lun);
    try {
      const r = await DO.chiama('panoramica', { da: lun, a: DO.aggiungi(lun, 6) });
      operatori = r.operatori;
      disp = r.disponibilita;
      oggi = r.oggi;
      impostaNonLetti(r.nonLetti);
      aggiornaMansioni();
      disegnaGriglia();
    } catch (e) {
      $('griglia').innerHTML = '<div class="griglia-vuota">' + DO.esc(e.message) + '</div>';
    }
  }

  function aggiornaMansioni() {
    const mansioni = [...new Set(operatori.map((o) => o.mansione).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
    const sel = $('filtro-mansione'), attuale = sel.value;
    sel.innerHTML = '<option value="">Tutte le mansioni</option>' + mansioni.map((m) => '<option>' + DO.esc(m) + '</option>').join('');
    sel.value = mansioni.includes(attuale) ? attuale : '';
    $('elenco-mansioni').innerHTML = mansioni.map((m) => '<option value="' + DO.esc(m) + '">').join('');
  }

  function disegnaGriglia() {
    const giorni = DO.settimana(lun), ops = visibili(), nuovi = nonLettiPer();
    $('sett-etichetta').textContent = DO.etichettaSettimana(lun);
    const risposto = ops.filter((o) => giorni.some((d) => valore(o.id, d).s)).length;
    $('sett-riepilogo').textContent = ops.length ? risposto + ' su ' + ops.length + ' hanno indicato le disponibilità' : '';
    $('sett-oggi').disabled = lun === DO.lunedi(oggi);
    if (!giorni.includes(giornoSel)) chiudiPannello();

    if (!operatori.some((o) => o.attivo)) {
      $('griglia').innerHTML = '<div class="griglia-vuota">Non ci sono ancora operatori attivi.<br><button type="button" class="link" data-vai="operatori">Aggiungili dalla scheda Operatori</button></div>';
      return;
    }
    if (!ops.length) { $('griglia').innerHTML = '<div class="griglia-vuota">Nessun operatore corrisponde ai filtri.</div>'; return; }

    const testa = giorni.map((d) => {
      const g = DO.giorno(d), conti = { D: 0, P: 0, A: 0 };
      ops.forEach((o) => { const s = valore(o.id, d).s; if (s) conti[s]++; });
      return '<th><button type="button" class="giorno-testa' + (d === oggi ? ' oggi' : '') + '" data-giorno="' + d + '" aria-pressed="' + (d === giornoSel) + '" title="Prepara la convocazione per ' + etichettaGiorno(d) + '">'
        + '<b>' + g.breve + ' ' + g.num + '</b><span class="conti"><span class="st-D" title="Disponibili">' + conti.D + '</span>'
        + '<span class="st-P" title="Parziali">' + conti.P + '</span><span class="st-A" title="Non disponibili">' + conti.A + '</span></span></button></th>';
    }).join('');

    const corpo = ops.map((o) => {
      const celle = giorni.map((d) => {
        const v = valore(o.id, d);
        const titolo = DO.nomeStato(v.s) + (v.n ? ' · ' + v.n : '') + (v.t ? '\nAggiornato ' + DO.quando(v.t) : '');
        const chip = v.s ? '<span class="chip st-' + v.s + '">' + DO.STATI[v.s].breve + (v.n ? '<span class="con-nota"></span>' : '') + '</span>'
          : '<span class="chip vuoto">' + (v.n ? 'Nota<span class="con-nota"></span>' : '—') + '</span>';
        return '<td class="' + (d === giornoSel ? 'selezionato' : '') + '" title="' + DO.esc(titolo) + '">' + chip + '</td>';
      }).join('');
      const sotto = [o.mansione, o.ultimoInvio ? 'inviato ' + DO.quando(o.ultimoInvio) : 'mai inviato'].filter(Boolean).join(' · ');
      return '<tr><td class="colonna-op"><div class="op-cella"><b>' + (nuovi.has(o.id) ? '<span class="nuovo" title="Aggiornamento non letto"></span>' : '')
        + DO.esc(o.nome) + '</b><small>' + DO.esc(sotto) + '</small></div></td>' + celle + '</tr>';
    }).join('');

    $('griglia').innerHTML = '<table class="griglia"><thead><tr><th class="colonna-op">Operatore</th>' + testa + '</tr></thead><tbody>' + corpo + '</tbody></table>';
  }

  $('griglia').addEventListener('click', (e) => {
    const b = e.target.closest('[data-giorno]');
    if (b) apriPannello(b.dataset.giorno === giornoSel ? '' : b.dataset.giorno);
    const vai = e.target.closest('[data-vai]');
    if (vai) mostra(vai.dataset.vai);
  });
  $('sett-prec').addEventListener('click', () => { lun = DO.aggiungi(lun, -7); caricaGriglia(); });
  $('sett-succ').addEventListener('click', () => { lun = DO.aggiungi(lun, 7); caricaGriglia(); });
  $('sett-oggi').addEventListener('click', () => { lun = DO.lunedi(oggi); caricaGriglia(); });
  $('btn-aggiorna').addEventListener('click', caricaGriglia);
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
      + (g.A.length ? sezione('st-A', 'Non disponibili', g.A, '<ul class="elenco-semplice">' + g.A.map((o) => '<li>' + DO.esc(o.nome) + '</li>').join('') + '</ul>') : '')
      + (g.vuoti.length ? sezione('', 'Senza risposta', g.vuoti, '<ul class="elenco-semplice">' + g.vuoti.map((o) => '<li>' + DO.esc(o.nome) + '</li>').join('')
        + '</ul><button type="button" class="link" id="conv-sollecito">Copia le email per un sollecito</button>') : '');
    aggiornaAzioniConv();
  }

  $('conv-corpo').addEventListener('change', (e) => {
    const id = e.target.dataset.op;
    if (!id) return;
    if (e.target.checked) selezionati.add(id); else selezionati.delete(id);
    aggiornaAzioniConv();
  });
  $('conv-corpo').addEventListener('click', (e) => {
    if (e.target.id !== 'conv-sollecito') return;
    const email = gruppi().vuoti.map((o) => o.email).filter(Boolean);
    if (!email.length) DO.avviso('Nessuna email registrata per chi non ha risposto.');
    else DO.copia(email.join(', '), email.length + ' email copiate.');
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

  // ---------- aggiornamenti ----------
  function impostaNonLetti(n) {
    nonLetti = n;
    $('badge').textContent = n ? String(n) : '';
    document.title = (n ? '(' + n + ') ' : '') + 'Supervisori · Disponibilità TGI Sport';
  }

  async function caricaFeed(silenzioso) {
    if (!silenzioso && !feed.length) $('feed').innerHTML = '<li class="caricamento"><span></span></li>';
    try {
      feed = await DO.chiama('aggiornamenti', { limite: 150 });
      impostaNonLetti(feed.filter((x) => !x.letto).length);
      disegnaFeed();
    } catch (e) {
      if (!silenzioso) $('feed').innerHTML = '<li class="griglia-vuota">' + DO.esc(e.message) + '</li>';
    }
  }

  function disegnaFeed() {
    if (!feed.length) { $('feed').innerHTML = '<li class="griglia-vuota">Nessun invio per ora.</li>'; return; }
    $('feed').innerHTML = feed.map((x) => {
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

  async function segnaLetti(ids) {
    try {
      const r = await DO.chiama('segnaLetti', ids ? { ids } : {});
      feed.forEach((x) => { if (!ids || ids.includes(x.id)) x.letto = true; });
      impostaNonLetti(r.nonLetti);
      disegnaFeed();
    } catch (e) {
      DO.avviso(e.message, 'errore');
    }
  }

  $('feed').addEventListener('click', (e) => {
    const letto = e.target.closest('[data-letto]');
    if (letto) segnaLetti([letto.dataset.letto]);
    const vedi = e.target.closest('[data-vedi]');
    if (vedi) {
      const x = feed.find((v) => v.id === vedi.dataset.vedi);
      if (!x.letto) segnaLetti([x.id]);
      const futuro = x.modifiche.map((m) => m.d).sort()[0];
      lun = DO.lunedi(futuro || oggi);
      $('filtro-mansione').value = '';
      $('filtro-testo').value = x.nome;
      mostra('griglia');
      caricaGriglia();
    }
  });
  $('btn-tutti-letti').addEventListener('click', () => segnaLetti(null));

  // Controllo periodico: se arriva un invio nuovo si aggiornano badge, griglia e feed.
  async function controlla() {
    try {
      const s = await DO.chiama('stato');
      const nuovo = s.ultimo && s.ultimo > ultimoVisto;
      impostaNonLetti(s.nonLetti);
      if (!nuovo) return;
      const primo = !ultimoVisto;
      const prima = ultimoVisto;
      ultimoVisto = s.ultimo;
      if (primo) return;
      await caricaFeed(true);
      const arrivati = feed.filter((x) => x.quando > prima);
      const nomi = [...new Set(arrivati.map((x) => x.nome))].join(', ');
      if (nomi) {
        DO.avviso('Nuovo aggiornamento da ' + nomi + '.', 'ok', 6000);
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
          new Notification('Disponibilità aggiornate', { body: nomi + ' ha inviato le disponibilità.', icon: 'app/favicon-180.png' });
        }
      }
      if (vista === 'griglia') caricaGriglia();
    } catch (e) { /* si riprova al prossimo giro */ }
  }

  function avviaControlli() {
    clearInterval(timer);
    controlla();
    timer = setInterval(controlla, OGNI_QUANTO);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && DO.sessione()) controlla(); });

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
    $('tabella-operatori').innerHTML = '<table class="tabella"><thead><tr><th>Operatore</th><th>Contatti</th><th>Stato</th><th>Ultimo invio</th><th></th></tr></thead><tbody>'
      + elenco.map((o) => '<tr class="' + (o.attivo ? '' : 'disattivo') + '">'
        + '<td><b>' + DO.esc(o.nome) + '</b><br><small style="color: var(--inchiostro-3)">' + DO.esc(o.mansione || '—') + '</small></td>'
        + '<td>' + DO.esc(o.email || '—') + '<br><small style="color: var(--inchiostro-3)">' + DO.esc(o.telefono || '') + '</small></td>'
        + '<td><span class="etichetta' + (o.attivo ? '' : ' spenta') + '">' + (o.attivo ? 'Attivo' : 'Disattivato') + '</span></td>'
        + '<td>' + (o.ultimoInvio ? DO.quando(o.ultimoInvio) : '<span style="color: var(--inchiostro-3)">mai</span>') + '</td>'
        + '<td class="azioni"><button type="button" class="bottone" data-modifica="' + o.id + '">Modifica</button> '
        + '<button type="button" class="bottone" data-codice="' + o.id + '">Nuovo codice</button> '
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
      const r = await DO.chiama('salvaOperatore', { operatore: {
        id: inModifica && inModifica.id, nome: $('op-nome').value, mansione: $('op-mansione').value,
        email: $('op-email').value, telefono: $('op-telefono').value, attivo: $('op-attivo').checked,
      } });
      const i = operatori.findIndex((o) => o.id === r.operatore.id);
      if (i >= 0) operatori[i] = r.operatore; else operatori.push(r.operatore);
      $('dlg-operatore').close();
      aggiornaMansioni();
      disegnaOperatori();
      disegnaGriglia();
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
    const link = new URL('index.html', location.href).href + '#codice=' + codice;
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
      if (!confirm('Generare un nuovo codice per ' + o.nome + '? Quello attuale smetterà di funzionare.')) return;
      try { mostraCodice(o, (await DO.chiama('nuovoCodice', { id: o.id })).codice); } catch (err) { DO.avviso(err.message, 'errore'); }
      return;
    }
    if (!confirm('Eliminare ' + o.nome + ' e tutte le sue disponibilità? Per sospenderlo e basta, usa Modifica → Attivo.')) return;
    try {
      await DO.chiama('eliminaOperatore', { id: o.id });
      operatori = operatori.filter((x) => x.id !== o.id);
      delete disp[o.id];
      aggiornaMansioni();
      disegnaOperatori();
      disegnaGriglia();
      DO.avviso(o.nome + ' eliminato.', 'ok');
    } catch (err) { DO.avviso(err.message, 'errore'); }
  });

  // ---------- impostazioni ----------
  async function caricaImpostazioni() {
    try {
      const r = await DO.chiama('leggiImpostazioni');
      $('imp-email').value = r.emailSupervisori.split(',').join(', ');
      $('imp-email-attive').checked = r.emailAttive;
    } catch (e) { DO.avviso(e.message, 'errore'); }
  }

  $('form-email').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await DO.chiama('salvaImpostazioni', {
        emailSupervisori: $('imp-email').value, emailAttive: $('imp-email-attive').checked,
        // il link nelle email porta a questa pagina, direttamente agli aggiornamenti
        urlAdmin: location.href.split('#')[0] + '#aggiornamenti',
      });
      DO.avviso('Impostazioni salvate.', 'ok');
    } catch (err) { DO.avviso(err.message, 'errore'); }
  });

  $('form-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('pw-nuova').value !== $('pw-conferma').value) { DO.avviso('Le due password nuove non coincidono.', 'errore'); return; }
    try {
      const r = await DO.chiama('cambiaPassword', { attuale: $('pw-attuale').value, nuova: $('pw-nuova').value });
      DO.aggiornaToken(r.token);
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
    if (!DO.sessione()) {
      await DO.chiediAccesso(async () => {
        const r = await DO.chiama('accedi', { ruolo: 'admin', password: $('accesso-password').value });
        DO.salvaSessione({ token: r.token }, $('accesso-ricorda').checked);
      });
    }
    $('pagina').hidden = false;
    $('schede').hidden = false;
    $('btn-esci').hidden = false;
    aggiornaBottoneNotifiche();
    const iniziale = location.hash.slice(1);
    await caricaGriglia();
    mostra(['aggiornamenti', 'operatori', 'impostazioni'].includes(iniziale) ? iniziale : 'griglia');
    if (vista !== 'aggiornamenti') caricaFeed(true);
    avviaControlli();
  }

  $('btn-esci').addEventListener('click', () => {
    DO.chiudiSessione();
    location.replace(location.pathname);
  });

  DO.avviaSessione('admin', (messaggio) => {
    clearInterval(timer);
    DO.avviso(messaggio, 'errore');
    entra();
  });
  DO.mostraDemo();
  entra();
})(window.DO);
