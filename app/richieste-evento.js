/* Disponibilità Ops — richieste di disponibilità per un singolo evento remoto: calcoli usati da pagina operatori, dashboard e demo.
 * Una richiesta (id = id dell'evento) porta una copia dei dati della partita, i destinatari e le risposte Sì/No;
 * la dashboard la tiene allineata all'evento (aperta finché serve qualcuno). */
(function (DO) {
  'use strict';

  const lista = (x) => (Array.isArray(x) ? x : []);
  const CAMPI = ['titolo', 'tipo', 'competizione', 'round', 'data', 'orario', 'ritrovo', 'fine'];

  // Istante in millisecondi da Date, stringa ISO o Timestamp di Firestore; 0 se non si capisce
  function ms(x) {
    if (!x) return 0;
    if (typeof x.toMillis === 'function') return x.toMillis();
    const n = x instanceof Date ? x.getTime() : Date.parse(x);
    return isFinite(n) ? n : 0;
  }

  // Dati della partita che vedono gli operatori (niente compensi né note interne)
  function copiaEvento(e, regole) {
    const t = (v) => String(v == null ? '' : v);
    return {
      titolo: t(e.titolo) || (e.tipo === 'supervisione' ? 'Supervisione' : ''),
      tipo: t(e.tipo), competizione: t(e.competizione), round: t(e.round), data: t(e.data), orario: t(e.orario),
      ritrovo: t(DO.regole.convocazione(e, regole)), fine: t(DO.regole.fine(e, regole)),
    };
  }

  const scoperto = (e) => !e.operatoreId || e.stato === 'rifiutato' || !!e.daSostituire;

  // '' se per l'evento si può chiedere disponibilità, altrimenti il motivo (la richiesta si aprirebbe e si chiuderebbe subito)
  function chiedibile(e, oggi) {
    if (e.stato === 'annullato') return 'L\'evento è annullato.';
    if ((e.data || '') < oggi) return 'La partita è già passata.';
    if (!scoperto(e)) return 'L\'evento ha già un operatore: segnalo «da sostituire» per chiedere ad altri.';
    return '';
  }

  // Campi da scrivere perché la richiesta torni con l'evento, oppure null se è già allineata
  function allineamento(richiesta, evento, copia, oggi) {
    const aperta = !!evento && evento.stato !== 'annullato' && evento.data >= oggi && scoperto(evento);
    const assegnato = evento && !aperta && evento.stato !== 'annullato' && evento.data >= oggi ? (evento.operatoreId || '') : '';
    const out = {};
    if (richiesta.aperta !== aperta || (richiesta.assegnato || '') !== assegnato) Object.assign(out, { aperta, assegnato });
    const prima = richiesta.evento || {};
    if (evento && copia && CAMPI.some((k) => (prima[k] || '') !== (copia[k] || ''))) {
      Object.assign(out, { aperta, assegnato, evento: copia, aggiornata: true });
    }
    return Object.keys(out).length ? out : null;
  }

  const risposta = (richiesta, id) => ((richiesta.risposte || {})[id] || null);

  function statoPerOperatore(richiesta, id, oggi) {
    if (((richiesta.evento || {}).data || '') < oggi) return 'nascosta';
    const r = risposta(richiesta, id);
    if (richiesta.aperta) return !r ? 'da-rispondere' : r.r === 'si' ? 'risposto-si' : 'risposto-no';
    return richiesta.assegnato && richiesta.assegnato !== id && r && r.r === 'si' ? 'coperto' : 'nascosta';
  }

  function primaDellaModifica(richiesta, id) {
    const r = risposta(richiesta, id);
    return !!r && ms(r.il) < ms(richiesta.aggiornata);
  }

  function riassunto(richiesta) {
    const dest = lista(richiesta.destinatari);
    const con = (v) => dest.filter((id) => (risposta(richiesta, id) || {}).r === v);
    return { si: con('si'), no: con('no'), attesa: dest.filter((id) => !risposta(richiesta, id)).length };
  }

  const preselezione = ({ disponibilita, impegnato, onsite, giaChiesto }) =>
    (disponibilita === 'D' || disponibilita === 'P') && !impegnato && !onsite && !giaChiesto;

  DO.richiesteEvento = { ms, copiaEvento, chiedibile, allineamento, statoPerOperatore, primaDellaModifica, riassunto, preselezione };
})(window.DO = window.DO || {});
