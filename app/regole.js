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

  // Altri impegni dello stesso giorno: 'doppio' se gli orari non si toccano, 'sovrapposto' se sì.
  function conflitto(e, altri, regole) {
    // un turno rifiutato o annullato non impegna l'operatore
    const stessoGiorno = altri.filter((x) => x.data === e.data && x.stato !== 'rifiutato' && x.stato !== 'annullato');
    if (!stessoGiorno.length) return { livello: '', con: [] };
    return { livello: stessoGiorno.some((x) => sovrapposti(e, x, regole)) ? 'sovrapposto' : 'doppio', con: stessoGiorno };
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
  // Modifica di un evento: orari da salvare e se la convocazione già inviata va rimandata.
  // Conta solo ciò che vede l'operatore (data, orario della partita, ritrovo, fine) calcolato prima e
  // dopo la modifica con le stesse regole: una nota non tocca gli orari salvati all'invio.
  function ricalcoloInvio(e, campi, regole) {
    const dopo = Object.assign({}, e, campi);
    const calcolati = { convocazioneCalcolata: convocazione(dopo, regole), fineCalcolata: fine(dopo, regole) };
    if (!e.inviata) return { cambiato: false, calcolati };
    const cambiato = dopo.data !== e.data
      || calcolati.convocazioneCalcolata !== convocazione(e, regole) || calcolati.fineCalcolata !== fine(e, regole)
      || (e.tipo !== 'supervisione' && (dopo.orario || '') !== (e.orario || ''));
    return { cambiato, calcolati: cambiato ? calcolati : null };
  }

  // Numero scritto in un campo delle impostazioni: vuoto, fuori limite o non intero (se richiesto) → null.
  function numero(valore, { min, max, intero = false }) {
    if (String(valore).trim() === '') return null;
    const n = Number(valore);
    if (!isFinite(n) || n < min || n > max || (intero && !Number.isInteger(n))) return null;
    return n;
  }

  // Esportazione mensile per l'operatività: solo presenze, nessun compenso.
  const NOMI_STATO = { 'da-assegnare': 'Da assegnare', assegnato: 'Da inviare', convocato: 'In attesa di risposta', confermato: 'Confermato', rifiutato: 'Rifiutato', annullato: 'Annullato' };
  function righeMese(eventi, operatori, regole, mese) {
    const op = (id) => operatori.find((o) => o.id === id) || null;
    const delMese = eventi.filter((e) => e.data.slice(0, 7) === mese)
      .sort((a, b) => (a.data + convocazione(a, regole)).localeCompare(b.data + convocazione(b, regole)));
    const convocazioni = [['Data', 'Tipo', 'Competizione', 'Round', 'Sport', 'Evento', 'Orario', 'Ritrovo', 'Fine turno', 'Operatore', 'Ruolo', 'Stato']]
      .concat(delMese.map((e) => {
        const o = op(e.operatoreId), sup = e.tipo === 'supervisione';
        return [e.data.slice(8) + '/' + e.data.slice(5, 7) + '/' + e.data.slice(0, 4), sup ? 'Supervisione' : 'Partita', e.competizione || '', e.round || '', e.sport || '',
          sup ? 'Supervisione' : e.titolo || '', e.orario || '', convocazione(e, regole), fine(e, regole), o ? o.nome : '', o ? o.ruolo : '', NOMI_STATO[e.stato] || e.stato];
      }));
    const conta = {};
    delMese.forEach((e) => {
      if (!e.operatoreId || !op(e.operatoreId)) return;
      const c = conta[e.operatoreId] = conta[e.operatoreId] || [0, 0, 0];
      if (e.stato === 'confermato') c[e.tipo === 'supervisione' ? 1 : 0]++;
      else if (e.stato === 'convocato') c[2]++;
    });
    const presenze = [['Operatore', 'Partite confermate', 'Supervisioni confermate', 'In attesa']]
      .concat(Object.keys(conta).filter((id) => conta[id].some(Boolean)).map((id) => [op(id).nome].concat(conta[id]))
        .sort((a, b) => a[0].localeCompare(b[0], 'it')));
    return { convocazioni, presenze };
  }

  const euro = (n) => (Math.round(n * 100) / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });

  // stagione sportiva: da agosto a luglio
  function stagione(isoData) {
    const [a, m] = isoData.split('-').map(Number);
    const inizio = m >= 8 ? a : a - 1;
    return { da: inizio + '-08-01', a: (inizio + 1) + '-07-31', nome: inizio + '/' + String(inizio + 1).slice(2) };
  }

  // riga di stato dei promemoria automatici, dalle impostazioni restituite dallo script delle email
  function statoPromemoria(imp) {
    if (!imp || imp.promemoriaAttivi === undefined) return 'Script delle email da aggiornare: i promemoria non sono ancora disponibili.';
    if (!imp.promemoriaProgrammato) return 'Invio giornaliero non attivo: esegui attivaPromemoria nello script delle email.';
    const u = imp.ultimoPromemoria;
    if (!u) return 'Nessun promemoria ancora inviato.';
    const d = new Date(u.quando);
    const fuso = { timeZone: 'Europe/Rome' };
    const quando = d.toLocaleDateString('it-IT', Object.assign({ weekday: 'short', day: 'numeric', month: 'long' }, fuso))
      + ' alle ' + d.toLocaleTimeString('it-IT', Object.assign({ hour: 'numeric', minute: '2-digit' }, fuso));
    const quanti = (n, uno, molti) => n + (n === 1 ? uno : molti);
    const partite = [u.riepilogo ? 'riepilogo ai supervisori' : '', u.operatori ? quanti(u.operatori, ' operatore', ' operatori') : ''].filter(Boolean).join(' + ');
    const cosa = partite || (u.inSospeso ? quanti(u.inSospeso, ' evento', ' eventi') + ' da sistemare, nessuna email partita' : 'niente in sospeso, nessuna email');
    return 'Ultimo promemoria: ' + quando + ' · ' + cosa + (u.nonInviate ? ' · ' + quanti(u.nonInviate, ' email non partita', ' email non partite') : '');
  }

  DO.regole = { PREDEFINITE, TIPI, complete, convocazione, fine, intervallo, sovrapposti, conflitto, ricalcoloInvio, numero, righeMese, notturno, competizione, uefa, conta, gettone, euro, stagione, minuti, hhmm, statoPromemoria };
})(window.DO = window.DO || {});
