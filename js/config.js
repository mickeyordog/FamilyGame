// Paste your Firebase web app config here (Firebase console → Project settings → Your apps → Web app).
// These values are public by design; access is controlled by firestore.rules and database.rules.json. scripts/setup.sh fills this in.
export const firebaseConfig = {
  "apiKey": "AIzaSyCrLiS4OTFXn5XUVBWls7zzamqjXYDOlwo",
  "authDomain": "familygame-23209.firebaseapp.com",
  "projectId": "familygame-23209",
  "storageBucket": "familygame-23209.firebasestorage.app",
  "messagingSenderId": "325270622594",
  "appId": "1:325270622594:web:6afac651b4e2ee79ce3f9b",
  "databaseURL": "https://familygame-23209-default-rtdb.firebaseio.com"
};

// All state lives under games/{GAME_ID}. Change it to run a separate game on the same project.
export const GAME_ID = "main";
