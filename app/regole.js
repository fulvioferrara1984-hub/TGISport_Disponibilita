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
      ['Nations League', 'Calcio'], ['Nations League W', 'Calcio'], ['Wcq', 'Calcio'], ['European Qualifiers Women', 'Calcio'],
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
      // alias: i vecchi nomi della competizione, per ritrovarla nelle partite create prima della rinomina
      return Object.assign({}, c, { alias: Array.isArray(c.alias) ? c.alias : [], prima: prima === null ? anticipo : prima, dopo: dopo === null ? dopoGenerale : dopo, colore: coloreValido(c.colore), compenso });
    }));
    x.tariffe = {
      'P.IVA': Object.assign({}, PREDEFINITE.tariffe['P.IVA'], (r && r.tariffe && r.tariffe['P.IVA']) || {}),
      Coop: Object.assign({}, PREDEFINITE.tariffe.Coop, (r && r.tariffe && r.tariffe.Coop) || {}),
    };
    if (!(Number.isFinite(x.tariffaOnsite) && x.tariffaOnsite >= 0)) x.tariffaOnsite = PREDEFINITE.tariffaOnsite;
    // regole salvate prima delle date di validità: valgono da sempre e senza versioni precedenti
    if (typeof x.dal !== 'string') x.dal = '';
    if (!Array.isArray(x.precedenti)) x.precedenti = [];
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

  // per nome, poi tra i vecchi nomi (alias): rinominare una competizione non lascia partite senza regole
  const competizione = (nome, regole) => {
    const lista = complete(regole).competizioni;
    return lista.find((c) => c.nome === nome) || lista.find((c) => (c.alias || []).includes(nome)) || null;
  };
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

  // Nel Riepilogo contano solo gli eventi confermati; quelli assegnati e non ancora confermati sono «in attesa»
  const conta = (e) => !!e.operatoreId && e.stato === 'confermato';
  const inAttesa = (e) => !!e.operatoreId && (e.stato === 'assegnato' || e.stato === 'convocato');
  // Evento già iniziato: giorno passato, oppure oggi con il ritrovo (o l'orario) già arrivato
  // (un ritrovo dopo l'orario della partita è della sera prima: partite notturne)
  function giaIniziato(e, regole, oggi, ora) {
    const ritrovo = convocazione(e, regole) || e.orario || '';
    if (!ritrovo) return e.data < oggi;
    const giorno = DO.giornoRitrovo(e.data, e.orario, ritrovo);
    // confronto in minuti: «2:00» vale come «02:00»
    return giorno < oggi || (giorno === oggi && minuti(ritrovo) <= minuti(ora));
  }

  // Tariffe dai campi di Impostazioni ({ 'P.IVA.diurno': '140', … }): un campo vuoto o non valido non diventa 0
  const NOMI_TARIFFA = { diurno: 'diurno', notturno: 'notturno', maggiorato: 'maggiorato' };
  function tariffeDa(valori) {
    const tariffe = {};
    for (const k of Object.keys(valori)) {
      const punto = k.lastIndexOf('.'), contratto = k.slice(0, punto), tipo = k.slice(punto + 1);
      const n = numero(valori[k], { min: 0, max: 10000 });
      if (n === null) return { errore: 'Tariffa ' + contratto + ' ' + (NOMI_TARIFFA[tipo] || tipo) + ': scrivi un importo da 0 a 10.000 €.' };
      (tariffe[contratto] = tariffe[contratto] || {})[tipo] = n;
    }
    return { tariffe };
  }

  // Righe delle nuove partite: «17/10 15:00 Venezia-Napoli», anche «17/10 15», «17/10 ore 18», «17/10 h20.45»;
  // l'anno dalla stagione (agosto–luglio). Le doppie (nell'elenco o già presenti e non annullate) non si creano.
  const chiavePartita = (data, orario, titolo) => data + ' ' + orario + ' ' + String(titolo || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  function leggiPartite(testo, oggi, esistenti) {
    const ok = [], errori = [], doppie = [], st = stagione(oggi), viste = {};
    const presenti = new Set((esistenti || []).filter((e) => e.stato !== 'annullato').map((e) => chiavePartita(e.data, e.orario, e.titolo)));
    String(testo || '').split('\n').forEach((grezza, i) => {
      const r = grezza.trim(), riga = i + 1;
      if (!r) return;
      const d = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?:\s+(.*))?$/.exec(r);
      if (!d) { errori.push('Riga ' + riga + ': manca la data (es. 17/10)'); return; }
      const g = Number(d[1]), me = Number(d[2]);
      const anno = d[3] ? Number(d[3].length === 2 ? '20' + d[3] : d[3]) : Number(me >= 8 ? st.da.slice(0, 4) : st.a.slice(0, 4));
      const data = anno + '-' + String(me).padStart(2, '0') + '-' + String(g).padStart(2, '0');
      const dt = new Date(anno, me - 1, g);
      if (me < 1 || me > 12 || g < 1 || dt.getMonth() !== me - 1) { errori.push('Riga ' + riga + ': data non valida (' + d[1] + '/' + d[2] + ')'); return; }
      const resto = d[4] || '';
      const o = /^(ore\s*|h\s*)?(\d{1,2})(?:[:.](\d{2}))?(?:\s+(.+))?$/i.exec(resto);
      if (!o) { errori.push('Riga ' + riga + ': manca l\'orario (es. 15:00)'); return; }
      const ore = Number(o[2]), minuti = o[3] === undefined ? 0 : Number(o[3]), titolo = (o[4] || '').trim();
      if (ore > 23 || minuti > 59) { errori.push('Riga ' + riga + ': orario non valido (' + o[2] + (o[3] !== undefined ? ':' + o[3] : '') + ')'); return; }
      if (!titolo) { errori.push('Riga ' + riga + ': manca la partita'); return; }
      // ora senza minuti e senza «ore»/«h»: solo dalle 8 alle 23 e con la partita che non inizia con una cifra
      // («17/10 20 45 Roma-Lazio» o «17/10 2 Bundesliga …» sarebbero letti male)
      if (o[3] === undefined && !o[1] && (ore < 8 || /^\d/.test(titolo))) {
        const hh = String(ore).padStart(2, '0'), mm = /^(\d{2})\b/.exec(titolo);
        errori.push('Riga ' + riga + ': orario non chiaro (scrivi ' + hh + ':' + (mm ? mm[1] : '00') + (ore < 8 && !mm ? ', o «ore ' + ore + '»' : '') + ')');
        return;
      }
      const p = { data, orario: String(ore).padStart(2, '0') + ':' + String(minuti).padStart(2, '0'), titolo, riga };
      const k = chiavePartita(p.data, p.orario, p.titolo);
      if (viste[k]) { doppie.push('Riga ' + riga + ': uguale alla riga ' + viste[k]); return; }
      viste[k] = riga;
      if (presenti.has(k)) { doppie.push('Riga ' + riga + ': già presente'); return; }
      ok.push(p);
    });
    return { ok, errori, doppie };
  }

  // Versione valida in una data tra quella in vigore (dal) e le precedenti, in ordine di data.
  // «dal» vuoto o assente = da sempre; data vuota o non valida = quella in vigore.
  const dataValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  // contrattoDal: una data oppure '' (da sempre)
  const giornoContratto = (d) => (dataValida(d) ? d : '');
  // Storia dei contratti per l'archivio: dal è una data o '' (= «da sempre», il dal della prima voce); il resto si scarta
  const storiaContrattiPulita = (v) => (Array.isArray(v) ? v : [])
    .filter((c) => c && (c.dal === '' || dataValida(c.dal)) && ['P.IVA', 'Coop'].includes(c.contratto)).map((c) => ({ dal: c.dal, contratto: c.contratto }));
  function versioneDel(inVigore, dal, precedenti, data) {
    if (!dal || !dataValida(data) || data >= dal || !Array.isArray(precedenti) || !precedenti.length) return inVigore;
    const valide = precedenti.filter((p) => (p.dal || '') <= data);
    // prima della versione più vecchia che si conosce vale comunque quella
    return valide.length ? valide[valide.length - 1] : precedenti[0];
  }

  // Regole complete come valevano in una data: della versione prendono solo i campi di compenso (tariffe,
  // fascia notturna, anticipo, tipo di compenso e ore di ritrovo di ogni competizione); il resto è quello in vigore.
  // Le competizioni sono quelle della versione (una aggiunta dopo vale dall'inizio della versione in vigore).
  function regoleDel(regole, data) {
    const r = complete(regole), v = versioneDel(r, r.dal, r.precedenti, data);
    return v === r ? r : completaVersione(r, v);
  }
  // Una versione precedente completata: i campi di compenso mancanti vengono da quelle in vigore (r già completa)
  function completaVersione(r, v) {
    const campi = { dal: v.dal || '', precedenti: [] };
    for (const k of ['tariffe', 'notteDa', 'notteA', 'anticipoOre']) if (v[k] !== undefined) campi[k] = v[k];
    const dellaVersione = Array.isArray(v.competizioni) ? v.competizioni : [];
    const abbina = (c) => r.competizioni.find((a) => a.nome === c.nome || (c.alias || []).includes(a.nome) || (a.alias || []).includes(c.nome)
      || (a.alias || []).some((x) => (c.alias || []).includes(x)));
    const unici = (nomi) => nomi.filter((n, i) => n && nomi.indexOf(n) === i);
    campi.competizioni = dellaVersione.map((c) => {
      const oggi = abbina(c);
      if (!oggi) return c;
      // sport, colore e ore di fine restano quelli in vigore; i nomi di oggi diventano alias del nome di allora
      return Object.assign({}, c, { sport: oggi.sport, colore: oggi.colore, dopo: oggi.dopo, mansione: oggi.mansione,
        alias: unici([].concat(c.alias || [], oggi.nome, oggi.alias || [])).filter((n) => n !== c.nome) });
    }).concat(r.competizioni.filter((a) => a.mansione && !dellaVersione.some((c) => c.nome === a.nome)));
    return complete(Object.assign({}, r, campi));
  }

  // Contratto di un operatore in una data (contratto, contrattoDal e contrattiPrecedenti); operatore assente = ''
  function contrattoDel(operatore, data) {
    if (!operatore) return '';
    const v = versioneDel(operatore, operatore.contrattoDal, operatore.contrattiPrecedenti, data);
    return v.contratto || '';
  }

  // ---- salvataggi con data ----
  const giornoIt = (iso, conAnno) => iso.slice(8) + '/' + iso.slice(5, 7) + (conAnno ? '/' + iso.slice(0, 4) : '');
  const giornoPrima = (iso) => {
    const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8)) - 1));
    return d.toISOString().slice(0, 10);
  };
  // stessa competizione per nome o alias (una rinomina con alias non è una competizione nuova)
  const stessaCompetizione = (a, b) => a.nome === b.nome || (b.alias || []).includes(a.nome) || (a.alias || []).includes(b.nome)
    || (a.alias || []).some((x) => (b.alias || []).includes(x));

  // Cambia qualcosa che muove i compensi? Contano solo tariffe, fascia notturna, anticipo e, per ogni competizione
  // o mansione, tipo di compenso e ore di ritrovo. Una competizione tolta conta, una nuova no.
  function cambiaCompenso(attuali, dopo) {
    const a = complete(attuali), d = complete(dopo);
    const campi = (r) => JSON.stringify([r.tariffe, r.notteDa, r.notteA, r.anticipoOre]);
    if (campi(a) !== campi(d)) return true;
    return a.competizioni.some((c) => {
      const x = d.competizioni.find((y) => stessaCompetizione(c, y));
      return !x || x.compenso !== c.compenso || x.prima !== c.prima;
    });
  }

  // Giorni tra cui si può scegliere da quando valgono le nuove regole: dalla versione in vigore (stesso giorno = correzione) a oggi
  function limitiDal(regole, oggi) { return { min: complete(regole).dal || '', max: oggi }; }

  const erroreGiorno = (min) => (min ? 'Scegli un giorno dal ' + giornoIt(min, true) + ' a oggi.' : 'Scegli un giorno fino a oggi.');

  // Documento delle regole da salvare. Senza cambi di compenso «dal» non serve e si tengono dal e precedenti;
  // con «dal» uguale a quello in vigore si corregge; altrimenti la versione in vigore va in precedenti.
  function nuoveRegole(attuali, modifiche, dal, oggi) {
    const r = complete(attuali), nuove = Object.assign({}, attuali, modifiche);
    if (!cambiaCompenso(r, nuove)) return { regole: Object.assign(nuove, { dal: r.dal || '', precedenti: r.precedenti }) };
    if (!dataValida(dal)) return { errore: 'Scegli da quando valgono le regole.' };
    const { min } = limitiDal(r, oggi);
    if (dal > oggi || dal < min) return { errore: erroreGiorno(min) };
    if (dal === min) return { regole: Object.assign(nuove, { dal, precedenti: r.precedenti }) };
    const versione = { dal: r.dal || '', tariffe: r.tariffe, notteDa: r.notteDa, notteA: r.notteA, anticipoOre: r.anticipoOre,
      competizioni: r.competizioni.map((c) => ({ nome: c.nome, alias: c.alias || [], compenso: c.compenso, prima: c.prima })) };
    return { regole: Object.assign(nuove, { dal, precedenti: r.precedenti.concat([versione]) }) };
  }

  // Versioni delle regole dalla più vecchia; «al» è il giorno prima della successiva, '' per quella in vigore
  function periodiVersioni(regole) {
    const r = complete(regole), versioni = r.precedenti.map((p) => completaVersione(r, p)).concat([r]);
    return versioni.map((v, i) => ({ dal: v.dal || '', al: i + 1 < versioni.length ? giornoPrima(versioni[i + 1].dal) : '', versione: v }));
  }

  // Alias dopo aver rinominato una competizione: il vecchio nome diventa alias, il nuovo non lo è più
  function aliasDopoRinomina(origine, nome, alias) {
    const resto = (alias || []).filter((x) => x !== nome);
    return origine && origine !== nome && !resto.includes(origine) ? resto.concat(origine) : resto;
  }

  // Un nome o alias non può essere anche nome o alias di un'altra competizione
  function aliasInConflitto(competizioni) {
    const visti = {};
    for (let i = 0; i < competizioni.length; i++) {
      const c = competizioni[i];
      for (const n of [c.nome].concat(c.alias || [])) {
        if (!n) continue;
        if (n in visti && visti[n] !== i) return n + ' è già il nome di un\'altra competizione.';
        visti[n] = i;
      }
    }
    return null;
  }

  // Cambio di contratto di un operatore: i campi da salvare. Chi non aveva contratto lo ha da sempre;
  // altrimenti serve il giorno da cui vale (stesso giorno del contratto in vigore = correzione).
  function nuovoContratto(operatore, contratto, dal, oggi) {
    const attuale = operatore.contratto || '';
    if (contratto === attuale) return { campi: {} };
    if (!attuale) return { campi: { contratto } };
    if (!dataValida(dal)) return { errore: 'Scegli da quando vale il nuovo contratto.' };
    const min = operatore.contrattoDal || '';
    if (dal > oggi || dal < min) return { errore: erroreGiorno(min) };
    if (dal === min) return { campi: { contratto } };
    return { campi: { contratto, contrattoDal: dal, contrattiPrecedenti: (operatore.contrattiPrecedenti || []).concat([{ dal: min, contratto: attuale }]) } };
  }

  // Cambi di regole e contratti con da < dal <= a, per avvisare nel Riepilogo che il periodo non è uniforme
  function cambiNelPeriodo(regole, operatori, da, a) {
    const r = complete(regole), dentro = (dal) => !!dal && da < dal && dal <= a;
    const righe = [];
    const cambi = r.precedenti.map((p) => p.dal).concat([r.dal]).filter(dentro).sort();
    if (cambi.length) righe.push('Regole dei compensi cambiate dal ' + cambi.map((d) => giornoIt(d)).join(', '));
    for (const o of operatori) {
      (o.contrattiPrecedenti || []).concat([{ dal: o.contrattoDal, contratto: o.contratto }]).filter((c) => dentro(c.dal))
        .sort((x, y) => x.dal.localeCompare(y.dal))
        .forEach((c) => righe.push(o.nome + ': ' + c.contratto + ' dal ' + giornoIt(c.dal)));
    }
    return righe;
  }

  // Le date raggruppate per contratto dell'operatore in quel giorno, nell'ordine in cui compare il contratto
  function datePerContratto(date, operatore) {
    const gruppi = [];
    for (const d of date) {
      const contratto = contrattoDel(operatore, d);
      const g = gruppi.find((x) => x.contratto === contratto);
      if (g) g.date.push(d); else gruppi.push({ contratto, date: [d] });
    }
    return gruppi;
  }

  const testoNonEliminabile = (nome) => nome + ' ha eventi o deployment: eliminarlo azzererebbe i suoi compensi nel Riepilogo. Disattivalo da Modifica → Attivo.';

  // Gettone di un evento: il maggiorato deciso dal supervisore vale su tutto;
  // poi il tipo della competizione (o della mansione per i turni remoti).
  // Regole e contratto sono quelli del giorno dell'evento: cambiarli dopo non tocca i mesi passati.
  function gettone(e, operatore, regole) {
    const r = regoleDel(regole, e.data);
    const t = r.tariffe[contrattoDel(operatore, e.data)] || null;
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

  DO.regole = { PREDEFINITE, TIPI, complete, inAttesa, giaIniziato, tariffeDa, leggiPartite, convocazione, fine, intervallo, sovrapposti, conflitto, ricalcoloInvio, numero, righeMese, notturno, competizione, compensoCompetizione, regoleDel, contrattoDel, cambiaCompenso, stessaCompetizione, limitiDal, nuoveRegole, periodiVersioni, aliasDopoRinomina, aliasInConflitto, nuovoContratto, giornoContratto, storiaContrattiPulita, cambiNelPeriodo, datePerContratto, testoNonEliminabile, nomeRuolo, puoFare, sceltaOperatore, assegnabili, competizioneDi, nomeTipo, conta, gettone, euro, stagione, minuti, hhmm, statoPromemoria, statoBackup,
    PALETTE, coloreCompetizione, statoCalendario };
})(window.DO = window.DO || {});
