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

  // Confronto campo per campo: Firestore restituisce le mappe con le chiavi in ordine alfabetico
  const copiaDiversa = (prima, copia) => CAMPI.some((k) => ((prima || {})[k] || '') !== ((copia || {})[k] || ''));

  // Campi da scrivere perché la richiesta torni con l'evento, oppure null se è già allineata
  function allineamento(richiesta, evento, copia, oggi) {
    const aperta = !!evento && evento.stato !== 'annullato' && evento.data >= oggi && scoperto(evento);
    const assegnato = evento && !aperta && evento.stato !== 'annullato' && evento.data >= oggi ? (evento.operatoreId || '') : '';
    const out = {};
    if (richiesta.aperta !== aperta || (richiesta.assegnato || '') !== assegnato) Object.assign(out, { aperta, assegnato });
    if (evento && copia && copiaDiversa(richiesta.evento, copia)) {
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

  // assegnato: l'operatore ha rifiutato questo evento o va sostituito proprio qui
  const preselezione = ({ disponibilita, impegnato, onsite, giaChiesto, assegnato }) =>
    (disponibilita === 'D' || disponibilita === 'P') && !impegnato && !onsite && !giaChiesto && !assegnato;

  // Allineamento eseguito dalla dashboard a ogni aggiornamento: scrive le correzioni con scrivi(id, campi) → Promise.
  // Una correzione in corso non si riscrive; una fallita non si ripete (resta in console), una riuscita libera il posto
  // per i passaggi successivi dell'evento (assegnato → rifiutato → riassegnato…).
  function allineatore(scrivi) {
    const bloccate = new Set();
    return (richieste, eventi, regole, oggi) => {
      lista(richieste).forEach((r) => {
        const e = lista(eventi).find((x) => x.id === r.id) || null;
        const campi = allineamento(r, e, e ? copiaEvento(e, regole) : null, oggi);
        if (!campi) return;
        const chiave = r.id + JSON.stringify(campi);
        if (bloccate.has(chiave)) return;
        bloccate.add(chiave);
        Promise.resolve().then(() => scrivi(r.id, campi))
          .then(() => bloccate.delete(chiave), (err) => console.warn('Richiesta per evento non allineata:', r.id, err && err.message));
      });
    };
  }

  DO.richiesteEvento = { ms, copiaEvento, copiaDiversa, chiedibile, allineamento, allineatore, statoPerOperatore, primaDellaModifica, riassunto, preselezione };
})(window.DO = window.DO || {});
