/* App settings. The Firebase web config is safe to publish: access to data is controlled by
   Firebase Authentication and the rules in firestore.rules, not by hiding these values. */
window.APP_CONFIG = {
  // Only this account can make or remove admins. It must sign in with a verified email (Google sign-in is verified).
  superAdminEmail: 'ttthamizh66@gmail.com',
  // Paste the firebaseConfig object from Firebase console > Project settings > Your apps.
  firebase: {
    apiKey: 'PASTE_API_KEY',
    authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
    projectId: 'PASTE_PROJECT_ID',
    storageBucket: 'PASTE_PROJECT_ID.appspot.com',
    messagingSenderId: 'PASTE_SENDER_ID',
    appId: 'PASTE_APP_ID'
  }
};
