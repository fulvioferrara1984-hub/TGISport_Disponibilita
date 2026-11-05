// Menu laterale dei supervisori: voce attiva, percorso nella barra, data di oggi e cassetto sotto i 1024 px.
(function (DO) {
  'use strict';

  const ETICHETTE = {
    convocazioni: 'Convocazioni', griglia: 'Disponibilità', aggiornamenti: 'Aggiornamenti',
    riepilogo: 'Riepilogo', operatori: 'Operatori', impostazioni: 'Impostazioni',
  };

  function dataEstesa(iso) {
    const g = DO.giorno(iso);
    return g.nome + ' ' + g.num + ' ' + g.mese + ' ' + g.anno;
  }

  const chi = (nomeSalvato, email) => nomeSalvato || email || '';

  function segna(voci, vista, percorso) {
    voci.forEach((v) => {
      if (v.dataset.vista === vista) v.setAttribute('aria-current', 'page');
      else v.removeAttribute('aria-current');
    });
    percorso.textContent = ETICHETTE[vista] || '';
  }

  // Aperto, il fuoco va sulla prima voce; chiuso con Esc o con il velo torna su ☰. Scegliendo una voce non si sposta.
  function cassetto({ lato, velo, apri, documento }) {
    let aperto = false;

    const tasto = (e) => { if (e.key === 'Escape') chiudiTorna(); };

    function apriCassetto() {
      if (aperto) return;
      aperto = true;
      lato.classList.add('aperto');
      velo.hidden = false;
      apri.setAttribute('aria-expanded', 'true');
      documento.addEventListener('keydown', tasto);
      const prima = [...lato.querySelectorAll('.voce-menu')].find((v) => !v.hidden);
      if (prima) prima.focus();
    }

    function chiudi() {
      if (!aperto) return;
      aperto = false;
      lato.classList.remove('aperto');
      velo.hidden = true;
      apri.setAttribute('aria-expanded', 'false');
      documento.removeEventListener('keydown', tasto);
    }

    function chiudiTorna() {
      if (!aperto) return;
      chiudi();
      apri.focus();
    }

    velo.addEventListener('click', chiudiTorna);
    apri.addEventListener('click', () => { if (aperto) chiudiTorna(); else apriCassetto(); });

    return { apri: apriCassetto, chiudi, chiudiTorna, aperto: () => aperto };
  }

  // Il pannello sta accanto alla griglia finché è «sticky»: quando il foglio di stile lo manda sotto, ci si porta.
  function portaSeSotto(pannello, stile) {
    if (stile(pannello).position === 'static') pannello.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Sotto i 1024 px i numeri rossi stanno nel cassetto chiuso: ☰ dice che ci sono. Quelli di una voce nascosta non contano.
  function avvisi(apri, numeri) {
    const ci = numeri.some((n) => n.textContent !== '' && !n.parentElement.hidden);
    apri.classList.toggle('con-avvisi', ci);
    apri.setAttribute('aria-label', ci ? 'Apri il menu: ci sono novità' : 'Apri il menu');
  }

  DO.menu = { ETICHETTE, dataEstesa, chi, segna, cassetto, portaSeSotto, avvisi };
})(window.DO);
