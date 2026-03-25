import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, push, set, remove, update, query, orderByChild, equalTo, get } from "firebase/database";
import { getAuth, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCC6Y8BUIW4r5S5KDyVOar46LzWmvJ18G8",
  authDomain: "nextgen-cinema2.firebaseapp.com",
  databaseURL: "https://nextgen-cinema2-default-rtdb.firebaseio.com",
  projectId: "nextgen-cinema2",
  storageBucket: "nextgen-cinema2.firebasestorage.app",
  messagingSenderId: "815514025460",
  appId: "1:815514025460:web:62f51737fe564b63eecda1"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { ref, onValue, push, set, remove, update, query, orderByChild, equalTo, get, signInWithEmailAndPassword, signOut, signInWithPopup };
