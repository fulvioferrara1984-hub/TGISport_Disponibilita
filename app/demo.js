/* Disponibilità Ops — backend di prova: imita il Google Apps Script salvando tutto nel browser.
 * Si usa solo quando in config.js manca API_URL. Password supervisori: demo · codici operatori: DEMO-0001 … */
(function (DO) {
  'use strict';

  const CHIAVE = 'do-demo-dati';
  const SETTIMANE_AVANTI = 12;
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const due = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
  const aggiungi = (s, n) => { const [a, m, g] = s.split('-').map(Number); return iso(new Date(a, m - 1, g + n)); };
  const lunedi = (s) => { const [a, m, g] = s.split('-').map(Number); return aggiungi(s, -((new Date(a, m - 1, g).getDay() + 6) % 7)); };
  const oggi = () => iso(new Date());
  const limite = () => aggiungi(lunedi(oggi()), SETTIMANE_AVANTI * 7 - 1);

  function iniziali() {
    const nomi = [
      ['Luca Bianchi', 'Operatore camera'], ['Giulia Conti', 'Regia'], ['Marco Esposito', 'Operatore camera'], ['Sara Ricci', 'Grafica'],
      ['Davide Marino', 'Audio'], ['Elena Greco', 'Produzione'], ['Paolo Gallo', 'Operatore camera'], ['Chiara Lombardi', 'Runner'],
    ];
    const operatori = nomi.map(([nome, mansione], i) => ({
      id: 'op-demo' + (i + 1), nome, mansione, email: nome.toLowerCase().replace(' ', '.') + '@esempio.it',
      telefono: '+39 333 000 00' + due(i + 1), attivo: true, codice: 'DEMO000' + (i + 1), ultimoInvio: '',
    }));
    const disponibilita = {};
    const lun = lunedi(oggi());
    const invii = [];
    operatori.slice(0, 6).forEach((o, k) => {
      disponibilita[o.id] = {};
      for (let i = 0; i < 14; i++) {
        const r = (k * 7 + i * 3) % 10;
        if (i > 9 && k % 2) continue;
        disponibilita[o.id][aggiungi(lun, i)] = r < 6 ? { s: 'D', n: '' } : r < 8 ? { s: 'P', n: 'Solo dalle 18:00' } : { s: 'A', n: '' };
      }
      o.ultimoInvio = new Date(Date.now() - (k + 1) * 3600e3 * 5).toISOString();
      invii.push({ id: 'inv' + k, quando: o.ultimoInvio, operatoreId: o.id, nome: o.nome, letto: k > 1,
        modifiche: [{ d: aggiungi(lun, 2 + k), da: '', a: 'D', n: '' }, { d: aggiungi(lun, 4 + k), da: 'D', a: 'A', n: '' }] });
    });
    invii.sort((a, b) => (a.quando < b.quando ? -1 : 1));
    return { operatori, disponibilita, invii, password: 'demo', impostazioni: { emailSupervisori: 'supervisori@esempio.it', emailAttive: true, urlAdmin: '' } };
  }

  function carica() {
    try { const d = JSON.parse(localStorage.getItem(CHIAVE)); if (d) return d; } catch (e) { /* si riparte dai dati di prova */ }
    return iniziali();
  }
  function salva(d) { try { localStorage.setItem(CHIAVE, JSON.stringify(d)); } catch (e) { /* solo in memoria */ } }

  let dati = null;
  const errore = (messaggio, codice) => ({ ok: false, errore: messaggio, codice: codice || '' });
  const pubblico = (o) => ({ id: o.id, nome: o.nome, mansione: o.mansione, email: o.email, telefono: o.telefono, attivo: o.attivo, ultimoInvio: o.ultimoInvio });
  const nonLetti = () => dati.invii.filter((x) => !x.letto).length;
  const norm = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nuovoCodice = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 8; i++) c += a[Math.floor(Math.random() * 32)]; return c; };
  const formato = (c) => c.slice(0, 4) + '-' + c.slice(4);

  function filtra(mappa, da, a) {
    const out = {};
    Object.keys(mappa || {}).forEach((d) => { if (d >= da && d <= a) out[d] = mappa[d]; });
    return out;
  }

  const azioni = {
    accedi(r) {
      if (r.ruolo === 'admin') {
        if (r.password !== dati.password) return errore('Password errata.');
        return { token: 'demo|ad' };
      }
      const op = dati.operatori.find((o) => o.codice === norm(r.codice));
      if (!op) return errore('Codice non valido.');
      if (!op.attivo) return errore('Il tuo accesso è disattivato: contatta i supervisori.');
      return { token: 'demo|op|' + op.id, operatore: pubblico(op) };
    },
    mieDisponibilita(r, op) {
      return { giorni: filtra(dati.disponibilita[op.id], r.da, r.a), operatore: pubblico(op), oggi: oggi(), limite: limite() };
    },
    inviaDisponibilita(r, op) {
      const mappa = dati.disponibilita[op.id] = dati.disponibilita[op.id] || {};
      const adesso = new Date().toISOString(), modifiche = [];
      for (const d of Object.keys(r.giorni || {}).sort()) {
        if (d < oggi() || d > limite()) return errore('Il giorno ' + d + ' non è più modificabile.');
        const prima = mappa[d] || { s: '', n: '' }, dopo = { s: r.giorni[d].s || '', n: String(r.giorni[d].n || '').trim() };
        if (prima.s === dopo.s && prima.n === dopo.n) continue;
        modifiche.push({ d, da: prima.s, a: dopo.s, n: dopo.n });
        mappa[d] = Object.assign(dopo, { t: adesso });
      }
      op.ultimoInvio = adesso;
      dati.invii.push({ id: 'inv' + Date.now(), quando: adesso, operatoreId: op.id, nome: op.nome, modifiche, letto: false });
      return { inviatoIl: adesso, modifiche: modifiche.length };
    },
    panoramica(r) {
      const disponibilita = {};
      Object.keys(dati.disponibilita).forEach((id) => { disponibilita[id] = filtra(dati.disponibilita[id], r.da, r.a); });
      return { operatori: dati.operatori.map(pubblico), disponibilita, nonLetti: nonLetti(), oggi: oggi(), limite: limite() };
    },
    stato() {
      return { nonLetti: nonLetti(), ultimo: dati.invii.length ? dati.invii[dati.invii.length - 1].quando : '' };
    },
    aggiornamenti(r) {
      return dati.invii.slice(-(r.limite || 100)).reverse();
    },
    segnaLetti(r) {
      dati.invii.forEach((x) => { if (!r.ids || r.ids.includes(x.id)) x.letto = true; });
      return { nonLetti: nonLetti() };
    },
    salvaOperatore(r) {
      const o = r.operatore || {};
      if (!String(o.nome || '').trim()) return errore('Il nome è obbligatorio.');
      const campi = { nome: o.nome.trim(), mansione: (o.mansione || '').trim(), email: (o.email || '').trim(), telefono: (o.telefono || '').trim(), attivo: o.attivo !== false };
      if (o.id) {
        const op = dati.operatori.find((x) => x.id === o.id);
        if (!op) return errore('Operatore non trovato.');
        Object.assign(op, campi);
        return { operatore: pubblico(op) };
      }
      const op = Object.assign({ id: 'op-' + Date.now().toString(36), codice: nuovoCodice(), ultimoInvio: '' }, campi);
      dati.operatori.push(op);
      return { operatore: pubblico(op), codice: formato(op.codice) };
    },
    nuovoCodice(r) {
      const op = dati.operatori.find((x) => x.id === r.id);
      if (!op) return errore('Operatore non trovato.');
      op.codice = nuovoCodice();
      return { codice: formato(op.codice) };
    },
    eliminaOperatore(r) {
      dati.operatori = dati.operatori.filter((x) => x.id !== r.id);
      delete dati.disponibilita[r.id];
      return { eliminato: r.id };
    },
    leggiImpostazioni() { return dati.impostazioni; },
    salvaImpostazioni(r) {
      dati.impostazioni = { emailSupervisori: r.emailSupervisori || '', emailAttive: r.emailAttive !== false, urlAdmin: r.urlAdmin || '' };
      return dati.impostazioni;
    },
    cambiaPassword(r) {
      if (r.attuale !== dati.password) return errore('La password attuale non è corretta.');
      if (String(r.nuova || '').length < 8) return errore('La nuova password deve avere almeno 8 caratteri.');
      dati.password = r.nuova;
      return { token: 'demo|ad' };
    },
  };
  const SOLO_OPERATORE = ['mieDisponibilita', 'inviaDisponibilita'];

  async function chiama(r) {
    await pausa(250);
    dati = carica();
    let risultato;
    if (r.azione === 'accedi') {
      risultato = azioni.accedi(r);
    } else {
      const [demo, ruolo, id] = String(r.token || '').split('|');
      const op = ruolo === 'op' && dati.operatori.find((o) => o.id === id && o.attivo);
      if (demo !== 'demo' || (ruolo === 'op' && !op)) return errore('Sessione scaduta: accedi di nuovo.', 'sessione');
      if (!azioni[r.azione] || (ruolo === 'op') !== SOLO_OPERATORE.includes(r.azione)) return errore('Operazione non consentita.');
      risultato = azioni[r.azione](r, op);
    }
    if (risultato && risultato.ok === false) return risultato;
    salva(dati);
    return { ok: true, dati: risultato };
  }

  DO.demo = { chiama, azzera: () => { try { localStorage.removeItem(CHIAVE); } catch (e) { /* niente */ } } };
})(window.DO = window.DO || {});
