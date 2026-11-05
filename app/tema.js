// Tema scuro o chiaro. Si carica nel <head> senza defer, prima di tutto il resto: così il tema è già
// impostato al primo disegno e chi ha scelto il chiaro non vede lampi di scuro.
// La scelta resta nel browser del dispositivo (mai su Firestore); senza archivio vale per quella visita.
(function (DO) {
  'use strict';

  const CHIAVE = 'do-tema';
  const ICONE = {
    sole: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
    luna: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  };

  const temaDa = (salvato) => (salvato === 'chiaro' ? 'chiaro' : 'scuro');
  const altroTema = (t) => (t === 'chiaro' ? 'scuro' : 'chiaro');

  function leggi(archivio) {
    try { return temaDa(archivio.getItem(CHIAVE)); } catch (e) { return 'scuro'; }
  }
  function salva(archivio, t) {
    try { archivio.setItem(CHIAVE, t); } catch (e) { /* niente archivio: il tema vale per questa visita */ }
  }
  // anche solo chiedere localStorage può lanciare, se il browser blocca i dati del sito
  function archivioDelBrowser() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  const attuale = () => temaDa(document.documentElement.dataset.tema);

  const interruttori = [];
  function disegna({ elemento, solaIcona }) {
    const t = attuale();
    const testo = t === 'chiaro' ? 'Tema scuro' : 'Tema chiaro';
    const icona = '<svg class="ic-tema" viewBox="0 0 24 24" aria-hidden="true">' + (t === 'chiaro' ? ICONE.luna : ICONE.sole) + '</svg>';
    elemento.innerHTML = icona + (solaIcona ? '' : '<span>' + testo + '</span>');
    elemento.setAttribute('aria-label', testo);
    elemento.setAttribute('title', testo);
  }

  function cambia() {
    const t = altroTema(attuale());
    document.documentElement.dataset.tema = t;
    salva(archivioDelBrowser(), t);
    interruttori.forEach(disegna);
  }

  function collega(elemento, solaIcona) {
    const voce = { elemento, solaIcona: !!solaIcona };
    interruttori.push(voce);
    elemento.addEventListener('click', cambia);
    disegna(voce);
  }

  document.documentElement.dataset.tema = leggi(archivioDelBrowser());
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-interruttore-tema]').forEach((el) => collega(el, el.hasAttribute('data-sola-icona')));
  });

  DO.tema = { CHIAVE, temaDa, altroTema, leggi, salva, attuale, cambia, collega };
})(window.DO = window.DO || {});
