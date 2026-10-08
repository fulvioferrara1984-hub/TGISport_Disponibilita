/* Disponibilità Ops — funzioni comuni alle due pagine: chiamate al backend, sessione, date, avvisi. */
(function (DO) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const API_URL = (window.DO_CONFIG && window.DO_CONFIG.API_URL) || '';

  // ---------- testo ----------
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const iniziali = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  // ---------- date (sempre stringhe yyyy-mm-dd, settimane da lunedì) ----------
  const due = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  const daIso = (s) => { const [a, m, g] = s.split('-').map(Number); return new Date(a, m - 1, g); };
  const aggiungi = (s, n) => { const d = daIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunedi = (s) => aggiungi(s, -((daIso(s).getDay() + 6) % 7));
  const settimana = (lun) => Array.from({ length: 7 }, (_, i) => aggiungi(lun, i));
  const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const indiceGiorno = (s) => (daIso(s).getDay() + 6) % 7;

  function giorno(s) {
    const d = daIso(s);
    return { nome: GIORNI[indiceGiorno(s)], breve: GIORNI_BREVI[indiceGiorno(s)], num: d.getDate(), mese: MESI[d.getMonth()], meseBreve: MESI[d.getMonth()].slice(0, 3), anno: d.getFullYear() };
  }

  // "dall'8 al 14 ottobre", "dal 28 ottobre all'11 novembre"
  function periodo(da, a) {
    const art = (s, base) => ([1, 8, 11].includes(giorno(s).num) ? base + "ll'" : base + 'l ');
    const x = giorno(da), y = giorno(a);
    if (da === a) return 'il ' + x.nome.toLowerCase() + ' ' + x.num + ' ' + x.mese;
    return art(da, 'da') + x.num + (x.mese === y.mese ? '' : ' ' + x.mese) + ' ' + art(a, 'a') + y.num + ' ' + y.mese;
  }

  function etichettaSettimana(lun) {
    const a = giorno(lun), b = giorno(aggiungi(lun, 6));
    if (a.mese === b.mese) return a.num + ' – ' + b.num + ' ' + b.mese + ' ' + b.anno;
    if (a.anno === b.anno) return a.num + ' ' + a.meseBreve + ' – ' + b.num + ' ' + b.meseBreve + ' ' + b.anno;
    return a.num + ' ' + a.meseBreve + ' ' + a.anno + ' – ' + b.num + ' ' + b.meseBreve + ' ' + b.anno;
  }

  function quando(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d)) return '';
    const min = Math.round((Date.now() - d) / 60000);
    const ora = due(d.getHours()) + ':' + due(d.getMinutes());
    if (min < 1) return 'adesso';
    if (min < 60) return min + ' min fa';
    if (iso(d) === iso(new Date())) return 'oggi alle ' + ora;
    if (iso(d) === aggiungi(iso(new Date()), -1)) return 'ieri alle ' + ora;
    return d.getDate() + ' ' + MESI[d.getMonth()].slice(0, 3) + ', ' + ora;
  }

  const STATI = {
    D: { nome: 'Disponibile', breve: 'Disp.' },
    P: { nome: 'Parziale', breve: 'Parz.' },
    A: { nome: 'Non disponibile', breve: 'No' },
  };
  const nomeStato = (s) => (STATI[s] ? STATI[s].nome : 'Non indicato');

  // ---------- memoria del browser (può non esserci: navigazione privata, anteprime) ----------
  function leggi(chiave) {
    try { return JSON.parse(localStorage.getItem(chiave) || sessionStorage.getItem(chiave) || 'null'); } catch (e) { return null; }
  }
  function scrivi(chiave, valore, ricorda) {
    try {
      localStorage.removeItem(chiave);
      sessionStorage.removeItem(chiave);
      if (valore != null) (ricorda ? localStorage : sessionStorage).setItem(chiave, JSON.stringify(valore));
    } catch (e) { /* senza memoria si rientra a ogni visita */ }
  }

  // ---------- sessione e chiamate al backend ----------
  let sessione = null, chiaveSessione = '', alloScadere = null;

  function avviaSessione(ruolo, scaduta) {
    chiaveSessione = 'do-sessione-' + ruolo;
    sessione = leggi(chiaveSessione);
    alloScadere = scaduta;
    return sessione;
  }
  function salvaSessione(s, ricorda) {
    sessione = s;
    scrivi(chiaveSessione, s, ricorda);
  }
  function ricordata() {
    try { return !!localStorage.getItem(chiaveSessione); } catch (e) { return false; }
  }
  function aggiornaToken(token) {
    if (sessione) salvaSessione(Object.assign({}, sessione, { token }), ricordata());
  }
  function chiudiSessione() {
    sessione = null;
    scrivi(chiaveSessione, null);
    scrivi(chiaveSessione + '-dati', null);
  }

  // Ultimi dati ricevuti: si mostrano subito all'apertura mentre Google prepara quelli nuovi.
  // Stanno dove sta la sessione (dispositivo o sola scheda) e si cancellano con Esci.
  const leggiCopia = () => (sessione && leggi(chiaveSessione + '-dati')) || null;
  const salvaCopia = (dati) => { if (sessione) scrivi(chiaveSessione + '-dati', dati, ricordata()); };

  async function chiama(azione, dati) {
    const richiesta = Object.assign({ azione, token: sessione && sessione.token }, dati || {});
    let risposta;
    if (!API_URL) {
      risposta = await DO.demo.chiama(richiesta);
    } else {
      // Google a volte risponde lentamente o con una sua pagina d'errore invece del risultato:
      // si avvisa chi aspetta e si riprova. Ripetere è sicuro: il backend salva solo le differenze.
      const lento = setTimeout(() => avviso('Il server di Google risponde lentamente, attendi qualche secondo…', '', 8000), 6000);
      try {
        for (let tentativo = 1; !risposta; tentativo++) {
          let motivo;
          try {
            // text/plain evita la richiesta preliminare CORS, che Apps Script non gestisce
            const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(richiesta), redirect: 'follow' });
            const testo = await r.text();
            try { risposta = JSON.parse(testo); } catch (e) { motivo = 'Il server non ha risposto correttamente (' + r.status + '). Riprova tra poco.'; }
          } catch (e) {
            motivo = 'Connessione non riuscita: controlla la rete e riprova.';
          }
          if (risposta) break;
          if (tentativo === 3) throw new Error(motivo);
          await new Promise((fatto) => setTimeout(fatto, 700 * tentativo));
        }
      } finally {
        clearTimeout(lento);
      }
    }
    if (!risposta.ok) {
      // più chiamate possono scadere insieme: si torna all'accesso una volta sola
      if (risposta.codice === 'sessione' && azione !== 'accedi' && sessione) {
        chiudiSessione();
        if (alloScadere) alloScadere(risposta.errore);
      }
      throw new Error(risposta.errore || 'Errore sconosciuto.');
    }
    return risposta.dati;
  }

  // ---------- avvisi ----------
  function avviso(testo, tipo, durata) {
    let box = document.querySelector('.avvisi');
    if (!box) { box = document.createElement('div'); box.className = 'avvisi'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'avviso' + (tipo ? ' ' + tipo : '');
    el.textContent = testo;
    box.appendChild(el);
    setTimeout(() => el.remove(), durata || (tipo === 'errore' ? 6000 : 3500));
  }

  async function copia(testo, messaggio) {
    try {
      await navigator.clipboard.writeText(testo);
      avviso(messaggio || 'Copiato negli appunti.', 'ok');
    } catch (e) {
      window.prompt('Copia il testo:', testo);
    }
  }

  // ---------- accesso: mostra la scheda e si risolve con la risposta del backend ----------
  function chiediAccesso(prepara) {
    return new Promise((fatto) => {
      const box = $('accesso'), form = $('accesso-form'), errore = $('accesso-errore'), bottone = $('accesso-entra');
      box.hidden = false;
      const primo = form.querySelector('input');
      requestAnimationFrame(() => primo.focus());
      const invio = async (e) => {
        e.preventDefault();
        bottone.disabled = true;
        const etichetta = bottone.textContent;
        bottone.textContent = 'Verifica…';
        errore.hidden = true;
        try {
          const risposta = await prepara();
          form.removeEventListener('submit', invio);
          form.reset();
          box.hidden = true;
          fatto(risposta);
        } catch (err) {
          errore.textContent = err.message;
          errore.hidden = false;
          primo.select();
        } finally {
          bottone.disabled = false;
          bottone.textContent = etichetta;
        }
      };
      form.addEventListener('submit', invio);
    });
  }

  function mostraDemo() {
    if (API_URL) return;
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.innerHTML = '<b>Modalità demo</b>: dati di prova salvati solo in questo browser. Per usare il sito con il team, collega il Google Sheet (vedi README).';
    document.querySelector('.testata').after(b);
  }

  Object.assign(DO, {
    $, esc, iniziali, iso, daIso, aggiungi, lunedi, settimana, giorno, periodo, etichettaSettimana, quando, indiceGiorno,
    STATI, nomeStato, leggi, scrivi, avviaSessione, salvaSessione, aggiornaToken, chiudiSessione, leggiCopia, salvaCopia,
    sessione: () => sessione, chiama, avviso, copia, chiediAccesso, mostraDemo, inDemo: !API_URL,
  });
})(window.DO = window.DO || {});
