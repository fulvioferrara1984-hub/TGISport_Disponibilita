/* Disponibilità Ops — «Aggiungi al calendario» sulla pagina operatori: un evento di calendario da una convocazione
 * confermata o da un deployment on-site, come file .ics (iPhone, Outlook, altri) o link di Google Calendar.
 * Il calendario del telefono non si aggiorna da solo: se l'evento cambia, l'operatore lo corregge a mano. */
(function (DO) {
  'use strict';

  const ZONA = 'Europe/Rome';
  const SENZA_FINE = 3 * 60;     // minuti di un turno senza fine turno
  const DOPO_PARTITA = 2 * 60;   // … ma almeno fino a 2 ore dopo l'inizio della partita
  const ritrovo = (c) => c.convocazione || c.convocazioneCalcolata || '';
  const fineTurno = (c) => c.fine || c.fineCalcolata || '';
  const minuti = (h) => { const [o, m] = h.split(':').map(Number); return o * 60 + m; };
  const hhmm = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const uid = (tipo, id) => tipo + '-' + id + '@tgisport-disponibilita';
  const chiusura = (indirizzo) => 'Le tue convocazioni: ' + indirizzo;

  // Evento: { uid, titolo, descrizione, url, tuttoIlGiorno, da, a } con da e a 'aaaa-mm-ggThh:mm' (ora di Roma)
  // oppure, tutto il giorno, 'aaaa-mm-gg' con a = il giorno dopo l'ultimo (come vogliono .ics e Google).
  function daConvocazione(c, indirizzo) {
    const turno = DO.turnoRemoto(c.tipo), r = ritrovo(c), fine = fineTurno(c), inizio = r || c.orario || '';
    const righe = turno ? [r && (fine ? 'Turno ' + r + ' – ' + fine : 'Inizio turno ' + r)]
      : [c.orario && 'Evento alle ' + c.orario,
        [c.competizione, c.round && (/^\d+$/.test(c.round) ? 'giornata ' + c.round : c.round)].filter(Boolean).join(' · '),
        r && 'Ritrovo ' + r + (fine ? ' – fine turno ' + fine : '')];
    const ev = {
      uid: uid('convocazione', c.id), titolo: 'TGI Sport · ' + (turno ? DO.nomeTurno(c.tipo) : c.titolo),
      descrizione: righe.concat(chiusura(indirizzo)).filter(Boolean).join('\n'), url: indirizzo,
    };
    if (!inizio) return Object.assign(ev, { tuttoIlGiorno: true, da: c.data, a: DO.aggiungi(c.data, 1) });
    // ritrovo dopo l'orario della partita: il turno parte il giorno prima (come R.giaIniziato)
    const giorno = c.orario && inizio > c.orario ? DO.aggiungi(c.data, -1) : c.data;
    const da = minuti(inizio);
    // senza fine turno: 3 ore dal ritrovo, ma non prima di 2 ore dopo l'inizio della partita
    const partita = c.orario ? minuti(c.orario) + (giorno !== c.data ? 24 * 60 : 0) : 0;
    let a = fine && fine !== inizio ? minuti(fine) : Math.max(da + SENZA_FINE, partita + DOPO_PARTITA);
    if (a <= da) a += 24 * 60;   // fine dopo mezzanotte
    return Object.assign(ev, { tuttoIlGiorno: false, da: giorno + 'T' + inizio, a: DO.aggiungi(giorno, Math.floor(a / 1440)) + 'T' + hhmm(a % 1440) });
  }

  // deployment on-site: tutto il giorno dal primo all'ultimo giorno, con le attività nella descrizione
  function daOnsite(d, ruolo, indirizzo) {
    const giorni = (d.giorni || []).map((x) => {
      const g = DO.giorno(x.data);
      return [g.breve + ' ' + g.num + ' ' + g.mese, x.attivita, x.partita].filter(Boolean).join(' · ');
    });
    return {
      uid: uid('onsite', d.id), titolo: 'TGI Sport · On-site ' + d.luogo + (d.titolo ? ' · ' + d.titolo : ''),
      descrizione: [[d.sport, ruolo && 'posto on-site ' + ruolo].filter(Boolean).join(' · ')].concat(giorni, d.note, chiusura(indirizzo)).filter(Boolean).join('\n'),
      url: indirizzo, tuttoIlGiorno: true, da: d.da, a: DO.aggiungi(d.a, 1),
    };
  }

  // ---------- file .ics ----------
  const VTIMEZONE = ['BEGIN:VTIMEZONE', 'TZID:' + ZONA,
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE'];
  // '2026-10-24T19:15' → '20261024T191500', '2026-10-24' → '20261024'
  const compatta = (s) => s.replace(/[-:]/g, '') + (s.includes('T') ? '00' : '');
  const testoIcs = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

  // righe al massimo di 75 byte: le successive iniziano con uno spazio; una lettera non si spezza mai
  function piega(riga) {
    const pezzi = [];
    let attuale = '', byte = 0;
    for (const ch of riga) {
      const cp = ch.codePointAt(0), n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (byte + n > 75) { pezzi.push(attuale); attuale = ' '; byte = 1; }
      attuale += ch;
      byte += n;
    }
    return pezzi.concat(attuale).join('\r\n');
  }

  function ics(ev, adesso) {
    const quando = ev.tuttoIlGiorno
      ? ['DTSTART;VALUE=DATE:' + compatta(ev.da), 'DTEND;VALUE=DATE:' + compatta(ev.a)]
      : ['DTSTART;TZID=' + ZONA + ':' + compatta(ev.da), 'DTEND;TZID=' + ZONA + ':' + compatta(ev.a)];
    const avviso = ev.tuttoIlGiorno ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + testoIcs(ev.titolo), 'TRIGGER:-PT1H', 'END:VALARM'];
    const righe = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TGI Sport//Disponibilita Ops//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
      .concat(ev.tuttoIlGiorno ? [] : VTIMEZONE,
        ['BEGIN:VEVENT', 'UID:' + ev.uid, 'DTSTAMP:' + adesso.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')],
        quando, ['SUMMARY:' + testoIcs(ev.titolo), 'DESCRIPTION:' + testoIcs(ev.descrizione), 'URL:' + ev.url],
        avviso, ['END:VEVENT', 'END:VCALENDAR']);
    return righe.map(piega).join('\r\n') + '\r\n';
  }

  // Google Calendar: si apre già compilato; gli avvisi sono quelli che l'operatore ha impostato lì
  function linkGoogle(ev) {
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.titolo)
      + '&dates=' + compatta(ev.da) + '/' + compatta(ev.a) + (ev.tuttoIlGiorno ? '' : '&ctz=' + ZONA)
      + '&details=' + encodeURIComponent(ev.descrizione);
  }

  const nomeFile = (ev) => 'TGI-Sport-' + ev.da.slice(0, 10) + '.ics';
  // indirizzo del file da aprire: blob, perché su iPhone Safari un indirizzo data: non fa nulla
  // (provato su iPhone il 2026-10-21: data: con e senza nome del file nulla, blob: e file vero aprono Calendario)
  const indirizzoFile = (testo) => URL.createObjectURL(new Blob([testo], { type: 'text/calendar' }));

  // riga del pannello: «Sabato 24 ottobre · 19:15 – 23:00», «Dal 12 al 13 novembre»
  function quando(ev) {
    const data = (s) => { const g = DO.giorno(s); return g.nome + ' ' + g.num + ' ' + g.mese; };
    if (ev.tuttoIlGiorno) {
      const ultimo = DO.aggiungi(ev.a, -1), p = DO.periodo(ev.da, ultimo);
      return ultimo === ev.da ? data(ev.da) : p.charAt(0).toUpperCase() + p.slice(1);
    }
    const giornoDa = ev.da.slice(0, 10), giornoA = ev.a.slice(0, 10);
    return data(giornoDa) + ' · ' + ev.da.slice(11) + ' – ' + ev.a.slice(11) + (giornoA !== giornoDa ? ' di ' + DO.giorno(giornoA).nome.toLowerCase() : '');
  }

  // iPhone e iPad (anche l'iPad che si presenta come Mac) e se il browser è proprio Safari, l'unico che apre il file .ics
  // in Calendario: Chrome, Firefox, Edge, Opera, l'app Google e i browser dentro le altre app di solito no
  function dispositivo(ua, tocchi) {
    const iPhone = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && tocchi > 1);
    const safari = /Version\/\d.*Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\//.test(ua);
    return { apple: iPhone || /Macintosh/.test(ua), fuoriDaSafari: iPhone && !safari };
  }

  DO.agenda = { daConvocazione, daOnsite, ics, linkGoogle, nomeFile, indirizzoFile, quando, dispositivo };
})(window.DO = window.DO || {});
