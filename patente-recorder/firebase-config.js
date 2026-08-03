// Firebase Project settings > Your apps > Web app > SDK setup and configuration.
// This configuration identifies your Firebase project; authorization is enforced
// by Firebase Authentication and Cloud Storage Security Rules.
export const firebaseConfig = {
  apiKey: "AIzaSyB6NoBjUG91VMHwbS_Im8pDsmuIuG7d8ZY",
  authDomain: "programmer-s-playground.firebaseapp.com",
  projectId: "programmer-s-playground",
  storageBucket: "programmer-s-playground.firebasestorage.app",
  messagingSenderId: "119728432001",
  appId: "1:119728432001:web:b20634766fa5b10d6a7e80",
  measurementId: "G-7ZLDX86W3N"
};

// Only these Firebase Authentication users can enter the recorder interface.
// Cloud Storage rules independently enforce the same list on the server.
export const authorizedRecorderUids = [
  "iuxgWxoauTdc1U6oyB4VxxCOibk2"
];
