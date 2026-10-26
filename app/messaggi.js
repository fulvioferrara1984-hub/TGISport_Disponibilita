/* Disponibilità Ops — messaggi tra un operatore e i supervisori su una convocazione remota o un deployment on-site.
 * Un messaggio è un documento di `messaggi`; una conversazione = stesso tipo ('evento' | 'onsite'), rif e operatore.
 * Usato dalla pagina operatori e dalla dashboard. */
(function (DO) {
  'use strict';

  const TESTO_MAX = 500;
  const lista = (v) => (Array.isArray(v) ? v : []);
  const perTempo = (a, b) => String(a.quando).localeCompare(String(b.quando));

  // testo da salvare: spazi iniziali e finali tolti, da 1 a 500 caratteri
  function testoValido(t) {
    const s = String(t == null ? '' : t).trim();
    return s && s.length <= TESTO_MAX ? s : null;
  }

  const chiave = (m) => m.tipo + '/' + m.rif + '/' + m.operatoreId;
  const della = (tipo, rif) => (m) => m.tipo === tipo && m.rif === rif;

  const conversazione = (elenco, tipo, rif, operatoreId) =>
    lista(elenco).filter((m) => della(tipo, rif)(m) && m.operatoreId === operatoreId).sort(perTempo);

  // sulla pagina operatori l'elenco ha già solo i suoi messaggi
  const nuoviPerOperatore = (elenco, tipo, rif) => lista(elenco).filter((m) => della(tipo, rif)(m) && m.da === 'supervisore' && !m.letto).length;

  // conversazioni di un evento o deployment, una per operatore: quella dell'operatore attuale per prima,
  // poi le altre dalla più recente
  function perEvento(elenco, tipo, rif, operatoreAttuale) {
    const gruppi = {};
    lista(elenco).filter(della(tipo, rif)).forEach((m) => { (gruppi[m.operatoreId] = gruppi[m.operatoreId] || []).push(m); });
    const ultimo = (g) => g.messaggi[g.messaggi.length - 1].quando;
    return Object.keys(gruppi).map((id) => ({ operatoreId: id, messaggi: gruppi[id].sort(perTempo) }))
      .sort((a, b) => (b.operatoreId === operatoreAttuale) - (a.operatoreId === operatoreAttuale) || String(ultimo(b)).localeCompare(String(ultimo(a))));
  }

  // '' = l'operatore può scrivere; altrimenti il motivo (la conversazione resta da leggere)
  function chiusoPerOperatore(tipo, x, operatoreId) {
    if (tipo === 'evento') return x.stato === 'annullato' ? 'Convocazione annullata: non si possono più mandare messaggi.' : '';
    if (x.stato === 'annullata') return 'Deployment annullato: non si possono più mandare messaggi.';
    if (lista(x.esclusi).includes(operatoreId)) return 'Non fai più parte di questo deployment: non si possono più mandare messaggi.';
    return '';
  }

  // l'operatore vede l'evento solo dopo l'invio della convocazione
  const chiusoPerSupervisore = (e) => (e.operatoreId && e.inviata === true ? '' : 'Potrai scrivere dopo l\'invio della convocazione.');

  function etichetta(n, nuovi) {
    if (nuovi) return '💬 ' + nuovi + (nuovi === 1 ? ' nuovo messaggio' : ' nuovi messaggi');
    return n ? '💬 Messaggi (' + n + ')' : '💬 Scrivi ai supervisori';
  }

  // voci di Aggiornamenti dei messaggi non lette: segno 💬 su eventi e deployment, e da segnare come lette rispondendo
  const daLeggere = (invii) => lista(invii).filter((x) => x.tipo === 'messaggio' && !x.letto && x.evento);
  const segniDaLeggere = (invii) => new Set(daLeggere(invii).map((x) => x.evento.tipo + '/' + x.evento.rif));
  const inviiDellaConversazione = (invii, tipo, rif, operatoreId) =>
    daLeggere(invii).filter((x) => x.evento.tipo === tipo && x.evento.rif === rif && x.operatoreId === operatoreId).map((x) => x.id);

  // documento di `messaggi` (testo già controllato con testoValido)
  const nuovoMessaggio = ({ tipo, rif, operatoreId, da, autore, testo }, adesso) => ({ operatoreId, tipo, rif, da, autore, testo, quando: adesso, letto: false });

  // voce di Aggiornamenti che accompagna il messaggio di un operatore
  const voceAggiornamenti = (m, op, soggettoDi, adesso) => ({
    quando: adesso, operatoreId: op.id, nome: op.nome, modifiche: [], letto: false, tipo: 'messaggio',
    evento: { tipo: m.tipo, rif: m.rif, titolo: soggettoDi.titolo, data: soggettoDi.data, testo: m.testo },
  });

  // di cosa si parla: nome della partita o del turno remoto, oppure luogo del deployment
  function soggetto(tipo, x) {
    if (tipo === 'onsite') return { titolo: 'On-site ' + x.luogo + (x.titolo ? ' · ' + x.titolo : ''), data: x.da };
    return { titolo: DO.turnoRemoto(x.tipo) ? DO.nomeTurno(x.tipo) : x.titolo, data: x.data };
  }

  // «Mer 21 ott · 18:05» nell'ora del dispositivo
  function quandoBreve(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const g = DO.giorno(DO.iso(d));
    return g.breve + ' ' + g.num + ' ' + g.meseBreve + ' · ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // conversazione in HTML: i propri messaggi a destra, quelli dell'altra parte a sinistra con il nome
  function htmlConversazione(messaggi, mio) {
    if (!lista(messaggi).length) return '<p class="msg-vuoto">Nessun messaggio.</p>';
    return '<ol class="msg-elenco">' + messaggi.map((m) => {
      const proprio = m.da === mio;
      return '<li class="msg ' + (proprio ? 'msg-mio' : 'msg-altro') + '">'
        + (proprio ? '' : '<span class="msg-chi">' + DO.esc(m.autore) + '</span>')
        + '<p>' + DO.esc(m.testo).replace(/\n/g, '<br>') + '</p>'
        + '<span class="msg-quando">' + quandoBreve(m.quando) + '</span></li>';
    }).join('') + '</ol>';
  }

  DO.messaggi = {
    TESTO_MAX, testoValido, chiave, conversazione, nuoviPerOperatore, perEvento, chiusoPerOperatore, chiusoPerSupervisore, etichetta,
    segniDaLeggere, inviiDellaConversazione, nuovoMessaggio, voceAggiornamenti, soggetto, htmlConversazione,
  };
})(window.DO = window.DO || {});
