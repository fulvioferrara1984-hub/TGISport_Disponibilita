/* Disponibilità Ops — deployment on-site: calcoli usati da pagina operatori, dashboard, demo e riepiloghi.
 * Un deployment è una richiesta con giorni (attività, partita), posti TL/OP e chi ha accettato;
 * il compenso sta a parte (solo supervisori). Le presenze on-site si calcolano da qui, non si salvano. */
(function (DO) {
  'use strict';

  const ATTIVITA = ['Travel Day', 'MD-1', 'MD', 'MD+1'];
  const RUOLI = ['TL', 'OP'];
  const lista = (x) => (Array.isArray(x) ? x : []);
  const centesimi = (n) => Math.round(n * 100) / 100;

  // 4 giorni → Travel Day, MD-1, MD, Travel Day (si possono cambiare)
  function attivitaProposte(n) {
    if (n <= 0) return [];
    if (n === 1) return ['MD'];
    if (n === 2) return ['MD', 'Travel Day'];
    const prima = [];
    for (let k = n - 3; k >= 1; k--) prima.push('MD-' + k);
    return ['Travel Day'].concat(prima, ['MD', 'Travel Day']);
  }

  function giorniDa(da, a) {
    const out = [];
    for (let d = da; d <= a && out.length < 400; d = DO.aggiungi(d, 1)) out.push(d);
    return out;
  }

  // Dati della richiesta come arrivano dalla dashboard → scheda pulita, oppure un errore da mostrare
  function normalizza(d, oggi) {
    const testo = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    const visti = new Set();
    const giorni = lista(d.giorni)
      .filter((g) => g && /^\d{4}-\d{2}-\d{2}$/.test(g.data))
      .map((g) => ({ data: g.data, attivita: testo(g.attivita, 30), partita: testo(g.partita, 80) }))
      .sort((x, y) => x.data.localeCompare(y.data))
      .filter((g) => (visti.has(g.data) ? false : visti.add(g.data)));
    if (!giorni.length) throw new Error('Scegli almeno un giorno.');
    if (giorni.length > 31) throw new Error('Al massimo 31 giorni.');
    if (giorni[0].data <= oggi) throw new Error('Il deployment deve iniziare da domani in poi.');
    if (giorni.some((g) => !g.attivita)) throw new Error('Indica l\'attività di ogni giorno.');
    const luogo = testo(d.luogo, 80), sport = testo(d.sport, 40);
    if (!luogo) throw new Error('Scrivi il luogo.');
    if (!sport) throw new Error('Scrivi lo sport.');
    const posti = {};
    RUOLI.forEach((r) => {
      const n = Number(d.posti && d.posti[r] !== '' && d.posti[r] != null ? d.posti[r] : 0);
      if (!Number.isInteger(n) || n < 0 || n > 20) throw new Error('I posti vanno da 0 a 20.');
      posti[r] = n;
    });
    if (!posti.TL && !posti.OP) throw new Error('Indica almeno un posto.');
    return {
      titolo: testo(d.titolo, 120), luogo, sport, note: testo(d.note, 500),
      giorni, da: giorni[0].data, a: giorni[giorni.length - 1].data, posti,
    };
  }

  const compensoProposto = (nGiorni, tariffa) => centesimi(nGiorni * tariffa);

  const accettati = (d, r) => lista(d['accettati' + r]);

  function postiLiberi(d) {
    const out = {};
    RUOLI.forEach((r) => { out[r] = Math.max(0, Number((d.posti || {})[r] || 0) - accettati(d, r).length); });
    return out;
  }

  // "TL 1/1 · OP 1/2", più " · completo" quando non resta nessun posto
  function etichettaPosti(d) {
    const conPosti = RUOLI.filter((r) => Number((d.posti || {})[r] || 0) > 0);
    const liberi = postiLiberi(d);
    const parti = conPosti.map((r) => r + ' ' + accettati(d, r).length + '/' + d.posti[r]);
    return parti.join(' · ') + (conPosti.length && conPosti.every((r) => !liberi[r]) ? ' · completo' : '');
  }

  const ruoloAccettato = (d, id) => RUOLI.find((r) => accettati(d, r).includes(id)) || '';

  // { data: { id, luogo, sport, attivita, partita, ruolo } } dei deployment non annullati accettati da id
  function giorniOnsite(elenco, id) {
    const out = {};
    lista(elenco).forEach((d) => {
      const ruolo = d.stato === 'annullata' ? '' : ruoloAccettato(d, id);
      if (!ruolo) return;
      lista(d.giorni).forEach((g) => {
        out[g.data] = { id: d.id, luogo: d.luogo, sport: d.sport, attivita: g.attivita, partita: g.partita || '', ruolo };
      });
    });
    return out;
  }

  // giorni del deployment in cui ci sono già convocazioni remote negli stati indicati
  function conflittiRemoti(d, eventi, stati = ['convocato', 'confermato']) {
    const giorni = new Set(lista(d.giorni).map((g) => g.data));
    return Array.from(new Set(lista(eventi).filter((e) => giorni.has(e.data) && stati.includes(e.stato)).map((e) => e.data))).sort();
  }

  // Cosa vede l'operatore della richiesta (le stesse condizioni delle regole di Firestore)
  function statoPerOperatore(d, op, oggi) {
    if (ruoloAccettato(d, op.id)) return d.stato === 'annullata' ? 'annullato' : 'accettato';
    if (lista(d.esclusi).includes(op.id)) return 'escluso';
    if (d.stato !== 'aperta' || d.da <= oggi) return 'scaduta';
    const r = op.onsite;
    if (!RUOLI.includes(r) || !(Number((d.posti || {})[r] || 0) > 0)) return 'non-abilitato';
    if (!postiLiberi(d)[r]) return 'esaurito';
    if (lista(d.rifiuti).includes(op.id)) return 'rifiutato';
    return 'da-rispondere';
  }

  // Compenso diviso sui giorni e raggruppato per mese; l'ultimo mese prende il resto dei centesimi
  function quoteMese(d, importo) {
    const giorni = lista(d.giorni);
    const perMese = {};
    giorni.forEach((g) => { perMese[g.data.slice(0, 7)] = (perMese[g.data.slice(0, 7)] || 0) + 1; });
    const mesi = Object.keys(perMese).sort();
    const out = {};
    let assegnato = 0;
    mesi.forEach((m, i) => {
      out[m] = i === mesi.length - 1 ? centesimi(importo - assegnato) : centesimi(importo * perMese[m] / giorni.length);
      assegnato += out[m];
    });
    return out;
  }

  // "12 ottobre", "12–15 ottobre", "30 ottobre – 2 novembre"
  function periodoBreve(da, a) {
    const x = DO.giorno(da), y = DO.giorno(a);
    if (da === a) return x.num + ' ' + x.mese;
    if (x.mese === y.mese && x.anno === y.anno) return x.num + '–' + y.num + ' ' + y.mese;
    return x.num + ' ' + x.mese + ' – ' + y.num + ' ' + y.mese;
  }

  // perché l'operatore non può accettare (dagli stati di statoPerOperatore)
  const MESSAGGI = {
    accettato: 'Hai già accettato.',
    annullato: 'Il deployment è annullato.',
    escluso: 'Il supervisore ti ha tolto da questo deployment.',
    scaduta: 'La richiesta non accetta più risposte.',
    'non-abilitato': 'Non sei abilitato per i posti di questa richiesta.',
    esaurito: 'Posti esauriti',
  };

  function compensoValido(v) {
    const n = v === '' || v == null ? NaN : Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error('Compenso non valido.');
    return centesimi(n);
  }

  // Campi che il supervisore può cambiare dopo l'invio (mai le date), già puliti e controllati
  function modifiche(d, campi) {
    const out = {};
    const testo = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    if (campi.titolo !== undefined) out.titolo = testo(campi.titolo, 120);
    if (campi.note !== undefined) out.note = testo(campi.note, 500);
    if (campi.luogo !== undefined) { out.luogo = testo(campi.luogo, 80); if (!out.luogo) throw new Error('Scrivi il luogo.'); }
    if (campi.sport !== undefined) { out.sport = testo(campi.sport, 40); if (!out.sport) throw new Error('Scrivi lo sport.'); }
    if (campi.posti !== undefined) {
      const posti = {};
      RUOLI.forEach((r) => {
        const n = Number(campi.posti[r] === '' || campi.posti[r] == null ? 0 : campi.posti[r]);
        if (!Number.isInteger(n) || n < 0 || n > 20) throw new Error('I posti vanno da 0 a 20.');
        posti[r] = n;
      });
      if (!posti.TL && !posti.OP) throw new Error('Indica almeno un posto.');
      if (RUOLI.some((r) => posti[r] < accettati(d, r).length)) throw new Error('I posti non possono essere meno di chi ha già accettato.');
      out.posti = posti;
    }
    if (campi.destinatariAggiunti !== undefined) out.destinatari = Array.from(new Set(lista(d.destinatari).concat(lista(campi.destinatariAggiunti))));
    return out;
  }

  DO.onsite = {
    ATTIVITA, MESSAGGI, attivitaProposte, giorniDa, normalizza, compensoProposto, compensoValido, modifiche, postiLiberi, etichettaPosti,
    ruoloAccettato, giorniOnsite, conflittiRemoti, statoPerOperatore, quoteMese, periodoBreve,
  };
})(window.DO = window.DO || {});
