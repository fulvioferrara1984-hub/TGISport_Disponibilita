/* Disponibilità Ops — scheda Riepilogo: eventi coperti e compensi netti per operatore, competizione e mese.
 * Prende il posto dei fogli "Riepilogo" e "Consultivo mensile" del file Excel (senza la parte fatture).
 * Contano solo gli eventi con un operatore e non annullati. */
(function (DO) {
  'use strict';

  const $ = DO.$, A = DO.admin, R = DO.regole;
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const TIPI = ['diurno', 'notturno', 'maggiorato', 'uefa'];

  function periodi() {
    const st = R.stagione(DO.oggi()), out = [{ id: 'stagione', nome: 'Stagione ' + st.nome, da: st.da, a: st.a }];
    for (let i = 0; i < 12; i++) {
      const d = DO.daIso(st.da);
      d.setMonth(d.getMonth() + i);
      const inizio = DO.iso(d), fine = DO.iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      out.push({ id: inizio.slice(0, 7), nome: MESI[d.getMonth()] + ' ' + d.getFullYear(), da: inizio, a: fine });
    }
    return out;
  }
  const periodo = () => periodi().find((p) => p.id === $('rie-periodo').value) || periodi()[0];

  // Ogni evento che conta, con il suo gettone calcolato.
  function righe(p) {
    return A.eventi.filter((e) => R.conta(e) && e.data >= p.da && e.data <= p.a).map((e) => {
      const o = A.operatori.find((x) => x.id === e.operatoreId) || { nome: '(operatore rimosso)', contratto: '' };
      return Object.assign({}, e, { op: o, g: R.gettone(e, o, A.regole) });
    });
  }

  function somma(lista) {
    const t = { n: lista.length, euro: 0, sup: 0 };
    TIPI.forEach((k) => { t[k] = 0; t['e_' + k] = 0; });
    lista.forEach((r) => {
      t[r.g.tipo]++;
      t['e_' + r.g.tipo] += r.g.importo;
      t.euro += r.g.importo;
      if (r.tipo === 'supervisione') t.sup++;
    });
    return t;
  }

  const num = (n) => (n ? String(n) : '<span class="tenue">0</span>');
  const eur = (n) => (n ? R.euro(n) : '<span class="tenue">–</span>');
  // nelle tabelle larghe: senza ",00" quando l'importo è intero
  const eurBreve = (n) => (!n ? '<span class="tenue">–</span>' : Number.isInteger(Math.round(n * 100) / 100)
    ? n.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 }) + ' €' : R.euro(n));

  function disegna() {
    if (A.vista !== 'riepilogo') return;
    const sel = $('rie-periodo'), attuale = sel.value;
    sel.innerHTML = periodi().map((p) => '<option value="' + p.id + '">' + p.nome + '</option>').join('');
    sel.value = attuale || 'stagione';
    const p = periodo(), lista = righe(p), tot = somma(lista);
    const futuri = A.eventi.filter((e) => e.data >= DO.oggi() && e.data <= p.a && e.stato === 'da-assegnare').length;
    const senzaContratto = [...new Set(lista.filter((r) => r.g.senzaContratto).map((r) => r.op.nome))];

    // per operatore
    const ops = A.operatori.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
      .map((o) => ({ o, t: somma(lista.filter((r) => r.operatoreId === o.id)) })).filter((x) => x.t.n || x.o.attivo);
    const tabOp = '<table class="tabella numeri"><thead><tr><th>Operatore</th><th class="sx">Ruolo</th><th class="sx">Contratto</th><th>Diurni</th><th>Notturni</th><th>Maggiorati</th><th>UEFA ½</th><th>di cui supervisione</th><th>Totale eventi</th><th>Netto</th></tr></thead><tbody>'
      + ops.map(({ o, t }) => '<tr><td><b>' + DO.esc(o.nome) + '</b></td><td class="sx">' + o.ruolo + '</td><td class="sx">' + (o.contratto || '<span class="testo-errore">da indicare</span>') + '</td>'
        + TIPI.map((k) => '<td>' + num(t[k]) + '</td>').join('') + '<td>' + num(t.sup) + '</td><td><b>' + num(t.n) + '</b></td><td><b>' + eur(t.euro) + '</b></td></tr>').join('')
      + '</tbody><tfoot><tr><td>Totale</td><td></td><td></td>' + TIPI.map((k) => '<td>' + tot[k] + '</td>').join('') + '<td>' + tot.sup + '</td><td>' + tot.n + '</td><td>' + R.euro(tot.euro) + '</td></tr></tfoot></table>';

    // per competizione: eventi coperti, da assegnare e annullati a parte
    const nelPeriodo = A.eventi.filter((e) => e.data >= p.da && e.data <= p.a);
    const comps = [...new Set(nelPeriodo.map((e) => e.competizione || '(senza competizione)'))].sort((a, b) => a.localeCompare(b, 'it'));
    const tabComp = '<table class="tabella numeri"><thead><tr><th>Competizione</th><th>Eventi coperti</th><th>di cui supervisione</th><th>Da assegnare</th><th>Annullati</th><th>Netto P.IVA</th><th>Netto Coop</th><th>Totale netto</th></tr></thead><tbody>'
      + comps.map((c) => {
        const qui = lista.filter((r) => (r.competizione || '(senza competizione)') === c), tutti = nelPeriodo.filter((e) => (e.competizione || '(senza competizione)') === c);
        const piva = qui.filter((r) => r.op.contratto === 'P.IVA').reduce((s, r) => s + r.g.importo, 0), coop = qui.filter((r) => r.op.contratto === 'Coop').reduce((s, r) => s + r.g.importo, 0);
        return '<tr><td><b>' + DO.esc(c) + '</b>' + (R.uefa(c, A.regole) ? ' <span class="tag">UEFA ½</span>' : '') + '</td><td><b>' + num(qui.length) + '</b></td><td>' + num(qui.filter((r) => r.tipo === 'supervisione').length) + '</td>'
          + '<td>' + num(tutti.filter((e) => e.stato === 'da-assegnare').length) + '</td><td>' + num(tutti.filter((e) => e.stato === 'annullato').length) + '</td>'
          + '<td>' + eur(piva) + '</td><td>' + eur(coop) + '</td><td><b>' + eur(piva + coop) + '</b></td></tr>';
      }).join('') + '</tbody><tfoot><tr><td>Totale</td><td>' + tot.n + '</td><td>' + tot.sup + '</td><td></td><td></td>'
      + '<td>' + R.euro(lista.filter((r) => r.op.contratto === 'P.IVA').reduce((s, r) => s + r.g.importo, 0)) + '</td><td>' + R.euro(lista.filter((r) => r.op.contratto === 'Coop').reduce((s, r) => s + r.g.importo, 0)) + '</td><td>' + R.euro(tot.euro) + '</td></tr></tfoot></table>';

    // per mese (solo sulla stagione): netto di ogni operatore mese per mese
    let tabMese = '';
    if (p.id === 'stagione') {
      const mesi = periodi().slice(1);
      tabMese = '<section class="scheda"><div class="scheda-testa"><h2>Netto per mese</h2></div><div class="tabella-box"><table class="tabella numeri compatta ampia"><thead><tr><th>Operatore</th>'
        + mesi.map((m) => '<th>' + m.nome.slice(0, 3) + ' ' + m.nome.slice(-2) + '</th>').join('') + '<th>Totale</th></tr></thead><tbody>'
        + ops.filter((x) => x.t.n).map(({ o, t }) => '<tr><td><b>' + DO.esc(o.nome) + '</b></td>' + mesi.map((m) => {
          const qui = lista.filter((r) => r.operatoreId === o.id && r.data >= m.da && r.data <= m.a);
          return '<td title="' + qui.length + ' eventi">' + eurBreve(qui.reduce((s, r) => s + r.g.importo, 0)) + '</td>';
        }).join('') + '<td><b>' + eurBreve(t.euro) + '</b></td></tr>').join('')
        + '</tbody><tfoot><tr><td>Totale</td>' + mesi.map((m) => '<td>' + eurBreve(lista.filter((r) => r.data >= m.da && r.data <= m.a).reduce((s, r) => s + r.g.importo, 0)) + '</td>').join('')
        + '<td>' + eurBreve(tot.euro) + '</td></tr></tfoot></table></div></section>';
    }

    // operatori × competizioni
    const opsAttivi = ops.filter((x) => x.t.n);
    const tabIncrocio = opsAttivi.length ? '<section class="scheda"><div class="scheda-testa"><h2>Eventi per operatore e competizione</h2></div><div class="tabella-box"><table class="tabella numeri compatta ampia"><thead><tr><th>Competizione</th>'
      + opsAttivi.map(({ o }) => '<th>' + DO.esc(o.nome.split(' ')[0]) + ' ' + DO.esc((o.nome.split(' ')[1] || '').slice(0, 1)) + '.</th>').join('') + '<th>Totale</th></tr></thead><tbody>'
      + comps.filter((c) => lista.some((r) => (r.competizione || '(senza competizione)') === c)).map((c) => '<tr><td><b>' + DO.esc(c) + '</b></td>' + opsAttivi.map(({ o }) =>
        '<td>' + num(lista.filter((r) => r.operatoreId === o.id && (r.competizione || '(senza competizione)') === c).length) + '</td>').join('')
        + '<td><b>' + lista.filter((r) => (r.competizione || '(senza competizione)') === c).length + '</b></td></tr>').join('')
      + '</tbody></table></div></section>' : '';

    $('rie-contenuto').innerHTML = '<div class="kpi">'
      + '<div><span>Eventi coperti</span><b>' + tot.n + '</b></div>'
      + '<div><span>di cui supervisione</span><b>' + tot.sup + '</b></div>'
      + '<div><span>Netto totale</span><b>' + R.euro(tot.euro) + '</b></div>'
      + '<div><span>Ancora da assegnare</span><b>' + futuri + '</b></div></div>'
      + (senzaContratto.length ? '<p class="errore">Contratto non indicato per ' + senzaContratto.map(DO.esc).join(', ') + ': i loro eventi non hanno compenso. Indicalo nella scheda Operatori.</p>' : '')
      + '<section class="scheda"><div class="scheda-testa"><h2>Per operatore</h2></div><div class="tabella-box">' + tabOp + '</div></section>'
      + '<section class="scheda"><div class="scheda-testa"><h2>Per competizione</h2></div><div class="tabella-box">' + tabComp + '</div></section>'
      + tabMese + tabIncrocio;
  }

  $('rie-periodo').addEventListener('change', disegna);

  // ---------- esportazione in Excel ----------
  let libreria = null;
  function caricaXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!libreria) {
      libreria = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = () => ok(window.XLSX);
        s.onerror = () => { libreria = null; ko(new Error('Non riesco a caricare la libreria Excel: controlla la connessione.')); };
        document.head.appendChild(s);
      });
    }
    return libreria;
  }
  DO.caricaXlsx = caricaXlsx;

  $('rie-excel').addEventListener('click', async () => {
    let X;
    try { X = await caricaXlsx(); } catch (e) { DO.avviso(e.message, 'errore'); return; }
    const p = periodo(), lista = righe(p).sort((a, b) => a.data.localeCompare(b.data));
    const wb = X.utils.book_new();
    const conv = [['Data', 'Tipo', 'Competizione', 'Round', 'Sport', 'Evento', 'Orario', 'Ritrovo', 'Operatore', 'Ruolo', 'Contratto', 'Stato', 'Gettone', 'Netto', 'Note']]
      .concat(A.eventi.filter((e) => e.data >= p.da && e.data <= p.a).sort((a, b) => a.data.localeCompare(b.data)).map((e) => {
        const o = A.operatori.find((x) => x.id === e.operatoreId);
        const g = R.conta(e) && o ? R.gettone(e, o, A.regole) : null;
        return [e.data, e.tipo === 'supervisione' ? 'Supervisione' : 'Partita', e.competizione, e.round, e.sport, e.tipo === 'supervisione' ? 'Supervisione' : e.titolo,
          e.orario, R.convocazione(e, A.regole), o ? o.nome : '', o ? o.ruolo : '', o ? o.contratto : '', e.stato, g ? g.etichetta : '', g ? g.importo : 0, e.note || ''];
      }));
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(conv), 'Convocazioni');
    const perOp = [['Operatore', 'Ruolo', 'Contratto', 'Diurni', 'Notturni', 'Maggiorati', 'UEFA ½', 'di cui supervisione', 'Totale eventi', 'Netto']];
    A.operatori.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it')).forEach((o) => {
      const t = somma(lista.filter((r) => r.operatoreId === o.id));
      if (t.n) perOp.push([o.nome, o.ruolo, o.contratto, t.diurno, t.notturno, t.maggiorato, t.uefa, t.sup, t.n, Math.round(t.euro * 100) / 100]);
    });
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(perOp), 'Per operatore');
    const perComp = [['Competizione', 'Eventi coperti', 'Netto P.IVA', 'Netto Coop', 'Totale netto']];
    [...new Set(lista.map((r) => r.competizione || '(senza competizione)'))].sort().forEach((c) => {
      const qui = lista.filter((r) => (r.competizione || '(senza competizione)') === c);
      const piva = qui.filter((r) => r.op.contratto === 'P.IVA').reduce((s, r) => s + r.g.importo, 0), coop = qui.filter((r) => r.op.contratto === 'Coop').reduce((s, r) => s + r.g.importo, 0);
      perComp.push([c, qui.length, piva, coop, piva + coop]);
    });
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(perComp), 'Per competizione');
    if (p.id === 'stagione') {
      const mesi = periodi().slice(1);
      const perMese = [['Operatore'].concat(mesi.map((m) => m.nome), ['Totale'])];
      A.operatori.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it')).forEach((o) => {
        const qui = lista.filter((r) => r.operatoreId === o.id);
        if (qui.length) perMese.push([o.nome].concat(mesi.map((m) => qui.filter((r) => r.data >= m.da && r.data <= m.a).reduce((s, r) => s + r.g.importo, 0)), [qui.reduce((s, r) => s + r.g.importo, 0)]));
      });
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(perMese), 'Netto per mese');
    }
    X.writeFile(wb, 'Riepilogo_' + p.nome.replace(/[^\w]+/g, '_') + '.xlsx');
  });

  A.registra({ aggiorna: disegna, mostra: (nome) => { if (nome === 'riepilogo') disegna(); } });
})(window.DO);
