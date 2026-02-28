// Firebase configuration — replace with your project's config
// from https://console.firebase.google.com → Project Settings → Your apps
var firebaseConfig = {
  apiKey: "AIzaSyDvZ_A67oBjEj3YbvSjkSoP8N_v3f8_Xy4",
  authDomain: "tilespresets.firebaseapp.com",
  databaseURL: "https://tilespresets-default-rtdb.firebaseio.com",
  projectId: "tilespresets",
  storageBucket: "tilespresets.firebasestorage.app",
  messagingSenderId: "928536014679",
  appId: "1:928536014679:web:f75915e9a63e9482631812",
  measurementId: "G-N38EZNDJM3"
};

firebase.initializeApp(firebaseConfig);
var db = firebase.database();

