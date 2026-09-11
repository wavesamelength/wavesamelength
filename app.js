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

// MapTap final scores don't go above 1000 - anything higher means a mis-paste/typo.
const MAX_SCORE = 1000;

let players = [];          // all league players, alphabetical
let results = [];          // every score doc ever submitted: { date, player, score }
let selectedPlayer = "";   // whoever is currently chosen in the dropdown
let legacyWins = {};       // baseline weekly-win counts from before this site existed
let forcedDays = new Set(); // dates manually locked in early via "Everyone's Done"

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
// calendar date has passed, everyone has already entered their score,
// or it was manually locked in early via the "Everyone's Done" button.
function isDayFinalized(dateStr, entryCount) {
    return dateStr < todayStr() || entryCount >= players.length || forcedDays.has(dateStr);
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

// One-off baseline of weekly wins racked up before this site tracked them.
async function loadLegacyWins() {
    const snap = await getDoc(doc(db, "meta", "legacyWins"));
    legacyWins = snap.exists() ? snap.data() : {};
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
        } else if (score > MAX_SCORE) {
            preview.textContent = `A score of ${score} is higher than MapTap allows (max ${MAX_SCORE}) — check what you pasted.`;
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

    if (score > MAX_SCORE) {
        message.textContent = `A score of ${score} is higher than MapTap allows (max ${MAX_SCORE}) — check what you pasted.`;
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

function listenForForcedDays() {
    onSnapshot(collection(db, "forcedDays"), snapshot => {
        forcedDays = new Set(snapshot.docs.map(d => d.id));
        renderAll();
    });
}

function entriesForDate(dateStr) {
    return results.filter(r => r.date === dateStr);
}

function renderAll() {
    renderTodayEntries();
    renderStandings();
    renderHorseRace();
}

// ======================================
// TODAY'S ENTRIES
// ======================================

// Sortable columns for the player summary table. Not persisted anywhere on
// purpose - a page refresh should always come back to the default sort.
const TODAY_ENTRIES_COLUMNS = {
    score: "Today",
    weekAvg: "Week Avg",
    allTimeAvg: "All-Time Avg",
    wins: "🏆",
};

let todayEntriesSort = { key: "score", direction: "desc" };

function renderTodayEntries() {
    const container = document.getElementById("today-entries");
    if (!container) return;

    const today = todayStr();
    const todayEntries = entriesForDate(today);
    const enteredPlayers = new Set(todayEntries.map(e => e.player));

    const weekStart = getLeagueWeek();
    const winCounts = computeWinCounts();

    // Rank whoever's entered so far (live, before the day is finalized).
    // The rank badge always reflects today's actual placement, regardless
    // of which column the table is currently sorted by.
    const ranked = rankDay(todayEntries).map(entry => ({
        ...entry,
        weekAvg: computeWeekAverage(entry.player, weekStart),
        allTimeAvg: computeAllTimeAverage(entry.player),
        wins: winCounts[entry.player] || 0,
    }));
    sortTodayEntries(ranked);

    const pending = players
        .filter(player => !enteredPlayers.has(player))
        .sort((a, b) => a.localeCompare(b));

    container.innerHTML = "";
    container.appendChild(buildTodayEntriesHeader());

    const sortedCol = key => (todayEntriesSort.key === key ? " sort-active" : "");

    ranked.forEach(({ player, score, weekAvg, allTimeAvg, wins }) => {
        const row = document.createElement("div");
        row.className = "entry-row";

        row.innerHTML = `
            <span class="entry-identity">
                ${avatarHtml(player)}
                <span class="entry-name">${player}</span>
            </span>
            <span class="stat-value stat-today status-done${sortedCol("score")}">${score}</span>
            <span class="stat-value${sortedCol("weekAvg")}">${formatAverage(weekAvg)}</span>
            <span class="stat-value${sortedCol("allTimeAvg")}">${formatAverage(allTimeAvg)}</span>
            <span class="stat-value ${wins > 0 ? "stat-wins" : "stat-wins-zero"}${sortedCol("wins")}">${wins}</span>
        `;

        container.appendChild(row);
    });

    pending.forEach(player => {
        const wins = winCounts[player] || 0;
        const row = document.createElement("div");
        row.className = "entry-row";

        row.innerHTML = `
            <span class="entry-identity">
                ${avatarHtml(player)}
                <span class="entry-name">${player}</span>
            </span>
            <span class="stat-value stat-today status-pending${sortedCol("score")}" title="Pending">⏳</span>
            <span class="stat-value${sortedCol("weekAvg")}">${formatAverage(computeWeekAverage(player, weekStart))}</span>
            <span class="stat-value${sortedCol("allTimeAvg")}">${formatAverage(computeAllTimeAverage(player))}</span>
            <span class="stat-value ${wins > 0 ? "stat-wins" : "stat-wins-zero"}${sortedCol("wins")}">${wins}</span>
        `;

        container.appendChild(row);
    });

    const forceBtn = document.getElementById("force-finalize-btn");
    if (forceBtn) {
        forceBtn.classList.toggle("hidden", isDayFinalized(today, todayEntries.length));
    }
}

function buildTodayEntriesHeader() {
    const header = document.createElement("div");
    header.className = "entry-row entry-header";

    header.appendChild(document.createElement("span")).className = "entry-identity";

    Object.entries(TODAY_ENTRIES_COLUMNS).forEach(([key, label]) => {
        const isActive = todayEntriesSort.key === key;
        const arrow = isActive ? (todayEntriesSort.direction === "desc" ? "▼" : "▲") : "";

        const button = document.createElement("button");
        button.type = "button";
        button.className = `stat-label sort-label${isActive ? " sort-active" : ""}`;
        button.innerHTML = `${label}${arrow ? ` <span class="sort-arrow">${arrow}</span>` : ""}`;
        button.addEventListener("click", () => {
            if (todayEntriesSort.key === key) {
                todayEntriesSort.direction = todayEntriesSort.direction === "desc" ? "asc" : "desc";
            } else {
                todayEntriesSort = { key, direction: "desc" };
            }
            renderTodayEntries();
        });

        header.appendChild(button);
    });

    return header;
}

// Sorts today's ranked (already-entered) rows in place. Missing stats
// (nobody has played enough games yet) always sink to the bottom rather
// than flip-flopping with the sort direction.
function sortTodayEntries(ranked) {
    const { key, direction } = todayEntriesSort;
    const multiplier = direction === "desc" ? -1 : 1;

    ranked.sort((a, b) => {
        const aValue = a[key];
        const bValue = b[key];
        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;
        return (aValue - bValue) * multiplier;
    });
}

// Player's average score across whichever of their own days fall within
// the given week (Wed-Tue) - includes today's just-submitted score, if any.
function computeWeekAverage(player, weekStart) {
    const scores = [];
    for (let offset = 0; offset < 7; offset++) {
        const date = addDays(weekStart, offset);
        const entry = entriesForDate(date).find(e => e.player === player);
        if (entry) scores.push(entry.score);
    }
    return scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
}

function computeAllTimeAverage(player) {
    const scores = results.filter(r => r.player === player).map(r => r.score);
    return scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
}

function formatAverage(average) {
    return average === null ? "–" : Math.round(average);
}

// ======================================
// FORCE FINALIZE TODAY
// (lets someone lock in today's scores early, even if not everyone
// has entered yet - e.g. so the league doesn't stall waiting on one person)
// ======================================

function initForceFinalizeButton() {
    const button = document.getElementById("force-finalize-btn");
    const modal = document.getElementById("force-finalize-modal");
    const cancelBtn = document.getElementById("force-finalize-cancel");
    const confirmBtn = document.getElementById("force-finalize-confirm");

    if (!button || !modal || !cancelBtn || !confirmBtn) return;

    button.addEventListener("click", () => modal.classList.remove("hidden"));
    cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

    modal.addEventListener("click", event => {
        if (event.target === modal) modal.classList.add("hidden");
    });

    confirmBtn.addEventListener("click", async () => {
        const originalLabel = confirmBtn.textContent;

        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        confirmBtn.textContent = "Locking in...";

        try {
            await setDoc(doc(db, "forcedDays", todayStr()), {
                forcedAt: serverTimestamp()
            });
            modal.classList.add("hidden");
        } finally {
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
            confirmBtn.textContent = originalLabel;
        }
    });
}

// ======================================
// COMPETITION-STYLE RANKING
// (ties share the same points; the next distinct score is only worth
// one point less, regardless of how many players tied above it)
// ======================================

function rankDay(entries) {
    const sorted = [...entries].sort((a, b) => b.score - a.score);
    const ranked = [];

    let i = 0;
    let groupIndex = 0;
    while (i < sorted.length) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1].score === sorted[i].score) {
            j++;
        }

        const points = POINTS[groupIndex] ?? 0;

        for (let k = i; k <= j; k++) {
            ranked.push({ player: sorted[k].player, score: sorted[k].score, rank: groupIndex + 1, points });
        }

        i = j + 1;
        groupIndex++;
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
        .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            const avgA = a.played > 0 ? a.points / a.played : 0;
            const avgB = b.played > 0 ? b.points / b.played : 0;
            if (avgB !== avgA) return avgB - avgA;
            return a.player.localeCompare(b.player);
        });
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
    const weekStart = getLeagueWeek();
    const standings = computeWeekStandings(weekStart);

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
// WEEKLY RACE
// (horse-race style view of this week's standings - each player's bar
// runs to their share of the current leader's points)
// ======================================

