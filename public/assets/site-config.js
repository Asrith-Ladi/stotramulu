/* ============================================================
   SITE CONFIG — single source of truth for the two values that were
   previously hardcoded independently in cloud.js, admin.js, and
   weekday.js (and would have needed a fourth copy for admin.html).
   Not a secret: the Firebase web config is public by design, and the
   admin UID only gates which client-side controls render — the real
   authorization boundary is the Firestore security rules.

   Loads first, before cloud.js/admin.js/weekday.js on the main site,
   and before admin-auth.js on admin.html.
============================================================ */
window.ADMIN_UID = "0d3PPSYaFncy1tY2oUGtBMGMFwu2";
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCDwmjKvg-4XFra1NevTX4wW8BGsUzzQtU",
  authDomain: "stotramulu-eddf4.firebaseapp.com",
  projectId: "stotramulu-eddf4",
  storageBucket: "stotramulu-eddf4.firebasestorage.app",
  messagingSenderId: "692972588346",
  appId: "1:692972588346:web:fd28b65084582ddd011403",
};
