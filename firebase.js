// ============================
// MAPTAP LEAGUE FIREBASE SETUP
// ============================


// Firebase imports

import { initializeApp } from 
"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";


import { 
    getFirestore 
} from 
"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


import {
    getAuth,
    signInAnonymously
}
from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";





// ============================
// YOUR FIREBASE CONFIG
// ============================
//
// Replace these values with
// your Firebase web app config
//

const firebaseConfig = {
  apiKey: "AIzaSyBxjCMqaH2c_gvGhXDibNjijBBNa1DJ1Ak",
  authDomain: "maptap-league.firebaseapp.com",
  projectId: "maptap-league",
  storageBucket: "maptap-league.firebasestorage.app",
  messagingSenderId: "306911246615",
  appId: "1:306911246615:web:598789340bdeecbd769f52"
};



// Initialise Firebase

const app = initializeApp(firebaseConfig);



// Database

export const db = getFirestore(app);



// Authentication

export const auth = getAuth(app);




// Automatically sign users in

signInAnonymously(auth)

.then(() => {

    console.log(
        "Connected to MapTap League"
    );

})


.catch((error)=>{


    console.error(
        "Firebase login failed:",
        error
    );


});
