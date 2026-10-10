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
    tariffaOnsite: 150,      // on-site: € al giorno per persona (4 giorni = 600 €)
    anticipoOre: 4,          // convocazione = orario dell'evento meno queste ore
    fineOre: 2,              // fine turno = orario dell'evento più queste ore
    durataSupervisioneOre: 6, // fine della supervisione = ritrovo più queste ore
    notteDa: '22:00',        // convocazioni da quest'ora…
    notteA: '06:00',         // …a quest'ora sono notturne
    sport: ['Calcio', 'Basket', 'Tennis', 'Volley', 'Rugby', 'Football Americano', 'Baseball', 'Cricket', 'Hockey su Prato', 'Hockey su Ghiaccio', 'Boxing'],
    // compenso: diurno (notturno se il ritrovo è di notte), notturno, maggiorato, dimezzato (metà del diurno)
    competizioni: [
      ['Serie A', 'Calcio'], ['Coppa Italia', 'Calcio'], ['Supercoppa Italiana', 'Calcio'], ['Ligue 1', 'Calcio'],
      ['Champions League', 'Calcio', true], ['Europa League', 'Calcio', true], ['Conference League', 'Calcio', true],
      ['Nations League', 'Calcio'], ['Nations League W', 'Calcio'], ['Wcq', 'Calcio'], ['European Qualfiers Women', 'Calcio'],
      ['Amichevoli', 'Calcio'], ['Nazionali', 'Calcio'], ['Dentsu', ''], ['Cev Women', 'Volley'], ['Cev Men', 'Volley'],
      ['Ebu Boxing', 'Boxing'], ['Bjkc', 'Tennis'], ['Ase', ''],
    ].map(([nome, sport, dimezzato]) => ({ nome, sport, compenso: dimezzato ? 'dimezzato' : 'diurno', prima: null, dopo: null })),
  };

  const TIPI = {
    diurno: 'Diurno',
    notturno: 'Notturno',
    maggiorato: 'Maggiorato',
    dimezzato: 'Dimezzato (½ diurno)',
  };

  const ore = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  // solo i quattro tipi (un valore come «toString» non conta)
  const tipoValido = (t) => Object.prototype.hasOwnProperty.call(TIPI, t);
  // Remote TL e Remote Support: righe fisse in cima a «Competizioni e sport», da cui i turni prendono colore,
  // compenso e durata (ore dopo il ritrovo); «ore prima» per loro vale sempre 0
  const RIGHE_MANSIONE = ['Remote TL', 'Remote Support'];
  const durataValida = (v) => (typeof v === 'number' && isFinite(v) && v >= 0.5 && v <= 16 ? v : null);

  // le regole salvate possono mancare di qualche voce (es. dopo un aggiornamento): si completano
  function complete(r) {
    const x = Object.assign({}, PREDEFINITE, r || {});
    // prima/dopo per competizione: vuoti = valori generali
    // competizioni salvate prima del tipo di compenso: la vecchia casella «UEFA ½» (campo uefa, non più scritto) diventa «dimezzato»
    // competizioni senza ore (salvate quando c'erano i valori generali): si completano con quelli usati finora
    const anticipo = ore(x.anticipoOre) === null ? PREDEFINITE.anticipoOre : x.anticipoOre;
    const dopoGenerale = ore(x.fineOre) === null ? PREDEFINITE.fineOre : x.fineOre;
    const salvate = Array.isArray(x.competizioni) ? x.competizioni : [];
    const mansioni = RIGHE_MANSIONE.map((nome) => {
      const s = salvate.find((c) => c.nome === nome) || {};
      const predefinita = nome === 'Remote TL' ? durataValida(x.durataSupervisioneOre) || 6 : 6;
      const compenso = tipoValido(s.compenso) ? s.compenso : 'diurno';
      return { nome, mansione: true, sport: '', prima: 0, dopo: durataValida(s.dopo) || predefinita, compenso, colore: coloreValido(s.colore) };
    });
    x.competizioni = mansioni.concat(salvate.filter((c) => !RIGHE_MANSIONE.includes(c.nome)).map(({ uefa, mansione, ...c }) => {
      const compenso = tipoValido(c.compenso) ? c.compenso : uefa && c.compenso === undefined ? 'dimezzato' : 'diurno';
      const prima = ore(c.prima), dopo = ore(c.dopo);
      return Object.assign({}, c, { prima: prima === null ? anticipo : prima, dopo: dopo === null ? dopoGenerale : dopo, colore: coloreValido(c.colore), compenso });
    }));
    x.tariffe = {
      'P.IVA': Object.assign({}, PREDEFINITE.tariffe['P.IVA'], (r && r.tariffe && r.tariffe['P.IVA']) || {}),
      Coop: Object.assign({}, PREDEFINITE.tariffe.Coop, (r && r.tariffe && r.tariffe.Coop) || {}),
    };
    if (!(Number.isFinite(x.tariffaOnsite) && x.tariffaOnsite >= 0)) x.tariffaOnsite = PREDEFINITE.tariffaOnsite;
    return x;
  }

  const minuti = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const hhmm = (min) => { const m = ((min % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

  // Ritrovo: scritto a mano; altrimenti orario dell'evento meno le ore della competizione (o generali).
  // I turni remoti hanno sempre il ritrovo scritto; quelli importati dal file della stagione hanno solo
  // l'orario di riferimento e partono, come sempre, dall'anticipo generale.
  function convocazione(e, regole) {
    if (minuti(e.convocazione) !== null) return e.convocazione;
    const r = complete(regole), m = minuti(e.orario);
    if (m === null) return '';
    const comp = DO.turnoRemoto(e.tipo) ? null : competizione(e.competizione, r);
    return hhmm(m - (comp && comp.prima !== null ? comp.prima : r.anticipoOre) * 60);
  }

  // Fine turno: scritta a mano; turno remoto = ritrovo + durata della sua mansione; partita = orario + ore della competizione.
  function fine(e, regole) {
    if (minuti(e.fine) !== null) return e.fine;
    const r = complete(regole);
    if (DO.turnoRemoto(e.tipo)) {
      const inizio = minuti(convocazione(e, r));
      return inizio === null ? '' : hhmm(inizio + competizione(DO.mansione(e.tipo), r).dopo * 60);
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
  // ruoli remoti come si mostrano (nei dati 'OP' / 'SUP' / 'TL'; un valore sconosciuto vale Remote OP)
  const nomeRuolo = (ruolo) => DO.RUOLI[ruolo === 'TL' || ruolo === 'SUP' ? ruolo : 'OP'];
  // ogni ruolo comprende quelli sotto: Remote OP < Remote Support < Remote TL
  function puoFare(ruolo, tipo) {
    if (tipo === 'supervisione') return ruolo === 'TL';
    if (tipo === 'support') return ruolo === 'SUP' || ruolo === 'TL';
    return true;
  }
  const sceltaOperatore = (tipo) => (tipo === 'supervisione' ? '— Scegli un Remote TL —' : tipo === 'support' ? '— Scegli un Remote Support o Remote TL —' : '— Scegli operatore —');
  // operatori attivi che possono fare l'evento, più quello già assegnato (anche se nel frattempo ha cambiato ruolo)
  const assegnabili = (operatori, e) => operatori.filter((o) => (!!e.operatoreId && o.id === e.operatoreId) || (o.attivo && puoFare(o.ruolo, e.tipo)));
  // per un turno remoto conta la mansione, qualunque competizione abbia (i vecchi turni di supervisione ne avevano una)
  const competizioneDi = (e) => DO.mansione(e.tipo) || e.competizione || '';
  const nomeTipo = (tipo) => DO.mansione(tipo) || 'Partita';
  const compensoCompetizione = (nome, regole) => (competizione(nome, regole) || {}).compenso || 'diurno';

  // Colori delle competizioni: quello scelto nelle impostazioni, altrimenti uno della tavolozza ricavato dal nome
  const PALETTE = ['#2563eb', '#0d9488', '#c2410c', '#be185d', '#4d7c0f', '#0369a1', '#a16207', '#7c2d12', '#b91c1c', '#15803d', '#475569', '#0891b2'];
  function coloreValido(c) { return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : ''; }
  function coloreCompetizione(nome, regole) {
    if (!nome) return '#94a3b8';
    const scelto = coloreValido((competizione(nome, regole) || {}).colore);
    if (scelto) return scelto;
    let h = 0;
    // moltiplicatore scelto perché le competizioni principali (Serie A, coppe, UEFA, Nations League) abbiano colori diversi
    for (const ch of String(nome)) h = (h * 37 + ch.charCodeAt(0)) % 1000003;
    return PALETTE[h % PALETTE.length];
  }

  // Colore di stato nel calendario mensile ('' = non si mostra)
  function statoCalendario(e, oggi, giorniBlocco) {
    if (e.stato === 'annullato') return '';
    if (e.stato === 'confermato' && !e.daSostituire) return 'verde';
    if (e.operatoreId && (e.stato === 'assegnato' || e.stato === 'convocato') && !e.daSostituire) return 'blu';
    return DO.bloccato(e.data, oggi, giorniBlocco) ? 'rosso' : 'arancione';
  }

  // Un evento conta se ha un operatore e non è annullato.
  const conta = (e) => !!e.operatoreId && e.stato !== 'annullato';

  // Gettone di un evento: il maggiorato deciso dal supervisore vale su tutto;
  // poi il tipo della competizione (o della mansione per i turni remoti).
  function gettone(e, operatore, regole) {
    const r = complete(regole);
    const t = r.tariffe[operatore && operatore.contratto] || null;
    // ordine: maggiorato sull'evento, poi il tipo della competizione; «diurno» diventa notturno se il ritrovo è di notte
    const comp = compensoCompetizione(competizioneDi(e), r);
    let tipo = 'diurno';
    if (e.gettone === 'maggiorato' || comp === 'maggiorato') tipo = 'maggiorato';
    else if (comp === 'dimezzato') tipo = 'dimezzato';
    else if (comp === 'notturno' || notturno(e, r)) tipo = 'notturno';
    const importo = !t ? 0 : tipo === 'dimezzato' ? t.diurno / 2 : t[tipo];
    return { tipo, etichetta: TIPI[tipo], importo: Math.round(importo * 100) / 100, senzaContratto: !t };
  }

  // Modifica di un evento: orari da salvare e se la convocazione già inviata va rimandata.
  // Conta solo ciò che vede l'operatore (data, orario della partita, ritrovo, fine) calcolato prima e
  // dopo la modifica con le stesse regole: una nota non tocca gli orari salvati all'invio.
  function ricalcoloInvio(e, campi, regole) {
    const dopo = Object.assign({}, e, campi);
    const calcolati = { convocazioneCalcolata: convocazione(dopo, regole), fineCalcolata: fine(dopo, regole) };
    if (!e.inviata) return { cambiato: false, calcolati };
    const cambiato = dopo.data !== e.data
      || calcolati.convocazioneCalcolata !== convocazione(e, regole) || calcolati.fineCalcolata !== fine(e, regole)
      || (!DO.turnoRemoto(e.tipo) && (dopo.orario || '') !== (e.orario || ''));
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
  // Esportazione del mese, senza compensi: convocazioni (anche i giorni on-site, uno per persona) e presenze per operatore
  function righeMese(eventi, operatori, regole, mese, onsite = []) {
    const op = (id) => operatori.find((o) => o.id === id) || null;
    const data = (iso) => iso.slice(8) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
    const delMese = eventi.filter((e) => e.data.slice(0, 7) === mese);
    const righe = delMese.map((e) => {
      const o = op(e.operatoreId), turno = DO.turnoRemoto(e.tipo);
      return { chiave: e.data + convocazione(e, regole), riga: [data(e.data), nomeTipo(e.tipo), competizioneDi(e), turno ? '' : e.round || '', turno ? '' : e.sport || '',
        turno ? nomeTipo(e.tipo) : e.titolo || '', e.orario || '', convocazione(e, regole), fine(e, regole), o ? o.nome : '', o ? nomeRuolo(o.ruolo) : '', NOMI_STATO[e.stato] || e.stato] };
    });
    const conta = {};
    // partite, Remote TL, Remote Support confermati; in attesa; giorni on-site
    const contatore = (id) => (conta[id] = conta[id] || [0, 0, 0, 0, 0]);
    onsite.filter((d) => d.stato !== 'annullata').forEach((d) => {
      ['TL', 'OP'].forEach((ruolo) => (d['accettati' + ruolo] || []).filter(op).forEach((id) => {
        d.giorni.filter((g) => g.data.slice(0, 7) === mese).forEach((g) => {
          righe.push({ chiave: g.data + '~', riga: [data(g.data), 'On-site', '', '', d.sport || '', [g.attivita, g.partita, d.luogo].filter(Boolean).join(' · '),
            '', '', '', op(id).nome, 'On-site ' + ruolo, 'Confermato'] });
          contatore(id)[4]++;
        });
      }));
    });
    const convocazioni = [['Data', 'Tipo', 'Competizione', 'Round', 'Sport', 'Evento', 'Orario', 'Ritrovo', 'Fine turno', 'Operatore', 'Ruolo', 'Stato']]
      .concat(righe.sort((x, y) => x.chiave.localeCompare(y.chiave)).map((x) => x.riga));
    delMese.forEach((e) => {
      if (!e.operatoreId || !op(e.operatoreId)) return;
      const c = contatore(e.operatoreId);
      if (e.stato === 'confermato') c[e.tipo === 'supervisione' ? 1 : e.tipo === 'support' ? 2 : 0]++;
      else if (e.stato === 'convocato') c[3]++;
    });
    const presenze = [['Operatore', 'Partite confermate', 'Remote TL confermati', 'Remote Support confermati', 'In attesa', 'Giorni on-site']]
      .concat(Object.keys(conta).filter((id) => conta[id].some(Boolean)).map((id) => [op(id).nome].concat(conta[id]))
        .sort((a, b) => a[0].localeCompare(b[0], 'it')));
    return { convocazioni, presenze };
  }

  // importo in euro, sempre col separatore delle migliaia (in italiano di norma manca sotto 10.000)
  const euro = (n) => (Math.round(n * 100) / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });

  // stagione sportiva: da agosto a luglio
  function stagione(isoData) {
    const [a, m] = isoData.split('-').map(Number);
    const inizio = m >= 8 ? a : a - 1;
    return { da: inizio + '-08-01', a: (inizio + 1) + '-07-31', nome: inizio + '/' + String(inizio + 1).slice(2) };
  }

  // riga di stato dei promemoria automatici, dalle impostazioni restituite dallo script delle email
  function statoPromemoria(imp, oggi = DO.oggi()) {
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
    // promemoria accesi ma nessun giro da più di un giorno: lo script non sta girando
    const fermo = imp.promemoriaAttivi && u.giorno ? DO.giorniA(oggi, u.giorno) : 0;
    return 'Ultimo promemoria: ' + quando + ' · ' + cosa + (u.nonInviate ? ' · ' + quanti(u.nonInviate, ' email non partita', ' email non partite') : '')
      + (fermo >= 2 ? ' · ⚠ nessun giro da ' + fermo + ' giorni: controlla lo script delle email' : '');
  }

  // riga di stato del backup settimanale, dalle impostazioni restituite dallo script delle email
  function statoBackup(imp) {
    if (!imp || imp.backupAttivo === undefined) return 'Script delle email da aggiornare: il backup non è ancora disponibile.';
    if (!imp.backupProgrammato) return 'Invio del venerdì non attivo: esegui attivaPromemoria nello script delle email.';
    const u = imp.ultimoBackup;
    if (!u) return 'Nessun backup ancora inviato.';
    if (u.errore) return 'Ultimo backup non riuscito: ' + u.errore;
    const d = new Date(u.quando), fuso = { timeZone: 'Europe/Rome' };
    return 'Ultimo backup: ' + d.toLocaleDateString('it-IT', Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, fuso))
      + ' alle ' + d.toLocaleTimeString('it-IT', Object.assign({ hour: '2-digit', minute: '2-digit' }, fuso)) + ' · ' + u.eventi + ' eventi, ' + u.deployment + ' deployment'
      // copia su Drive (gli script precedenti non la registrano)
      + (u.drive === 'salvato' ? ' · copia su Drive' : u.drive ? ' · copia su Drive non riuscita: ' + String(u.drive).replace(/^errore: /, '') : '');
  }

  DO.regole = { PREDEFINITE, TIPI, complete, convocazione, fine, intervallo, sovrapposti, conflitto, ricalcoloInvio, numero, righeMese, notturno, competizione, compensoCompetizione, nomeRuolo, puoFare, sceltaOperatore, assegnabili, competizioneDi, nomeTipo, conta, gettone, euro, stagione, minuti, hhmm, statoPromemoria, statoBackup,
    PALETTE, coloreCompetizione, statoCalendario };
})(window.DO = window.DO || {});
