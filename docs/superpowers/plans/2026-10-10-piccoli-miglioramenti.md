# Piccoli miglioramenti rimandati: piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** chiudere i punti minori rimandati nelle revisioni dei blocchi 1–8 (richiesta dell'utente: «procedi con tutti i piccoli miglioramenti»).

**Riferimento:** i punti «minor (deferred)» delle revisioni finali dei blocchi; quelli già risolti nei giri successivi (nuovo tentativo dei promemoria alle 11, avviso del giro vecchio, Invio nella scheda on-site, avviso oltre 31 giorni, escape degli orari, avviso on-site senza contratto) o legati solo al passaggio fra versioni ormai concluso (sito nuovo con regole/script vecchi, dashboard v21/v22) non si rifanno.

## Vincoli globali

- Nessun cambio di comportamento oltre a quanto scritto qui; testi neutri; `node --test test/*.test.js` verde; `pre-commit` verde; `?v=26` → `?v=27`.
- Ogni correzione con una prova che fallisce prima, dove la parte è provabile in Node (calcoli, script, archivio con il Firebase finto, importazione con la pagina finta); le parti solo grafiche si provano nel browser in demo.

---

### Task 1: Testi e calcoli (`app/comune.js`, `app/regole.js`)

- `DO.testoBlocco(n)`: 0 → «È il giorno dell'evento: per rinunciare chiama il supervisore.», 1 → «Manca 1 giorno o meno: per rinunciare chiama il supervisore.», n → «Mancano n giorni o meno: per rinunciare chiama il supervisore.».
- `DO.giorniDaCompilare(da, a, oggi, limite, giorniBlocco)`: giorni del periodo da oggi al limite, esclusi quelli nella finestra di blocco (stessa regola della pagina operatori) — usato dalla dashboard per «Mancano ancora», così operatore e supervisore contano gli stessi giorni.
- `DO.telefonoValido(t)`: vuoto o solo cifre, spazi, `+`, `-`, `/`, `.`, `(`, `)` con almeno 6 cifre.
- `DO.controllaVisualizzatore`: email con `/` → «Scrivi un'email valida.».
- `regole.js`: `TIPI` letto con `hasOwnProperty` (un `compenso` come `toString` vale Diurno); commenti superati sistemati («competizioni UEFA», «separatore delle migliaia»).
- Prove: `testo del blocco`, `giorni da compilare in una richiesta`, `numero di reperibilità valido`, `email con la barra`, `compenso con un nome di Object.prototype`, `compensi: Dimezzato di giorno, Notturno di notte, Maggiorato di notte`, `calendario: assegnato e da sostituire`, `martedì della settimana col cambio d'ora di marzo`.

### Task 2: Script delle email (`backend/Codice.gs`, `test/gs.js`)

- Promemoria con `LockService.getScriptLock().tryLock(…)`: un secondo giro contemporaneo non spedisce (`{ saltato: 'in corso' }`).
- `firestoreAdmin`: risposta non JSON (pagina d'errore 502) → «Lettura di Firebase non riuscita (502).».
- `attivaPromemoria`: l'anteprima dice anche quanti eventi sono da sistemare.
- `impostazioniDashboard`: se l'elenco degli attivatori non si legge, il riquadro si carica lo stesso (`promemoriaProgrammato`/`backupProgrammato` falsi).
- `notificaOnsite`: niente email per un deployment annullato e al massimo una al minuto per operatore (come `notificaInvio`).
- Backup: voci «Telefono di reperibilità» e «Giorni di blocco» (da `impostazioni/operativo`) nel foglio Impostazioni; colonna U «ID operatore» in Convocazioni e colonna I «ID» in Operatori; «Invia un backup adesso» ripetuto entro 2 minuti da un invio riuscito non rispedisce (risponde con il backup appena inviato).
- Prove: le corrispondenti in `promemoria.test.js`, `email-onsite.test.js`, `backup.test.js`, più `impostazioni/operativo assente` e `salvataggio con il solo interruttore`.

### Task 3: Archivio (`app/dati-firebase.js`, `app/demo.js`, `app/comune.js`)

- `modificaOnsite` in una transazione (posti e destinatari riletti al momento della scrittura).
- Uscita forzata con «Questa email non ha accesso…»: si cancella anche la copia dei dati sul dispositivo (come «Esci»).
- `controllaEmail`: email con `/` → «Scrivi un'email valida.».
- `DO.inviaEmail`: «Operazione non consentita.» (azione sconosciuta allo script) → «Script delle email da aggiornare (vedi README).».
- Prove nel Firebase finto: `uscita di un collega tolto: copia locale cancellata`, `modifica del deployment in una transazione`, `importazione: dati degli operatori nuovi`; in `comune.test.js` la traduzione del messaggio dello script.

### Task 4: Dashboard

- Calendario: avvisi sopra il calendario; con l'uscita forzata il calendario si chiude; il riquadro dei dettagli resta aperto (riaperto sulla stessa voce) dopo un aggiornamento in tempo reale; stato nel riquadro con `DO.esc`; tastiera: focus dentro il calendario, ritorno al tasto che l'ha aperto, dettagli anche al focus, etichette con giorno, testo e stato; tasto «Schermo intero» / «Esci dallo schermo intero»; `aria-label` sulla legenda; un solo elenco dei mesi.
- Convocazioni: cartellino «Notturno» / «Maggiorato» per gli eventi di competizioni con quel compenso.
- Impostazioni: competizione chiamata «Remote TL» o «Remote Support» → «Remote TL e Remote Support sono già le righe dei turni: scegli un altro nome.»; colore di una competizione nuova aggiornato subito; codice morto della casella tolto (JS e CSS); telefono di reperibilità controllato con `telefonoValido`; `novalidate` sul modulo dei colleghi; «Invia un backup adesso» con indirizzi modificati e non salvati → «Salva prima gli indirizzi dei supervisori.».
- Esporta mese fuori dalla stagione caricata → «La dashboard carica la stagione in corso (dal 1° agosto): per i mesi precedenti usa un backup.».
- Sola visualizzazione: testata «Disponibilità · Sola visualizzazione», sottotitoli di Convocazioni e Operatori e testo dell'elenco vuoto senza istruzioni di modifica, `aria-label` del tasto ⋯ «Apri evento».
- Importazione di un backup: operatori riconosciuti per ID (poi per nome), operatori ricreati con il loro ID; telefono di reperibilità e giorni di blocco ripristinati.
- Prove: `importazione` (ID operatore, operativo), resto nel browser.

### Task 5: Pagina operatori, istruzioni, pubblicazione

- Numero di reperibilità scritto accanto al tasto «Contatta il supervisore» (utile da computer).
- Testo del blocco con `DO.testoBlocco`.
- Dopo «Accetto» un deployment, le modifiche non inviate sui giorni diventati on-site si tolgono subito (non restano nel conteggio).
- In caso di errore nel leggere le impostazioni operative si tiene il valore già salvato sul dispositivo, non quello predefinito.
- README: virgola e ripetizione della riga «Tutti i valori…», commento delle regole spostato sopra le impostazioni; `?v=27`.
- Prova nel browser in demo; `node --test test/*.test.js` verde.
