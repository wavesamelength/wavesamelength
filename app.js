// ======================================
// MAPTAP LEAGUE APPLICATION LOGIC
// ======================================

import { db } from './firebase.js';
import {
    collection,
    doc,
    setDoc,
    getDocs,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ======================================
// SETTINGS
// ======================================

const POINTS = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
let players = [];

// ======================================
// WEEK TITLE
// ======================================

function updateWeekTitle() {
    const weekTitle = document.getElementById("week-title");

    if (!weekTitle) return;

    weekTitle.textContent = `Week starting ${getLeagueWeek()}`;
}

// ======================================
// LOAD PLAYERS
// ======================================

async function loadPlayers() {
    const snapshot = await getDocs(collection(db, "players"));

    players = [];

    snapshot.forEach(playerDoc => {
        players.push(playerDoc.id);
    });

    createResultInputs();
}

// ======================================
// SCORE INPUTS
// ======================================

function createResultInputs() {
    const container = document.getElementById("result-entry");

  