/* Disponibilità Ops — configurazione del sito (vedi README).
 * Senza FIREBASE il sito parte in modalità demo, con dati di prova salvati solo nel browser.
 * Questi valori non sono segreti: la protezione dei dati sta nelle regole di Firestore. */
window.DO_CONFIG = {
  // Firebase → Impostazioni progetto → Le tue app → App web → firebaseConfig
  FIREBASE: {
    apiKey: 'AIzaSyAV-tZ8QI24bct6xzWV_2d6xV0FJL0H1O0',
    authDomain: 'tgi-availability.firebaseapp.com',
    projectId: 'tgi-availability',
    storageBucket: 'tgi-availability.firebasestorage.app',
    messagingSenderId: '761667025796',
    appId: '1:761667025796:web:c2e3c06389fec6a63f7bd1',
  },
  // email dei supervisori: le stesse di firebase/firestore.rules (aggiungerne una va fatto in entrambi i posti)
  SUPERVISORI: ['fferrara@tgisport.com', 'spedatella@tgisport.com', 'fgennaro@tgisport.com', 'ssolera@tgisport.com'],
  // app web di Google Apps Script che spedisce le email (backend/Codice.gs)
  EMAIL_URL: 'https://script.google.com/macros/s/AKfycbzG8Niw0btd24rbKsCsqFbPSdFi3HafWXd2BJKs_VRqD-CAxEGGEfvjiJJV8C5ksjq4AA/exec',
  // solo per le prove in locale con l'emulatore di Firebase
  EMULATORI: false,
};
