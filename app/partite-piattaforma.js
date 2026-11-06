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

  DO.partitePiattaforma = { GIORNI, finestra, nomeCompetizione, titoloPiattaforma, partitaDa, allineamento, collegamento, NOTE };
})(window.DO = window.DO || {});
