// TripTracker settings. Everything in this file ships to the browser, so nothing here is secret.
// The data is protected by firestore.rules (anonymous sign-in required) and by hashed trip PINs.

// Firebase: Console → ⚙️ Project settings → General → Your apps → Web app → firebaseConfig
export const firebaseConfig = {
  apiKey: "AIzaSyDR-mciYf31qfsAlwoAoWL5MY_U-gP_a4o",
  authDomain: "triptracker-13737.firebaseapp.com",
  projectId: "triptracker-13737",
  storageBucket: "triptracker-13737.firebasestorage.app",
  messagingSenderId: "257898961100",
  appId: "1:257898961100:web:4a6946766b0f876f3a4a69"
};

// Admin panel code (6 digits), stored as a SHA-256 hash so the digits are not readable here.
// To change it: open tools/admin-hash.html, type the new code, paste the result below.
export const ADMIN_HASH = "76cc5cdc1cc3afe87257d98258db305e268e600f81863727d43714e41916573f";
