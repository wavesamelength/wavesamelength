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

    container.innerHTML = "";

    players.forEach(player => {
        const row = document.createElement("div");

        row.className = "result-row";

        row.innerHTML = `
            <label>${player}</label>
            <input
                type="number"
                class="player-score"
                data-player="${player}"
                placeholder="Enter score"
            >
        `;

        container.appendChild(row);
    });
}

// ======================================
// SAVE RESULTS
// ======================================

document.getElementById("save-results").addEventListener(
    "click",
    async () => {
        const scores = [];

        document.querySelectorAll(".player-score").forEach(input => {
            const value = input.value.trim();

            if (value === "") {
                return;
            }

            scores.push({
                player: input.dataset.player,
                score: Number(value)
            });
        });

        if (scores.length !== players.length) {
            alert("Please enter a score for every player");
            return;
        }

        scores.sort((a, b) => b.score - a.score);

        const placements = scores.map(entry => entry.player);

        const today = new Date()
            .toISOString()
            .split("T")[0];

        await setDoc(
            doc(db, "results", today),
            {
                date: today,
                week: getLeagueWeek(),
                placements,
                scores
            }
        );

        alert("Results saved!");
    }
);

// ======================================
// LIVE LEADERBOARD
// ======================================

function listenForResults() {
    onSnapshot(
        collection(db, "results"),
        snapshot => {
            calculateLeaderboard(snapshot.docs);
            loadPreviousWinners(snapshot.docs);
        }
    );
}

async function calculateLeaderboard(results) {
    const scores = {};

    players.forEach(player => {
        scores[player] = 0;
    });

    const currentWeek = getLeagueWeek();

    results.forEach(result => {
        const data = result.data();

        if (data.week !== currentWeek) {
            return;
        }

        data.placements.forEach((player, index) => {
            if (POINTS[index] !== undefined) {
                scores[player] += POINTS[index];
            }
        });
    });

    const sorted = Object.entries(scores).sort(
        (a, b) => b[1] - a[1]
    );

    renderLeaderboard(sorted);
    checkWinner(sorted);
}

// ======================================
// PREVIOUS WINNERS
// ======================================

async function loadPreviousWinners(resultsSnapshot = null) {
    const historyDiv = document.getElementById("history");

    const docs =
        resultsSnapshot ||
        (await getDocs(collection(db, "results"))).docs;

    const weeks = {};
    const currentWeek = getLeagueWeek();

    docs.forEach(result => {
        const data = result.data();

        if (data.week === currentWeek) {
            return;
        }

        if (!weeks[data.week]) {
            weeks[data.week] = [];
        }

        weeks[data.week].push(data);
    });

    historyDiv.innerHTML = "";

    const weekEntries = Object.entries(weeks).sort(
        (a, b) => new Date(b[0]) - new Date(a[0])
    );

    if (weekEntries.length === 0) {
        historyDiv.innerHTML = "No completed weeks yet 🗺️";
        return;
    }

    weekEntries.forEach(([week, results]) => {
        const scores = {};

        players.forEach(player => {
            scores[player] = 0;
        });

        results.forEach(day => {
            day.placements.forEach((player, index) => {
                if (POINTS[index] !== undefined) {
                    scores[player] += POINTS[index];
                }
            });
        });

        const winner = Object.entries(scores).sort(
            (a, b) => b[1] - a[1]
        )[0];

        const card = document.createElement("div");

        card.className = "history-item";

        card.innerHTML = `
            <strong>Week starting ${week}</strong><br>
            🏆 ${winner[0]}<br>
            ${winner[1]} points
            <hr>
        `;

        historyDiv.appendChild(card);
    });
}

// ======================================
// DISPLAY LEADERBOARD
// ======================================

function renderLeaderboard(data) {
    const table = document.getElementById("leaderboard");

    table.innerHTML = "";

    data.forEach((player, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${player[0]}</td>
            <td>${player[1]}</td>
        `;

        table.appendChild(row);
    });
}

// ======================================
// WEEKLY WINNER
// ======================================

function checkWinner(sorted) {
    const today = new Date().getDay();

    if (today !== 2 || !sorted.length) {
        return;
    }

    const winner = sorted[0];

    const card = document.getElementById("winner-card");

    card.classList.remove("hidden");

    document.getElementById("winner-name").innerText =
        winner[0];

    document.getElementById("winner-score").innerText =
        `${winner[1]} points`;
}

// ======================================
// LEAGUE WEEK
// ======================================

function getLeagueWeek() {
    const now = new Date();

    const day = now.getDay();

    const daysSinceWednesday = (day + 5) % 7;

    const weekStart = new Date(now);

    weekStart.setDate(
        now.getDate() - daysSinceWednesday
    );

    return weekStart.toISOString().split("T")[0];
}

// ======================================
// START APP
// ======================================

loadPlayers();
listenForResults();
loadPreviousWinners();
updateWeekTitle();