function renderHorseRace() {
    const container = document.getElementById("horse-race");
    if (!container) return;

    const weekStart = getLeagueWeek();
    const standings = computeWeekStandings(weekStart);
    const totalGames = daysFinalizedSoFar(weekStart);

    container.innerHTML = "";

    if (!standings.length || standings[0].points === 0) {
        container.innerHTML = "No scores yet this week 🐎";
        return;
    }

    const leadPoints = standings[0].points;
    const trailPoints = standings[standings.length - 1].points;
    const pointsRange = leadPoints - trailPoints;

    // Scaling relative to the leader alone (points / leadPoints) squashes
    // everyone into a narrow band whenever scores are close together -
    // e.g. 7 vs 10 points is a real gap but only 70% vs 100% width. Instead
    // we stretch the full track between the trailing and leading scores, so
    // close races still look close but distinct.
    const MIN_BAR_PCT = 15;

    standings.forEach(({ player, points, played }) => {
        const pct = pointsRange === 0
            ? 100
            : Math.round(MIN_BAR_PCT + ((points - trailPoints) / pointsRange) * (100 - MIN_BAR_PCT));

        const row = document.createElement("div");
        row.className = "race-row";

        row.innerHTML = `
            <span class="race-label">${avatarHtml(player)} ${player}</span>
            <div class="race-track">
                <div class="race-fill" style="width:${pct}%; background:${avatarColour(player)}">
                    <span class="race-value">${points} pt${points === 1 ? "" : "s"}</span>
                    <span class="race-horse">🐎</span>
                </div>
            </div>
            <span class="race-played">${played}/${totalGames} game${totalGames === 1 ? "" : "s"}</span>
        `;

        container.appendChild(row);
    });
}

// ======================================
// PREVIOUS WINNERS
// ======================================

// Tallies weekly wins per player: legacy baseline + one per completed week
// where someone actually scored (ties for #1 are excluded further down by
// computeWeekStandings, which always returns a single sorted leader).
function computeWinCounts() {
    const currentWeek = getLeagueWeek();

    const pastWeeks = new Set(
        results
            .map(r => getLeagueWeek(r.date))
            .filter(week => week !== currentWeek)
    );

    const winCounts = { ...legacyWins };

    pastWeeks.forEach(week => {
        const winner = computeWeekStandings(week)[0];
        if (!winner || winner.points === 0) return;

        winCounts[winner.player] = (winCounts[winner.player] || 0) + 1;
    });

    return winCounts;
}

// ======================================
// START APP
// ======================================

async function start() {
    updateWeekTitle();
    await Promise.all([loadPlayers(), loadLegacyWins()]);
    initEntryForm();
    initForceFinalizeButton();
    listenForResults();
    listenForForcedDays();
}

start();
