/* Disponibilità Ops — regole operative e compensi (solo dashboard supervisori).
 * Le stesse regole del vecchio file Excel, senza i suoi errori: un solo punto di calcolo per
 * convocazioni, riepiloghi e importazione. I valori si cambiano da Impostazioni → Regole. */
(function (DO) {
  'use strict';

  const PREDEFINITE = {
    tariffe: {
      'P.IVA': { diurno: 140, notturno: 210, maggiorato: 210 },
      Coop: { diurno: 175, notturno: 262.5, maggiorato: 262.5 },
    },
    anticipoOre: 4,          // convocazione = orario dell'evento meno queste ore
    notteDa: '22:00',        // convocazioni da quest'ora…
    notteA: '06:00',         // …a quest'ora sono notturne
    sport: ['Calcio', 'Basket', 'Tennis', 'Volley', 'Rugby', 'Football Americano', 'Baseball', 'Cricket', 'Hockey su Prato', 'Hockey su Ghiaccio', 'Boxing'],
    // uefa: il gettone vale metà del diurno
    competizioni: [
      ['Serie A', 'Calcio'], ['Coppa Italia', 'Calcio'], ['Supercoppa Italiana', 'Calcio'], ['Ligue 1', 'Calcio'],
      ['Champions League', 'Calcio', true], ['Europa League', 'Calcio', true], ['Conference League', 'Calcio', true],
      ['Nations League', 'Calcio'], ['Nations League W', 'Calcio'], ['Wcq', 'Calcio'], ['European Qualfiers Women', 'Calcio'],
      ['Amichevoli', 'Calcio'], ['Nazionali', 'Calcio'], ['Dentsu', ''], ['Cev Women', 'Volley'], ['Cev Men', 'Volley'],
      ['Ebu Boxing', 'Boxing'], ['Bjkc', 'Tennis'], ['Ase', ''],
    ].map(([nome, sport, uefa]) => ({ nome, sport, uefa: !!uefa })),
  };

  const TIPI = {
    diurno: 'Diurno',
    notturno: 'Notturno',
    maggiorato: 'Maggiorato',
    uefa: 'UEFA (½ diurno)',
  };

  // le regole salvate possono mancare di qualche voce (es. dopo un aggiornamento): si completano
  function complete(r) {
    const x = Object.assign({}, PREDEFINITE, r || {});
    x.tariffe = {
      'P.IVA': Object.assign({}, PREDEFINITE.tariffe['P.IVA'], (r && r.tariffe && r.tariffe['P.IVA']) || {}),
      Coop: Object.assign({}, PREDEFINITE.tariffe.Coop, (r && r.tariffe && r.tariffe.Coop) || {}),
    };
    return x;
  }

  const minuti = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const hhmm = (min) => { const m = ((min % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

  // orario di ritrovo: quello scritto a mano se c'è, altrimenti orario dell'evento meno l'anticipo
  function convocazione(e, regole) {
    if (minuti(e.convocazione) !== null) return e.convocazione;
    const m = minuti(e.orario);
    return m === null ? '' : hhmm(m - complete(regole).anticipoOre * 60);
  }

  function notturno(e, regole) {
    const r = complete(regole), c = minuti(convocazione(e, r));
    if (c === null) return false;
    const da = minuti(r.notteDa), a = minuti(r.notteA);
    return da > a ? c >= da || c < a : c >= da && c < a;
  }

  const competizione = (nome, regole) => complete(regole).competizioni.find((c) => c.nome === nome) || null;
  const uefa = (nome, regole) => !!(competizione(nome, regole) || {}).uefa;

  // Un evento conta se ha un operatore e non è annullato.
  const conta = (e) => !!e.operatoreId && e.stato !== 'annullato';

  // Gettone di un evento: il maggiorato deciso dal supervisore vale su tutto;
  // poi le competizioni UEFA (metà del diurno); poi notturno o diurno secondo l'orario di convocazione.
  function gettone(e, operatore, regole) {
    const r = complete(regole);
    const t = r.tariffe[operatore && operatore.contratto] || null;
    let tipo = 'diurno';
    if (e.gettone === 'maggiorato') tipo = 'maggiorato';
    else if (uefa(e.competizione, r)) tipo = 'uefa';
    else if (notturno(e, r)) tipo = 'notturno';
    const importo = !t ? 0 : tipo === 'uefa' ? t.diurno / 2 : t[tipo];
    return { tipo, etichetta: TIPI[tipo], importo: Math.round(importo * 100) / 100, senzaContratto: !t };
  }

  // sempre col separatore delle migliaia (in italiano di norma manca sotto 10.000)
  const euro = (n) => (Math.round(n * 100) / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });

  // stagione sportiva: da agosto a luglio
  function stagione(isoData) {
    const [a, m] = isoData.split('-').map(Number);
    const inizio = m >= 8 ? a : a - 1;
    return { da: inizio + '-08-01', a: (inizio + 1) + '-07-31', nome: inizio + '/' + String(inizio + 1).slice(2) };
  }

  DO.regole = { PREDEFINITE, TIPI, complete, convocazione, notturno, competizione, uefa, conta, gettone, euro, stagione, minuti, hhmm };
})(window.DO = window.DO || {});
