// src/firebase/firebase.config.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyC4cG0yHQjS_t2Q4CnN-lCuwFJre8lmVLk",
  authDomain: "campus-cupid-multiverse.firebaseapp.com",
  projectId: "campus-cupid-multiverse",
  storageBucket: "campus-cupid-multiverse.firebasestorage.app",
  messagingSenderId: "771431869817",
  appId: "1:771431869817:web:031eec4c6afe16523213a8",
  measurementId: "G-N993ZJWKBZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export default app;