/* Disponibilità Ops — funzioni comuni alle due pagine: date, memoria del browser, avvisi, accesso, email. */
(function (DO) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CONFIG = window.DO_CONFIG || {};
  const SETTIMANE_AVANTI = 12;   // settimane future che gli operatori possono compilare

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
  const oggi = () => iso(new Date());
  const limite = () => aggiungi(lunedi(oggi()), SETTIMANE_AVANTI * 7 - 1);
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

  // ---------- pagina: archivio dati (Firebase o demo) e sessione ----------
  let ruolo = '';

  function avviaPagina(r, alloScadere) {
    ruolo = r;
    DO.dati = DO.inDemo ? DO.demo : DO.firebase;
    DO.dati.configura(r, alloScadere);
  }

  // "Ricorda su questo dispositivo": l'accesso e la copia dei dati restano anche chiudendo il browser.
  const ricordato = () => !!leggi('do-ricorda-' + ruolo);
  const ricorda = (si) => scrivi('do-ricorda-' + ruolo, si ? 1 : null, true);

  // Ultimi dati ricevuti: si mostrano subito all'apertura mentre arrivano quelli aggiornati.
  const leggiCopia = () => leggi('do-copia-' + ruolo);
  const salvaCopia = (dati) => scrivi('do-copia-' + ruolo, dati, ricordato());
  const dimentica = () => { scrivi('do-copia-' + ruolo, null); ricorda(false); };

  // ---------- email: le spedisce lo script Google, in sottofondo ----------
  // Google a volte risponde lentamente o con una sua pagina d'errore: si riprova fino a 3 volte.
  async function inviaEmail(azione, dati) {
    if (!CONFIG.EMAIL_URL) throw new Error('Invio email non configurato.');
    const richiesta = Object.assign({ azione }, dati || {});
    for (let tentativo = 1; ; tentativo++) {
      let risposta, motivo;
      try {
        // text/plain evita la richiesta preliminare CORS, che Apps Script non gestisce
        const r = await fetch(CONFIG.EMAIL_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(richiesta), redirect: 'follow' });
        const testo = await r.text();
        try { risposta = JSON.parse(testo); } catch (e) { motivo = 'Il servizio email di Google non ha risposto correttamente.'; }
      } catch (e) {
        motivo = 'Connessione non riuscita.';
      }
      if (risposta) {
        if (!risposta.ok) throw new Error(risposta.errore || 'Email non inviate.');
        return risposta.dati;
      }
      if (tentativo === 3) throw new Error(motivo);
      await new Promise((fatto) => setTimeout(fatto, 1000 * tentativo));
    }
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

  // ---------- accesso: mostra la scheda e si risolve quando prepara() riesce ----------
  function chiediAccesso(prepara) {
    return new Promise((fatto) => {
      const box = $('accesso'), form = $('accesso-form'), errore = $('accesso-errore'), bottone = $('accesso-entra');
      box.hidden = false;
      const primo = form.querySelector('input:not([hidden])');
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
    if (!DO.inDemo) return;
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.innerHTML = '<b>Modalità demo</b>: dati di prova salvati solo in questo browser. Per usare il sito con il team, collega Firebase (vedi README).';
    document.querySelector('.testata').after(b);
  }

  Object.assign(DO, {
    $, esc, iniziali, iso, daIso, aggiungi, lunedi, settimana, oggi, limite, giorno, periodo, etichettaSettimana, quando, indiceGiorno,
    STATI, nomeStato, leggi, scrivi, avviaPagina, ricordato, ricorda, leggiCopia, salvaCopia, dimentica,
    inviaEmail, avviso, copia, chiediAccesso, mostraDemo, CONFIG, inDemo: !CONFIG.FIREBASE,
  });
})(window.DO = window.DO || {});
