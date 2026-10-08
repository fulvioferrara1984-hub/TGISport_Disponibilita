/* Disponibilità Ops — configurazione del sito (vedi README).
 * Senza FIREBASE il sito parte in modalità demo, con dati di prova salvati solo nel browser.
 * Questi valori non sono segreti: la protezione dei dati sta nelle regole di Firestore. */
window.DO_CONFIG = {
  // Firebase → Impostazioni progetto → Le tue app → App web → firebaseConfig
  FIREBASE: null,
  // email dell'account dei supervisori creato in Firebase → Authentication (la stessa delle regole)
  SUPERVISORI_EMAIL: '',
  // app web di Google Apps Script che spedisce le email (backend/Codice.gs)
  EMAIL_URL: 'https://script.google.com/macros/s/AKfycbzgfkg0SPZ0RJ-xWtxx5e62NLxSdMqL3ITOOiQqiHbnLcxgCftBOwKZtC6A_vZPiPby_w/exec',
  // solo per le prove in locale con l'emulatore di Firebase
  EMULATORI: false,
};
