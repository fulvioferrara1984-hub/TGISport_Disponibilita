# Correzioni dalla simulazione d'uso: piano di implementazione

> **Per chi esegue:** SOTTO-SKILL RICHIESTA: superpowers:executing-plans. I passi usano le caselle (`- [ ]`).

**Obiettivo:** correggere le difficoltà del report «Disponibilità Ops — Simulazione d'uso e difficoltà» (gruppi «Subito» e «Presto») e le decisioni prese con l'utente il 2026-10-11.

**Riferimento (al posto della spec):** il report, sezione Proposte, più le decisioni:
- la settimana diversa tra Convocazioni (mar–lun) e Disponibilità (lun–dom) resta;
- sulla pagina operatori le finestre del sistema (prompt/confirm) diventano finestre del sito;
- Riepilogo: contano solo gli eventi **confermati**; gli assegnati non confermati (Da inviare, In attesa) in un riquadro a parte con il costo previsto, separando i futuri dai già passati;
- nella finestra di un evento «In attesa di risposta» il supervisore può **Segna come confermata** (storico «Confermata dal supervisore»);
- l'operatore riceve un avviso prima di confermare un turno sovrapposto a un altro suo.

## Vincoli globali

- `node --test test/*.test.js` verde; `?v=29` → `?v=30`; testi neutri, senza scuse; finestre del supervisore restano quelle del sistema.
- Le parti pure (calcoli, lettura delle righe) in `app/regole.js` con prove in `test/regole.test.js`; le parti di pagina provate nel browser in demo (computer e telefono).

## Punti da sorvegliare in revisione

1. Riepilogo: un evento rifiutato con operatore non deve più contare (oggi conta); esportazione Excel del Riepilogo coerente.
2. Righe delle partite: formati accettati in più («15», «ore 18», «h18», «18.30») senza leggere male titoli con numeri («Milan-Torino 2»).
3. Doppioni: uguaglianza su data, orario e nome della partita normalizzato; gli eventi annullati non contano come doppioni.
4. Finestra del sito sulla pagina operatori: tastiera (Invio, Esc), focus, nessuna risposta doppia con tocchi ripetuti.
5. Settimana iniziale dell'operatore: con richieste aperte resta quella della richiesta; senza giorni compilabili resta la settimana corrente.

---

### Task 1: Calcoli e testi (`app/regole.js`)

- `R.tariffeDa(valori, attuali) → { tariffe } | { errore }`: ogni valore numero da 0 a 10000; vuoto o non valido → errore che nomina la voce («Tariffa P.IVA diurno: scrivi un importo da 0 a 10.000 €.»).
- `R.leggiPartite(testo, oggi, esistenti) → { ok, errori, doppie }`: formati «17/10 15:00», «17/10 15», «17/10 ore 18», «17/10 h18», «17/10 18.30»; errori che dicono cosa manca («manca la data (es. 17/10)», «manca l'orario (es. 15:00)», «data non valida», «manca la partita»); doppie dentro l'elenco («uguale alla riga N») e con gli eventi non annullati già presenti («già presente»), che non si creano.
- `R.conta(e)` = solo confermati con operatore; `R.inAttesa(e)` = operatore e stato Da inviare / In attesa.
- `R.giaIniziato(e, regole, oggi, ora)`.
- Competizione predefinita «European Qualifiers Women».
- Prove: `tariffe: vuota o non valida → errore`, `righe delle partite: formati e messaggi`, `righe delle partite: doppioni`, `riepilogo: contano solo i confermati, in attesa a parte`, `evento già iniziato`.

### Task 2: Dashboard (`app/convocazioni.js`, `app/impostazioni.js`, `app/admin.js`, `app/riepilogo.js`, `admin.html`)

- Tariffe con `R.tariffeDa`; nuove partite con `R.leggiPartite` (anteprima con doppie); turni: se un giorno ha già un turno dello stesso tipo, conferma («OK: crea un altro turno anche lì · Annulla: salta quei giorni»).
- Nuovo/modifica operatore: nome uguale a un altro → conferma; telefono con `DO.telefonoValido`.
- Invio: eventi già iniziati senza spunta e con «· già iniziato».
- «Email inviate a N operatori» al plurale (richieste di periodo, on-site, per evento).
- Sola visualizzazione: titolo della scheda «Sola visualizzazione · Disponibilità TGI Sport», nessun numero sulla scheda Convocazioni.
- Riepilogo: riquadro «In attesa di conferma» (numero e costo previsto, di cui già passati) e nota per sistemarli; finestra evento con «Segna come confermata» (solo In attesa di risposta, non in sola visualizzazione).

### Task 3: Pagina operatori (`app/operatore.js`, `app/comune.js`, `app/stile.css`, `index.html`)

- `DO.chiedi({ titolo, testo, campo?, ok, annulla })` → Promise (testo, true o null): finestra del sito; sostituisce motivo del rifiuto, accettazione on-site, annulla modifiche, uscita con modifiche.
- Toccare lo stato già scelto non lo toglie; «Cancella» accanto a un giorno con uno stato.
- Settimana iniziale: richiesta aperta → la sua; altrimenti la prima con giorni da compilare; altrimenti quella corrente.
- Prima dell'invio: giorni «Parziale» senza orari → «Invia lo stesso» / «Aggiungi gli orari».
- Prima di confermare: turno sovrapposto a un altro suo (confermato o in attesa) → conferma.

### Task 4: Pubblicazione

- `?v=30`; prova nel browser in demo (computer e telefono) dei punti dei Task 2 e 3; `node --test test/*.test.js` verde.

### Task 5: Vista mensile della pagina operatori (approvata dall'utente il 2026-10-12)

- Selettore «Settimana | Mese» nel riquadro delle disponibilità; si apre la settimana; scelta ricordata sul dispositivo (`do-vista-operatore`).
- Mese: navigatore «Ottobre 2026» (‹ › Oggi) fino al mese del limite; griglia lun–dom con numero, colore dello stato, segni per nota, convocazione, on-site, giorno richiesto, modifica non inviata; oggi cerchiato; passati e bloccati grigi.
- Tocco su un giorno → pannello (dal basso sul telefono, al centro sul computer): data, tre stati, orari/nota, «Cancella», «Fatto»; Disponibile e Non disponibile chiudono il pannello, Parziale lo lascia aperto; giorno bloccato → solo informazioni e «Contatta il supervisore».
- «Tutto il mese: Disponibile / Non disponibile» sui giorni modificabili; «Copia settimana precedente» solo nella settimana.
- Invio: modifiche + giorni modificabili del mese mostrato, con gli stessi controlli (Parziale senza orari).
- «Vai al periodo» delle richieste porta al mese nella vista mensile.
- Parti pure con prove in Node: celle del mese (`DO.celleMese`); il resto provato nel browser (computer e telefono).
