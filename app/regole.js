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
    fineOre: 2,              // fine turno = orario dell'evento più queste ore
    durataSupervisioneOre: 6, // fine della supervisione = ritrovo più queste ore
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
    ].map(([nome, sport, uefa]) => ({ nome, sport, uefa: !!uefa, prima: null, dopo: null })),
  };

  const TIPI = {
    diurno: 'Diurno',
    notturno: 'Notturno',
    maggiorato: 'Maggiorato',
    uefa: 'UEFA (½ diurno)',
  };

  const ore = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

  // le regole salvate possono mancare di qualche voce (es. dopo un aggiornamento): si completano
  function complete(r) {
    const x = Object.assign({}, PREDEFINITE, r || {});
    // prima/dopo per competizione: vuoti = valori generali
    x.competizioni = x.competizioni.map((c) => Object.assign({}, c, { prima: ore(c.prima), dopo: ore(c.dopo) }));
    x.tariffe = {
      'P.IVA': Object.assign({}, PREDEFINITE.tariffe['P.IVA'], (r && r.tariffe && r.tariffe['P.IVA']) || {}),
      Coop: Object.assign({}, PREDEFINITE.tariffe.Coop, (r && r.tariffe && r.tariffe.Coop) || {}),
    };
    return x;
  }

  const minuti = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const hhmm = (min) => { const m = ((min % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

  // Ritrovo: scritto a mano; altrimenti orario dell'evento meno le ore della competizione (o generali).
  // La supervisione non segue mai la competizione: le importate hanno solo l'orario di riferimento.
  function convocazione(e, regole) {
    if (minuti(e.convocazione) !== null) return e.convocazione;
    const r = complete(regole), m = minuti(e.orario);
    if (m === null) return '';
    const comp = e.tipo === 'supervisione' ? null : competizione(e.competizione, r);
    return hhmm(m - (comp && comp.prima !== null ? comp.prima : r.anticipoOre) * 60);
  }

  // Fine turno: scritta a mano; supervisione = ritrovo + durata; partita = orario + ore della competizione (o generali).
  function fine(e, regole) {
    if (minuti(e.fine) !== null) return e.fine;
    const r = complete(regole);
    if (e.tipo === 'supervisione') {
      const inizio = minuti(convocazione(e, r));
      return inizio === null ? '' : hhmm(inizio + r.durataSupervisioneOre * 60);
    }
    const m = minuti(e.orario);
    if (m === null) return '';
    const comp = competizione(e.competizione, r);
    return hhmm(m + (comp && comp.dopo !== null ? comp.dopo : r.fineOre) * 60);
  }

  // Intervallo del turno in minuti dalla mezzanotte; una fine mancante o oltre la mezzanotte vale fine giornata.
  function intervallo(e, regole) {
    const inizio = minuti(convocazione(e, regole)), f = minuti(fine(e, regole));
    const da = inizio === null ? 0 : inizio;
    return { inizio: da, fine: f === null || f <= da ? 1439 : f };
  }

  function sovrapposti(a, b, regole) {
    if (a.data !== b.data) return false;
    const x = intervallo(a, regole), y = intervallo(b, regole);
    return x.inizio < y.fine && y.inizio < x.fine;
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

  DO.regole = { PREDEFINITE, TIPI, complete, convocazione, fine, intervallo, sovrapposti, notturno, competizione, uefa, conta, gettone, euro, stagione, minuti, hhmm };
})(window.DO = window.DO || {});
