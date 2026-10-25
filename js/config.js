// Paste your Firebase web app config here (Firebase console → Project settings → Your apps → Web app).
// These values are public by design; access is controlled by firestore.rules and storage.rules.
export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

// All state lives under games/{GAME_ID}. Change it to run a separate game on the same project.
export const GAME_ID = "main";
