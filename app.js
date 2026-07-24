// ======================================
// MAPTAP LEAGUE APPLICATION LOGIC
// ======================================

import { db } from './firebase.js';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    getDocs,
    onSnapshot,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ======================================
// SETTINGS
// ======================================

// Points awarded by rank (index 0 = 1st place). Index 9 = last of 10.
const POINTS = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

let players = [];          // all league players, alphabetical
let results = [];          // every score doc ever submitted: { date, player, score }
let selectedPlayer = "";   // whoever is currently chosen in the dropdown

// ======================================
// DATE / WEEK HELPERS
// ======================================

// All date-string handling below stays in LOCAL time throughout (never
// round-tripping through toISOString/UTC), so it stays correct across
// timezones and DST - e.g. British Summer Time (UTC+1) would otherwise
// silently shift every date back by one day.

function pad2(n) {
    return String(n).padStart(2, "0");
}

function toDateStr(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function fromDateStr(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function todayStr() {
    return toDateStr(new Date());
}

// League weeks run Wednesday -> Tuesday.
function getLeagueWeek(dateStr = todayStr()) {
    const date = fromDateStr(dateStr);
    const day = date.getDay();
    const daysSinceWednesday = (day + 4) % 7;

    date.setDate(date.getDate() - daysSinceWednesday);

    return toDateStr(date);
}

function addDays(dateStr, amount) {
    const date = fromDateStr(dateStr);
    date.setDate(date.getDate() + amount);
    return toDateStr(date);
}

// A day only counts towards the league once it's "done" - either the
// calendar date has passed, or everyone has already entered their score.
function isDayFinalized(dateStr, entryCount) {
    return dateStr < todayStr() || entryCount >= players.length;
}

function updateWeekTitle() {
    const weekTitle = document.getElementById("week-title");
    if (!weekTitle) return;

    const weekStart = getLeagueWeek();
    const weekEnd = addDays(weekStart, 6);

    weekTitle.textContent =
        `Week of ${formatDate(weekStart)} – ${formatDate(weekEnd)}`;
}

function formatDate(dateStr) {
    return fromDateStr(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ======================================
// SCORE PASTE PARSING
// ======================================

// MapTap's "share score" clipboard text looks like:
//
//   www.maptap.gg July 24
//   67🤨 97🔥 85😁 42😞 90👑
//   Final score: 730
//
// We only trust the explicit "Final score: N" line - the round emoji/scores
// don't sum to it (there's a hidden bonus in the game's own maths), so it's
// not safe to try to recompute it ourselves. As a fallback, we also accept
// someone just typing/pasting the bare number.
function parseScoreFromPaste(text) {
    if (!text) return null;

    const trimmed = text.trim();

    const finalScoreMatch = trimmed.match(/final\s*score\s*:?\s*(\d+)/i);
    if (finalScoreMatch) {
        return Number(finalScoreMatch[1]);
    }

    const bareNumberMatch = trimmed.match(/^(\d+)$/);
    if (bareNumberMatch) {
        return Number(bareNumberMatch[1]);
    }

    return null;
}

// ======================================
// LOAD PLAYERS
// ======================================

async function loadPlayers() {
    const snapshot = await getDocs(collection(db, "players"));

    players = [];
    snapshot.forEach(playerDoc => players.push(playerDoc.id));
    players.sort((a, b) => a.localeCompare(b));

    populatePlayerSelect();
}

function populatePlayerSelect() {
    const select = document.getElementById("player-select");
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Select your name...</option>';

    players.forEach(player => {
        const option = document.createElement("option");
        option.value = player;
        option.textContent = player;
        select.appendChild(option);
    });
}

// ======================================
// AVATAR COLOURS (purely cosmetic)
// ======================================

const AVATAR_COLOURS = [
    "#f87171", "#fb923c", "#fbbf24", "#a3e635", "#34d399",
    "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#facc15"
];

function avatarColour(player) {
    let hash = 0;
    for (let i = 0; i < player.length; i++) {
        hash = (hash * 31 + player.charCodeAt(i)) >>> 0;
    }
    return AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
}

function avatarHtml(player) {
    const initial = player.trim().charAt(0).toUpperCase();
    return `<span class="avatar" style="background:${avatarColour(player)}">${initial}</span>`;
}

// ======================================
// SCORE ENTRY FORM
// ======================================

function initEntryForm() {
    const select = document.getElementById("player-select");
    const textarea = document.getElementById("score-paste");
    const preview = document.getElementById("score-preview");
    const message = document.getElementById("entry-message");
    const submitBtn = document.getElementById("submit-score");

    if (!select || !textarea || !submitBtn) return;

    select.addEventListener("change", () => {
        selectedPlayer = select.value;
        message.textContent = "";
        message.className = "entry-message";
        refreshEntryFormState();
    });

    textarea.addEventListener("input", () => {
        const score = parseScoreFromPaste(textarea.value);

        if (!textarea.value.trim()) {
            preview.classList.add("hidden");
        } else if (score === null) {
            preview.textContent = "Couldn't find a score in that text — paste your MapTap share text, or just type the number.";
            preview.className = "score-preview error";
        } else {
            preview.textContent = `Detected score: ${score} 🎯`;
            preview.className = "score-preview success";
        }
    });

    submitBtn.addEventListener("click", () => submitScore());

    refreshEntryFormState();
}

// Locks the form once the selected player has already submitted today.
function refreshEntryFormState() {
    const textarea = document.getElementById("score-paste");
    const submitBtn = document.getElementById("submit-score");
    const message = document.getElementById("entry-message");
    const preview = document.getElementById("score-preview");

    if (!textarea || !submitBtn) return;

    if (!selectedPlayer) {
        textarea.disabled = true;
        submitBtn.disabled = true;
        return;
    }

    const existing = results.find(
        r => r.date === todayStr() && r.player === selectedPlayer
    );

    if (existing) {
        textarea.disabled = true;
        submitBtn.disabled = true;
        textarea.value = "";
        preview.classList.add("hidden");
        message.textContent = `✅ You've already entered today's score: ${existing.score}. See you tomorrow!`;
        message.className = "entry-message success";
    } else {
        textarea.disabled = false;
        submitBtn.disabled = false;
    }
}

async function submitScore() {
    const textarea = document.getElementById("score-paste");
    const message = document.getElementById("entry-message");

    if (!selectedPlayer) {
        message.textContent = "Please select your name first.";
        message.className = "entry-message error";
        return;
    }

    const score = parseScoreFromPaste(textarea.value);

    if (score === null) {
        message.textContent = "Couldn't find a score in that text — paste your MapTap share text, or just type the number.";
        message.className = "entry-message error";
        return;
    }

    const date = todayStr();
    const docId = `${date}_${selectedPlayer}`;
    const ref = doc(db, "results", docId);

    const existing = await getDoc(ref);
    if (existing.exists()) {
        message.textContent = `You've already entered today's score: ${existing.data().score}.`;
        message.className = "entry-message error";
        refreshEntryFormState();
        return;
    }

    await setDoc(ref, {
        date,
        player: selectedPlayer,
        score,
        submittedAt: serverTimestamp()
    });

    message.textContent = `✅ Score of ${score} submitted for ${selectedPlayer}!`;
    message.className = "entry-message success";
}

// ======================================
// LIVE RESULTS FEED
// ======================================

function listenForResults() {
    onSnapshot(collection(db, "results"), snapshot => {
        results = snapshot.docs.map(d => d.data());
        renderAll();
    });
}

function entriesForDate(dateStr) {
    return results.filter(r => r.date === dateStr);
}

function renderAll() {
    renderTodayEntries();
    renderStandings();
    renderPreviousWinners();
}

// ======================================
// TODAY'S ENTRIES
// ======================================

function renderTodayEntries() {
    const container = document.getElementById("today-entries");
    if (!container) return;

    const today = todayStr();
    const todayEntries = entriesForDate(today);
    const enteredMap = new Map(todayEntries.map(e => [e.player, e.score]));

    container.innerHTML = "";

    players.forEach(player => {
        const row = document.createElement("div");
        row.className = "entry-row";

        const hasEntered = enteredMap.has(player);

        row.innerHTML = `
            ${avatarHtml(player)}
            <span class="entry-name">${player}</span>
            ${hasEntered
                ? `<span class="status-pill status-done">✅ ${enteredMap.get(player)}</span>`
                : `<span class="status-pill status-pending">⏳ Pending</span>`}
        `;

        container.appendChild(row);
    });
}

// ======================================
// COMPETITION-STYLE RANKING
// (ties share the higher points, next rank is skipped)
// ======================================

function rankDay(entries) {
    const sorted = [...entries].sort((a, b) => b.score - a.score);
    const ranked = [];

    let i = 0;
    while (i < sorted.length) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1].score === sorted[i].score) {
            j++;
        }

        const points = POINTS[i] ?? 0;

        for (let k = i; k <= j; k++) {
            ranked.push({ player: sorted[k].player, score: sorted[k].score, rank: i + 1, points });
        }

        i = j + 1;
    }

    return ranked;
}

// Totals points + games played for every player across all finalized days
// within the given week (week identified by its Wednesday start date).
function computeWeekStandings(weekStart) {
    const totals = {};
    const played = {};

    players.forEach(player => {
        totals[player] = 0;
        played[player] = 0;
    });

    for (let offset = 0; offset < 7; offset++) {
        const date = addDays(weekStart, offset);
        const dayEntries = entriesForDate(date);

        if (!isDayFinalized(date, dayEntries.length)) continue;
        if (dayEntries.length === 0) continue;

        rankDay(dayEntries).forEach(({ player, points }) => {
            totals[player] += points;
            played[player] += 1;
        });
    }

    return players
        .map(player => ({ player, points: totals[player], played: played[player] }))
        .sort((a, b) => b.points - a.points || a.player.localeCompare(b.player));
}

function daysFinalizedSoFar(weekStart) {
    let count = 0;
    for (let offset = 0; offset < 7; offset++) {
        const date = addDays(weekStart, offset);
        const dayEntries = entriesForDate(date);
        if (isDayFinalized(date, dayEntries.length) && dayEntries.length > 0) {
            count++;
        }
    }
    return count;
}

// ======================================
// STANDINGS
// ======================================

function renderStandings() {
    const table = document.getElementById("leaderboard");
    if (!table) return;

    const weekStart = getLeagueWeek();
    const standings = computeWeekStandings(weekStart);
    const totalDays = daysFinalizedSoFar(weekStart);

    table.innerHTML = "";

    standings.forEach((row, index) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${avatarHtml(row.player)} ${row.player}</td>
            <td>${row.points}</td>
            <td class="played-cell">${row.played}/${totalDays}</td>
        `;

        table.appendChild(tr);
    });

    checkWinner(weekStart, standings);
}

// ======================================
// WEEKLY WINNER
// ======================================

function checkWinner(weekStart, standings) {
    const card = document.getElementById("winner-card");
    if (!card) return;

    const today = todayStr();
    const weekEnd = addDays(weekStart, 6); // Tuesday
    const finalDayEntries = entriesForDate(weekEnd);
    const weekIsOver = today > weekEnd || isDayFinalized(weekEnd, finalDayEntries.length);

    if (!weekIsOver || !standings.length || standings[0].points === 0) {
        card.classList.add("hidden");
        return;
    }

    const winner = standings[0];

    card.classList.remove("hidden");
    document.getElementById("winner-name").innerHTML = `${avatarHtml(winner.player)} ${winner.player}`;
    document.getElementById("winner-score").innerText = `${winner.points} points`;
}

// ======================================
// PREVIOUS WINNERS
// ======================================

function renderPreviousWinners() {
    const historyDiv = document.getElementById("history");
    if (!historyDiv) return;

    const currentWeek = getLeagueWeek();

    const weeksWithResults = new Set(
        results
            .map(r => getLeagueWeek(r.date))
            .filter(week => week !== currentWeek)
    );

    const weeks = [...weeksWithResults].sort((a, b) => new Date(b) - new Date(a));

    historyDiv.innerHTML = "";

    if (weeks.length === 0) {
        historyDiv.innerHTML = "No completed weeks yet 🗺️";
        return;
    }

    weeks.forEach(week => {
        const standings = computeWeekStandings(week);
        const winner = standings[0];

        if (!winner || winner.points === 0) return;

        const card = document.createElement("div");
        card.className = "history-item";

        card.innerHTML = `
            <strong>Week of ${formatDate(week)} – ${formatDate(addDays(week, 6))}</strong><br>
            🏆 ${winner.player}<br>
            ${winner.points} points
            <hr>
        `;

        historyDiv.appendChild(card);
    });
}

// ======================================
// START APP
// ======================================

async function start() {
    updateWeekTitle();
    await loadPlayers();
    initEntryForm();
    listenForResults();
}

start();
