/* Disponibilità Ops — funzioni comuni alle due pagine: date, memoria del browser, avvisi, accesso, email. */
(function (DO) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CONFIG = window.DO_CONFIG || {};
  const SETTIMANE_AVANTI = 12;   // settimane future che gli operatori possono compilare

  // ---------- testo ----------
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const iniziali = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  // ---------- ruoli e turni remoti ----------
  // Nei dati il turno Remote TL si chiama ancora 'supervisione': i turni già creati non cambiano.
  const RUOLI = { OP: 'Remote OP', SUP: 'Remote Support', TL: 'Remote TL' };
  const MANSIONI = Object.assign(Object.create(null), { supervisione: 'Remote TL', support: 'Remote Support' });
  const mansione = (tipo) => MANSIONI[tipo] || '';
  const turnoRemoto = (tipo) => !!MANSIONI[tipo];
  const nomeTurno = (tipo) => (MANSIONI[tipo] ? 'Turno ' + MANSIONI[tipo] : '');
  // tipo da salvare: i due turni remoti, altrimenti partita
  const tipoEvento = (tipo) => (MANSIONI[tipo] ? tipo : 'partita');

  // ---------- date (sempre stringhe yyyy-mm-dd, settimane da lunedì) ----------
  const due = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  const daIso = (s) => { const [a, m, g] = s.split('-').map(Number); return new Date(a, m - 1, g); };
  const aggiungi = (s, n) => { const d = daIso(s); d.setDate(d.getDate() + n); return iso(d); };
  const lunedi = (s) => aggiungi(s, -((daIso(s).getDay() + 6) % 7));
  const settimana = (lun) => Array.from({ length: 7 }, (_, i) => aggiungi(lun, i));
  // scheda Convocazioni: la settimana parte di martedì, così una giornata di campionato (venerdì–lunedì) sta tutta insieme
  const martedi = (s) => aggiungi(s, -((daIso(s).getDay() + 5) % 7));
  // nuova email nell'app di posta predefinita (Outlook, se impostato): destinatario, oggetto e testo già scritti
  const mailto = (a, oggetto, testo) => 'mailto:' + encodeURIComponent(a || '').replace(/%40/g, '@')
    + '?subject=' + encodeURIComponent(oggetto) + '&body=' + encodeURIComponent(String(testo).replace(/\r?\n/g, '\r\n'));

  // ---------- accessi alla dashboard: supervisori e colleghi in sola visualizzazione ----------
  const normalizzaEmail = (e) => String(e || '').trim().toLowerCase();
  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  // supervisori: elenco nel codice; colleghi: elenco in Firestore (inElenco); sempre con l'indirizzo confermato
  function tipoAccesso({ email, verificata, supervisori, inElenco }) {
    if (!verificata) return 'nessuno';
    if ((supervisori || []).map(normalizzaEmail).includes(normalizzaEmail(email))) return 'supervisore';
    return inElenco ? 'sola' : 'nessuno';
  }
  function controllaVisualizzatore(email, elenco, supervisori) {
    const e = normalizzaEmail(email);
    // niente «/»: l'email è anche l'id del documento in Firestore
    if (!EMAIL.test(e) || e.includes('/')) return { errore: 'Scrivi un\'email valida.' };
    if ((supervisori || []).map(normalizzaEmail).includes(e)) return { errore: 'È già un supervisore.' };
    if ((elenco || []).map(normalizzaEmail).includes(e)) return { errore: 'È già nell\'elenco.' };
    return { email: e };
  }
  const invitoVisualizzatore = (email, link) => mailto(email, 'TGI Sport · accesso alla dashboard in sola visualizzazione',
    'Ciao, puoi consultare la dashboard di TGI Sport (Convocazioni, Riepilogo, Operatori) qui:\n' + link
    + '\n\nAl primo accesso premi "Crea account" con questa email (' + email + '), conferma l\'indirizzo con il link che ricevi e poi entra con la tua password.');

  // testo per chi non può più rinunciare da sé (N = giorni di blocco)
  const testoBlocco = (n) => (Number(n) === 0 ? 'È il giorno dell\'evento' : Number(n) === 1 ? 'Manca 1 giorno o meno' : 'Mancano ' + n + ' giorni o meno')
    + ': per rinunciare chiama il supervisore.';
  // numero di reperibilità: vuoto oppure cifre con i soliti separatori (almeno 6 cifre)
  const telefonoValido = (t) => { const s = String(t || '').trim(); return !s || (/^[0-9+\-/.() ]+$/.test(s) && (s.match(/\d/g) || []).length >= 6); };

  // il calendario si apre sul mese di oggi se la settimana mostrata contiene oggi (a inizio mese il martedì è ancora nel mese prima)
  const giornoDiRiferimento = (inizio, oggiIso) => (oggiIso >= inizio && oggiIso <= aggiungi(inizio, 6) ? oggiIso : inizio);
  // calendario mensile: settimane da lunedì a domenica che coprono tutto il mese "aaaa-mm" (da 4 a 6)
  function grigliaMese(mese) {
    const primo = mese + '-01', d = daIso(primo);
    const fine = aggiungi(lunedi(iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))), 6);
    const settimane = [];
    for (let g = lunedi(primo); g <= fine; g = aggiungi(g, 7)) settimane.push(settimana(g).map((x) => ({ data: x, delMese: x.slice(0, 7) === mese })));
    return settimane;
  }
  const oggi = () => iso(new Date());
  const limite = () => aggiungi(lunedi(oggi()), SETTIMANE_AVANTI * 7 - 1);
  const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const GIORNI_BREVI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const nomeMese = (i) => MESI[i][0].toUpperCase() + MESI[i].slice(1);
  const indiceGiorno = (s) => (daIso(s).getDay() + 6) % 7;
  // giorni di calendario fra oggi e la data (negativo se passata); arrotondato per il cambio dell'ora
  const giorniA = (data, oggiIso) => Math.round((daIso(data) - daIso(oggiIso)) / 864e5);
  // Finestra di blocco: mancano N giorni o meno (N = 3: evento lunedì → bloccato da venerdì)
  const bloccato = (data, oggiIso, giorniBlocco) => giorniA(data, oggiIso) <= giorniBlocco;
  // giorni di una richiesta che l'operatore può ancora compilare: da oggi al limite, fuori dalla finestra di blocco
  function giorniDaCompilare(da, a, oggiIso, limiteIso, giorniBlocco) {
    const out = [];
    for (let d = da > oggiIso ? da : oggiIso; d <= a && d <= limiteIso; d = aggiungi(d, 1)) if (!bloccato(d, oggiIso, giorniBlocco)) out.push(d);
    return out;
  }
  const OPERATIVO_PREDEFINITO = Object.freeze({ telefono: '', giorniBlocco: 3 });
  const NON_PIU_RINUNCIABILE = 'Non è più possibile rinunciare da qui: chiama il supervisore.';

  // Tasti di una convocazione per l'operatore, da sinistra a destra. Rinunciare si può solo a una
  // convocazione in attesa e fuori dalla finestra di blocco; altrimenti si telefona al supervisore.
  function azioniConvocazione(stato, nellaFinestra) {
    if (stato === 'convocato') return nellaFinestra ? { azioni: ['telefona', 'conferma'], spiegazione: true } : { azioni: ['rifiuta', 'conferma'], spiegazione: false };
    if (stato === 'confermato') return { azioni: ['telefona'], spiegazione: false };
    if (stato === 'rifiutato' && !nellaFinestra) return { azioni: ['riconferma'], spiegazione: false };
    return { azioni: [], spiegazione: false };
  }

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
    controllaVersione();
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
        // «Operazione non consentita.» = azione che lo script pubblicato non conosce ancora
        if (!risposta.ok) throw new Error(risposta.errore === 'Operazione non consentita.' ? 'Script delle email da aggiornare (vedi README).' : risposta.errore || 'Email non inviate.');
        return risposta.dati;
      }
      if (tentativo === 3) throw new Error(motivo);
      await new Promise((fatto) => setTimeout(fatto, 1000 * tentativo));
    }
  }

  // ---------- avvisi ----------
  function avviso(testo, tipo, durata) {
    let box = document.querySelector('.avvisi');
    if (!box) { box = document.createElement('div'); box.className = 'avvisi'; box.setAttribute('role', 'status'); }
    // a schermo intero si vede solo quell'elemento: gli avvisi vanno lì dentro
    const dove = document.fullscreenElement || document.body;
    if (box.parentNode !== dove) dove.appendChild(box);
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
      const box = $('accesso'), form = $('accesso-form'), errore = $('accesso-errore'), bottone = $('accesso-entra'), info = $('accesso-info');
      box.hidden = false;
      const primo = form.querySelector('input:not([hidden])');
      requestAnimationFrame(() => primo.focus());
      const invio = async (e) => {
        e.preventDefault();
        bottone.disabled = true;
        const etichetta = bottone.textContent;
        bottone.textContent = 'Verifica…';
        errore.hidden = true;
        if (info) info.hidden = true;
        try {
          const risposta = await prepara();
          form.removeEventListener('submit', invio);
          form.reset();
          box.hidden = true;
          fatto(risposta);
        } catch (err) {
          // alcuni esiti non sono errori ("controlla la posta"): vanno nel riquadro informativo
          const dove = err.info && info ? info : errore;
          dove.textContent = err.message;
          dove.hidden = false;
          if (!err.info) primo.select();
        } finally {
          bottone.disabled = false;
          bottone.textContent = etichetta;
        }
      };
      form.addEventListener('submit', invio);
    });
  }

  // ---------- nuova versione del sito ----------
  // Una pagina rimasta aperta da prima di una pubblicazione continua a usare il codice vecchio (e può salvare dati
  // nel formato vecchio): si confronta il ?v= degli script con quello della pagina pubblicata e si propone di ricaricare.
  const VERSIONE = (typeof document !== 'undefined' && document.currentScript && (/[?&]v=(\d+)/.exec(document.currentScript.src) || [])[1]) || '';
  const versioneDa = (html) => ((/app\/comune\.js\?v=(\d+)/.exec(String(html || '')) || [])[1] || '');
  const nuovaVersione = (attuale, html) => { const v = versioneDa(html); return !!attuale && !!v && v !== attuale; };

  function controllaVersione() {
    if (!VERSIONE || typeof fetch !== 'function') return;
    let avvisato = false;
    const controlla = async () => {
      if (avvisato || document.hidden) return;
      try {
        const r = await fetch(location.pathname + '?versione=' + Date.now(), { cache: 'no-store' });
        if (!r.ok || !nuovaVersione(VERSIONE, await r.text())) return;
      } catch (e) { return; }
      avvisato = true;
      const b = document.createElement('div');
      b.className = 'nuova-versione';
      b.setAttribute('role', 'status');
      b.innerHTML = '<span><b>È uscita una nuova versione del sito.</b> Ricarica la pagina per usarla.</span><button type="button" class="primario">Ricarica</button>';
      b.querySelector('button').addEventListener('click', () => location.reload());
      document.body.appendChild(b);
    };
    document.addEventListener('visibilitychange', controlla);
    setInterval(controlla, 15 * 60 * 1000);
  }

  // Foto di Firestore arrivata solo perché sono cambiati i metadati (scrittura confermata dal server)
  // senza cambiare provenienza (copia sul computer / server): non c'è niente di nuovo da disegnare.
  const soloMetadati = (foto, eraDalServer) => !foto.metadata.fromCache === eraDalServer && foto.docChanges().length === 0;

  function mostraDemo() {
    if (!DO.inDemo) return;
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.innerHTML = '<b>Modalità demo</b>: dati di prova salvati solo in questo browser. Per usare il sito con il team, collega Firebase (vedi README).';
    document.querySelector('.testata').after(b);
  }

  Object.assign(DO, {
    $, esc, iniziali, iso, daIso, aggiungi, lunedi, martedi, grigliaMese, giornoDiRiferimento, mailto, settimana, oggi, limite, giorno, periodo, etichettaSettimana, quando, indiceGiorno,
    giorniA, bloccato, OPERATIVO_PREDEFINITO, NON_PIU_RINUNCIABILE, azioniConvocazione,
    STATI, nomeStato, leggi, scrivi, avviaPagina, ricordato, ricorda, leggiCopia, salvaCopia, dimentica,
    inviaEmail, avviso, copia, chiediAccesso, mostraDemo, CONFIG, inDemo: !CONFIG.FIREBASE,
    versioneDa, nuovaVersione, soloMetadati, RUOLI, mansione, turnoRemoto, nomeTurno, tipoEvento, normalizzaEmail, tipoAccesso, controllaVisualizzatore, invitoVisualizzatore,
    testoBlocco, telefonoValido, giorniDaCompilare, nomeMese,
  });
})(window.DO = window.DO || {});
