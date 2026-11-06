/* Disponibilità Ops — partite remote dalla piattaforma: funzioni pure per creare, collegare e allineare le partite
 * agli eventi della piattaforma (collezione progetti, legati dal campo `progettoId`). Le scritture stanno altrove.
 * DO.regole, DO.building e DO.aggiungi si leggono al momento della chiamata: in admin.html regole.js viene dopo questo file. */
(function (DO) {
  'use strict';

  const GIORNI = 35;
  const testo = (v) => String(v == null ? '' : v).trim();
  const norm = (s) => DO.building.normalizza(s);
  const gm = (iso) => String(iso || '').slice(8, 10) + '/' + String(iso || '').slice(5, 7);
  const PREFISSO_ANNULLATA = 'Annullata dalla piattaforma';

  const NOTE = {
    creata: (codice) => 'Creata dalla piattaforma' + (codice ? ' (' + codice + ')' : ''),
    collegata: (codice) => 'Collegata alla piattaforma' + (codice ? ' (' + codice + ')' : ''),
    annullata: (motivo) => PREFISSO_ANNULLATA + ': ' + motivo,
    ripristinata: 'Ripristinata dalla piattaforma: evento confermato di nuovo',
    scollegata: 'Scollegata dalla piattaforma',
    PREFISSO_ANNULLATA,
  };

  // Giorni su cui lavora il giro: oggi compreso, GIORNI in tutto.
  const finestra = (oggi) => ({ da: oggi, a: DO.aggiungi(oggi, GIORNI - 1) });

  // Nome della competizione com'è scritto in Disponibilità; '' se sconosciuta (le mansioni non valgono).
  function nomeCompetizione(evento, competizioniPiattaforma, regole) {
    const nome = testo(evento && evento.competizione);
    const voce = (Array.isArray(competizioniPiattaforma) ? competizioniPiattaforma : []).find((c) => c && norm(c.nome) === norm(nome));
    const cerca = norm((voce && testo(voce.nomeDisponibilita)) || nome);
    if (!cerca) return '';
    const trovata = DO.regole.complete(regole).competizioni.find((c) => !c.mansione && norm(c.nome) === cerca);
    return trovata ? trovata.nome : '';
  }

  const titoloPiattaforma = (evento) => {
    const a = testo(evento.squadraA), b = testo(evento.squadraB);
    return a || b ? a + ' – ' + b : testo(evento.competizione);
  };

  // Partita nuova (senza operatore, da assegnare) per l'evento; i campi di sistema li aggiunge la scrittura.
  function partitaDa(evento, nome, regole) {
    const R = DO.regole;
    const c = R.competizione(nome, regole);
    const base = {
      tipo: 'partita', competizione: nome, sport: c ? c.sport : '', round: testo(evento.round), data: evento.data,
      orario: R.minuti(evento.ko) === null ? '' : R.hhmm(R.minuti(evento.ko)), titolo: titoloPiattaforma(evento),
      progettoId: evento.id, convocazione: '', fine: '', note: '', gettone: '', daSostituire: false,
    };
    return Object.assign(base, { convocazioneCalcolata: R.convocazione(base, regole), fineCalcolata: R.fine(base, regole) });
  }

  // Cosa cambia nella partita collegata rispetto all'evento: null se nulla.
  function allineamento(partita, evento, regole, oggi) {
    const R = DO.regole;
    const campi = {}, parti = [];
    const km = R.minuti(evento.ko);
    if (km !== null && km !== R.minuti(partita.orario)) {
      const prima = R.minuti(partita.orario);
      campi.orario = R.hhmm(km);
      parti.push('KO ' + (prima === null ? '' : R.hhmm(prima) + ' → ') + campi.orario);
    }
    if (evento.data && evento.data !== partita.data && evento.data >= oggi) {
      campi.data = evento.data;
      parti.push('data ' + gm(partita.data) + ' → ' + gm(evento.data));
    }
    if (testo(evento.squadraA) && testo(evento.squadraB) && norm(partita.titolo) !== norm(evento.squadraA) + norm(evento.squadraB)) {
      campi.titolo = titoloPiattaforma(evento);
      parti.push('squadre ' + testo(partita.titolo) + ' → ' + campi.titolo);
    }
    if (testo(evento.round) && testo(evento.round) !== testo(partita.round)) {
      campi.round = testo(evento.round);
      parti.push('round ' + testo(partita.round) + ' → ' + campi.round);
    }
    if (!parti.length) return null;
    // come la finestra dell'evento: ritrovo e fine calcolati, convocazione inviata da rimandare se cambia ciò che vede l'operatore
    const { cambiato, calcolati } = R.ricalcoloInvio(partita, campi, regole);
    if (calcolati) Object.assign(campi, calcolati);
    if (cambiato && partita.stato !== 'annullato') Object.assign(campi, { inviata: false, stato: 'assegnato', risposta: '' });
    return { campi, rimanda: cambiato, nota: 'Dalla piattaforma: ' + parti.join(', ') + (cambiato ? ': convocazione da rimandare' : '') };
  }

  // Collegamento a mano o automatico: progettoId più l'eventuale allineamento.
  function collegamento(partita, evento, regole, oggi) {
    const a = allineamento(partita, evento, regole, oggi);
    return {
      campi: Object.assign({ progettoId: evento.id }, a ? a.campi : {}),
      rimanda: !!(a && a.rimanda),
      nota: NOTE.collegata(evento.codice) + (a ? '; ' + a.nota : ''),
    };
  }

  const collegata = (p) => !!p && p.tipo === 'partita' && !!p.progettoId;
  const annullata = (p) => p.stato === 'annullato';
  const ultimaVoce = (p) => { const s = Array.isArray(p.storico) ? p.storico : []; return s.length ? testo(s[s.length - 1] && s[s.length - 1].testo) : ''; };
  const annullataDalGiro = (p) => annullata(p) && ultimaVoce(p).startsWith(PREFISSO_ANNULLATA);
  const vigilia = (e) => ['MD-1', 'MD-2'].includes(testo(e.attivita).toUpperCase());
  const squadre = (e) => (testo(e.squadraA) && testo(e.squadraB) ? norm(e.squadraA) + norm(e.squadraB) : '');

  // ID dei progetti da rileggere: partite collegate da oggi in poi (non annullate, o annullate dal giro) il cui evento non è tra `progetti`.
  function daRileggere(partite, progetti, oggi) {
    const noti = new Set((progetti || []).map((e) => e && e.id));
    const ids = [];
    (partite || []).forEach((p) => {
      if (!collegata(p) || !(p.data >= oggi) || noti.has(p.progettoId) || ids.includes(p.progettoId)) return;
      if (!annullata(p) || annullataDalGiro(p)) ids.push(p.progettoId);
    });
    return ids;
  }

  // Ciò che il giro ha visto della partita: la scrittura non procede se nel frattempo è cambiato.
  const atteso = (p) => ({ progettoId: p.progettoId || '', data: p.data, titolo: p.titolo, orario: p.orario, inviata: !!p.inviata, stato: p.stato });

  const puoScrivere = (s) => !!s && s.solaLettura === false && s.sincronizzato === true;

  function testoAvviso(n) {
    const forme = [['create', 'creata', 'create'], ['collegate', 'collegata', 'collegate'], ['aggiornate', 'aggiornata', 'aggiornate'],
      ['rimandate', 'da rimandare', 'da rimandare'], ['annullate', 'annullata', 'annullate'], ['ripristinate', 'ripristinata', 'ripristinate'],
      ['nonRiuscite', 'non riuscita', 'non riuscite']];
    const parti = [];
    forme.forEach(([k, uno, molti]) => {
      const v = (n && n[k]) || 0;
      if (v > 0) parti.push(v + ' ' + (parti.length ? '' : v === 1 ? 'partita ' : 'partite ') + (v === 1 ? uno : molti));
    });
    return parti.length ? 'Dalla piattaforma: ' + parti.join(', ') + '.' : '';
  }

  // Confronta gli eventi della piattaforma con le partite della stagione e dice cosa fare; non scrive nulla.
  function giro({ progetti, letti, partite, competizioniPiattaforma, regole, oggi, ora }) {
    const R = DO.regole;
    const az = { crea: [], collega: [], allinea: [], annulla: [], ripristina: [], dubbi: [], sconosciute: [], daRivedere: [] };
    const eventi = (progetti || []).filter(Boolean);
    const riletti = letti || {};
    const tutte = (partite || []).filter((p) => p && p.tipo === 'partita');
    const { da, a } = finestra(oggi);
    const confermato = (e) => e.modalita === 'REMOTE' && e.stato === 'CONFIRMED' && !vigilia(e) && e.data >= da && e.data <= a;
    const remoti = eventi.filter(confermato);
    const noti = eventi.concat(Object.keys(riletti).map((k) => riletti[k]).filter(Boolean));
    const libere = tutte.filter((p) => !p.progettoId && !annullata(p) && p.data >= oggi);

    // A. eventi remoti confermati senza partita collegata
    remoti.filter((e) => !tutte.some((p) => p.progettoId === e.id)).forEach((e) => {
      const k = squadre(e);
      const stesse = k ? libere.filter((p) => p.data === e.data && norm(p.titolo) === k) : [];
      // una partita già iniziata non si tocca mai: l'evento resta fuori da questo giro (niente collegamento, dubbio o doppione)
      if (stesse.some((p) => R.giaIniziato(p, regole, oggi, ora))) return;
      const altri = k ? remoti.some((o) => o.id !== e.id && o.data === e.data && squadre(o) === k) : false;
      if (stesse.length && !altri) {
        stesse.forEach((p) => az.collega.push(Object.assign({ partita: p, evento: e }, collegamento(p, e, regole, oggi))));
        return;
      }
      const nome = nomeCompetizione(e, competizioniPiattaforma, regole);
      if (stesse.length) return az.dubbi.push({ evento: e, candidate: stesse });
      if (nome) {
        const candidate = libere.filter((p) => p.data === e.data && norm(p.competizione) === norm(nome)
          && !noti.some((o) => o.id !== e.id && o.data === e.data && squadre(o) && squadre(o) === norm(p.titolo)));
        if (candidate.length) return az.dubbi.push({ evento: e, candidate });
      }
      if (!nome) return az.sconosciute.push({ evento: e });
      const campi = partitaDa(e, nome, regole);
      if (!R.giaIniziato(campi, regole, oggi, ora)) az.crea.push({ evento: e, campi });
    });

    // B. partite collegate, da oggi in poi e non già iniziate
    tutte.filter((p) => p.progettoId && p.data >= oggi && !R.giaIniziato(p, regole, oggi, ora)).forEach((p) => {
      const id = p.progettoId;
      let e = eventi.find((x) => x.id === id);
      if (!e && riletti[id] !== undefined) e = riletti[id]; // null = eliminato
      if (e === undefined) return; // lettura non riuscita: non si tocca
      if (e && e.modalita === 'TBC') return;
      const chiusa = !e || e.stato === 'CANCELLED' || e.modalita === 'ON-SITE' || e.modalita === 'FLYKIT';
      if (chiusa) {
        if (annullata(p)) return;
        const motivo = !e ? 'eliminato' : e.stato === 'CANCELLED' ? 'annullato' : 'non più remoto';
        if (p.inviata) az.daRivedere.push({ partita: p, evento: e, motivo: motivo === 'annullato' ? 'annullato nella piattaforma' : motivo === 'eliminato' ? 'eliminato nella piattaforma' : 'non più remoto nella piattaforma' });
        else az.annulla.push({ partita: p, nota: NOTE.annullata('evento ' + motivo) });
        return;
      }
      if (e.modalita !== 'REMOTE') return;
      if (!annullata(p)) {
        const al = allineamento(p, e, regole, oggi);
        if (al) az.allinea.push(Object.assign({ partita: p, evento: e }, al));
      } else if (e.stato === 'CONFIRMED' && annullataDalGiro(p)) {
        az.ripristina.push({ partita: p, campi: { stato: p.operatoreId ? 'assegnato' : 'da-assegnare' }, nota: NOTE.ripristinata });
      }
    });
    return az;
  }

  DO.partitePiattaforma = { GIORNI, finestra, nomeCompetizione, titoloPiattaforma, partitaDa, allineamento, collegamento, daRileggere, atteso, puoScrivere, testoAvviso, giro, NOTE };
})(window.DO = window.DO || {});
