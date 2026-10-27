/* Disponibilità Ops — building delle convocazioni remote: abbinamento con gli eventi della piattaforma (collezione progetti).
 * Funzioni pure: la dashboard dei supervisori legge i progetti dei giorni che servono e le usa per copiare il building
 * (all'invio) e per accorgersi di quelli cambiati dopo l'invio. Solo partite: mai i turni Remote TL / Remote Support.
 * Campo `building` della convocazione: assente = inviata prima di questa funzione, '' = inviata senza building. */
(function (DO) {
  'use strict';

  const lista = (x) => (Array.isArray(x) ? x : []);
  const testo = (v) => String(v == null ? '' : v).trim();
  // come la piattaforma (src/logica/chiave.ts): minuscole, senza accenti, solo lettere e cifre
  const normalizza = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

  // stati delle partite: da leggere i progetti (anche prima dell'invio) e già inviate all'operatore
  const DA_LEGGERE = ['assegnato', 'convocato', 'confermato'];
  const INVIATE = ['convocato', 'confermato'];

  const risultato = (building, motivo) => ({ building, motivo });

  // Building dell'evento della piattaforma che corrisponde alla partita: stesso giorno e stesse squadre.
  // La competizione serve solo a scegliere tra eventi con building diversi (i nomi nelle due app non coincidono).
  function abbina(conv, progetti) {
    const titolo = normalizza(conv && conv.titolo);
    if (!titolo) return risultato('', 'non trovato');
    const candidati = lista(progetti).filter((p) => p && p.data === conv.data && p.stato !== 'CANCELLED' && p.modalita !== 'FLYKIT'
      && normalizza(p.squadraA) + normalizza(p.squadraB) === titolo);
    if (!candidati.length) return risultato('', 'non trovato');
    const tutti = Array.from(new Set(candidati.map((p) => testo(p.building)).filter(Boolean)));
    if (!tutti.length) return risultato('', '');
    if (tutti.length === 1) return risultato(tutti[0], '');
    // building diversi: vale quello dell'unico candidato con la stessa competizione (una competizione vuota non conta)
    const competizione = normalizza(conv.competizione);
    const stessa = competizione ? candidati.filter((p) => normalizza(p.competizione) === competizione) : [];
    return stessa.length === 1 ? risultato(testo(stessa[0].building), '') : risultato('', 'ambiguo');
  }

  // Giorni (da oggi in poi, ordinati, senza doppioni) dei quali leggere i progetti: partite assegnate, convocate o confermate.
  function giorniDaLeggere(convocazioni, oggi) {
    const giorni = new Set();
    lista(convocazioni).forEach((e) => {
      if (e && !DO.turnoRemoto(e.tipo) && DA_LEGGERE.includes(e.stato) && e.data >= oggi) giorni.add(e.data);
    });
    return Array.from(giorni).sort();
  }

  // Partite già inviate all'operatore e ancora da giocare: le uniche che si rimandano o si completano.
  const inviataDaGiocare = (e, oggi) => !!e && !DO.turnoRemoto(e.tipo) && e.inviata === true && INVIATE.includes(e.stato) && e.data >= oggi;

  // Inviate con un building (anche '') che nella piattaforma adesso è un altro: vanno rimandate.
  // Un evento non trovato, ambiguo o senza building non cambia nulla: resta quello inviato.
  function daRimandare(convocazioni, progetti, oggi) {
    const out = [];
    lista(convocazioni).forEach((evento) => {
      if (!inviataDaGiocare(evento, oggi) || typeof evento.building !== 'string') return;
      const nuovo = abbina(evento, progetti).building;
      if (nuovo && nuovo !== evento.building) out.push({ evento, vecchio: evento.building, nuovo });
    });
    return out;
  }

  // Inviate prima di questa funzione (campo assente) il cui building si trova adesso: si completano senza rimandarle.
  function daCompletare(convocazioni, progetti, oggi) {
    const out = [];
    lista(convocazioni).forEach((evento) => {
      if (!inviataDaGiocare(evento, oggi) || typeof evento.building === 'string') return;
      const nuovo = abbina(evento, progetti).building;
      if (nuovo) out.push({ evento, nuovo });
    });
    return out;
  }

  DO.building = { normalizza, abbina, giorniDaLeggere, daRimandare, daCompletare };
})(window.DO = window.DO || {});
