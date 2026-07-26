// ======================================
// FILM CLUB APPLICATION LOGIC
// ======================================

import { db } from './firebase.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ======================================
// OMDb API KEY
// ======================================
//
// IMDb has no public/free API. OMDb (omdbapi.com) serves IMDb-sourced
// posters, titles and plot summaries and is the standard free stand-in.
// Grab a free key (1,000 requests/day) at:
//   https://www.omdbapi.com/apikey.aspx
// then paste it in below.

const OMDB_API_KEY = "8e950e92";

// ======================================
// STATE
// ======================================

let members = [];              // club member names, alphabetical
let currentPick = null;        // the Firestore doc for the current month's pick (or null)
let selectedRatingStars = 0;   // the star value the voter is currently hovering/choosing
let previewFilm = null;        // OMDb detail object awaiting confirmation

// ======================================
// DATE / MONTH HELPERS
// ======================================

// Kept in local time throughout so the "current month" always matches
// whatever month it actually is for the person looking at the page.

function pad2(n) {
    return String(n).padStart(2, "0");
}

function currentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function addMonths(monthStr, delta) {
    const [y, m] = monthStr.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthLabel(monthStr) {
    const [y, m] = monthStr.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// ======================================
// MISC HELPERS
// ======================================

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

// A random per-browser ID lets someone change their own star rating on a
// return visit, without ever storing who they are.
function getVoterId() {
    let id = localStorage.getItem("filmClubVoterId");
    if (!id) {
        id = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("filmClubVoterId", id);
    }
    return id;
}

// ======================================
// CLUB MEMBERS
// ======================================

function listenForMembers() {
    onSnapshot(collection(db, "filmClubMembers"), snapshot => {
        members = snapshot.docs.map(d => d.id).sort((a, b) => a.localeCompare(b));
        renderMembers();
        refreshDrawButton();
    });
}

function renderMembers() {
    const list = document.getElementById("members-list");
    if (!list) return;

    list.innerHTML = "";

    if (members.length === 0) {
        list.innerHTML = '<li class="search-empty">No members yet &mdash; add your friends below.</li>';
        return;
    }

    members.forEach(name => {
        const li = document.createElement("li");
        li.innerHTML = `
            <span>${escapeHtml(name)}</span>
            <button class="remove-member-btn" data-name="${escapeHtml(name)}" title="Remove">✕</button>
        `;
        list.appendChild(li);
    });

    list.querySelectorAll(".remove-member-btn").forEach(btn => {
        btn.addEventListener("click", () => deleteDoc(doc(db, "filmClubMembers", btn.dataset.name)));
    });
}

function initMemberForm() {
    const input = document.getElementById("new-member-input");
    const addBtn = document.getElementById("add-member-btn");
    if (!input || !addBtn) return;

    const addMember = async () => {
        const name = input.value.trim();
        if (!name) return;

        await setDoc(doc(db, "filmClubMembers", name), {
            name,
            addedAt: serverTimestamp()
        });

        input.value = "";
    };

    addBtn.addEventListener("click", addMember);
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") addMember();
    });
}

// ======================================
// DRAW THIS MONTH'S CHOOSER
// ======================================

function refreshDrawButton() {
    const btn = document.getElementById("draw-chooser-btn");
    if (!btn) return;

    const alreadyDrawn = !!(currentPick && currentPick.chooser);
    btn.classList.toggle("hidden", alreadyDrawn || members.length === 0);
}

async function drawChooser() {
    const month = currentMonthStr();
    const previousMonth = addMonths(month, -1);

    const previousSnap = await getDoc(doc(db, "filmClubPicks", previousMonth));
    const previousChooser = previousSnap.exists() ? previousSnap.data().chooser : null;

    const eligible = members.length > 1 && previousChooser
        ? members.filter(name => name !== previousChooser)
        : members;

    const chosen = eligible[Math.floor(Math.random() * eligible.length)];

    // A transaction stops two friends who click "draw" at the same moment
    // from each locking in a different chooser for the month.
    await runTransaction(db, async transaction => {
        const ref = doc(db, "filmClubPicks", month);
        const snap = await transaction.get(ref);

        if (snap.exists() && snap.data().chooser) return;

        transaction.set(ref, {
            month,
            chooser: chosen,
            chosenAt: serverTimestamp()
        }, { merge: true });
    });
}

// ======================================
// CURRENT MONTH'S PICK (live)
// ======================================

function listenForCurrentPick() {
    const month = currentMonthStr();

    onSnapshot(doc(db, "filmClubPicks", month), snap => {
        currentPick = snap.exists() ? snap.data() : null;
        renderCurrentPick();
        refreshDrawButton();

        if (currentPick && currentPick.title) {
            listenForRatings(month);
        }
    });
}

function renderCurrentPick() {
    const chooserDisplay = document.getElementById("chooser-display");
    const searchCard = document.getElementById("search-card");
    const filmCard = document.getElementById("film-card");
    const ratingCard = document.getElementById("rating-card");

    if (!currentPick || !currentPick.chooser) {
        chooserDisplay.innerHTML = members.length
            ? "Nobody's been drawn for this month yet."
            : "Add some club members below, then draw a chooser.";
        searchCard.classList.add("hidden");
        filmCard.classList.add("hidden");
        ratingCard.classList.add("hidden");
        return;
    }

    chooserDisplay.innerHTML = `This month&rsquo;s chooser is <span class="chooser-name">${escapeHtml(currentPick.chooser)}</span>`;

    if (currentPick.title) {
        searchCard.classList.add("hidden");
        filmCard.classList.remove("hidden");
        ratingCard.classList.remove("hidden");

        document.getElementById("film-poster").src = currentPick.poster || "";
        document.getElementById("film-poster").alt = currentPick.title;
        document.getElementById("film-title").textContent = currentPick.title;
        document.getElementById("film-meta").textContent = currentPick.year || "";
        document.getElementById("film-plot").textContent = currentPick.plot || "";
        document.getElementById("film-chooser").textContent = currentPick.chooser;
    } else {
        searchCard.classList.remove("hidden");
        filmCard.classList.add("hidden");
        ratingCard.classList.add("hidden");
    }
}

// ======================================
// FILM SEARCH (OMDb)
// ======================================

function initFilmSearch() {
    const input = document.getElementById("film-search-input");
    const searchBtn = document.getElementById("film-search-btn");
    const cancelBtn = document.getElementById("cancel-preview-btn");
    const confirmBtn = document.getElementById("confirm-film-btn");

    if (!input || !searchBtn) return;

    const runSearch = () => searchFilms(input.value.trim());

    searchBtn.addEventListener("click", runSearch);
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") runSearch();
    });

    cancelBtn.addEventListener("click", () => {
        previewFilm = null;
        document.getElementById("search-preview").classList.add("hidden");
    });

    confirmBtn.addEventListener("click", confirmFilmPick);
}

async function searchFilms(query) {
    const resultsEl = document.getElementById("search-results");
    if (!query) return;

    if (OMDB_API_KEY === "YOUR_OMDB_API_KEY_HERE") {
        resultsEl.innerHTML = '<p class="search-empty">Add a free OMDb API key in filmclub.js first &mdash; see the comment at the top of the file.</p>';
        return;
    }

    resultsEl.innerHTML = '<p class="search-empty">Searching&hellip;</p>';

    const res = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&type=movie&s=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.Response === "False") {
        resultsEl.innerHTML = `<p class="search-empty">No films found for &ldquo;${escapeHtml(query)}&rdquo;.</p>`;
        return;
    }

    resultsEl.innerHTML = "";

    data.Search.forEach(film => {
        const row = document.createElement("div");
        row.className = "result-row";
        const poster = film.Poster && film.Poster !== "N/A" ? film.Poster : "";

        row.innerHTML = `
            <img class="result-poster" src="${escapeHtml(poster)}" alt="">
            <div class="result-info">
                <div class="result-title">${escapeHtml(film.Title)}</div>
                <div class="result-year">${escapeHtml(film.Year)}</div>
            </div>
        `;

        row.addEventListener("click", () => loadFilmPreview(film.imdbID));
        resultsEl.appendChild(row);
    });
}

async function loadFilmPreview(imdbID) {
    const res = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${imdbID}&plot=short`);
    const film = await res.json();

    if (film.Response === "False") return;

    previewFilm = film;

    const preview = document.getElementById("search-preview");
    const poster = film.Poster && film.Poster !== "N/A" ? film.Poster : "";

    document.getElementById("preview-poster").src = poster;
    document.getElementById("preview-poster").alt = film.Title;
    document.getElementById("preview-title").textContent = film.Title;
    document.getElementById("preview-meta").textContent = [film.Year, film.Genre].filter(Boolean).join(" · ");
    document.getElementById("preview-plot").textContent = film.Plot || "";

    preview.classList.remove("hidden");
    preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function confirmFilmPick() {
    if (!previewFilm || !currentPick) return;

    const month = currentMonthStr();
    const poster = previewFilm.Poster && previewFilm.Poster !== "N/A" ? previewFilm.Poster : "";

    await setDoc(doc(db, "filmClubPicks", month), {
        imdbID: previewFilm.imdbID,
        title: previewFilm.Title,
        year: previewFilm.Year,
        poster,
        plot: previewFilm.Plot || "",
        filmSelectedAt: serverTimestamp()
    }, { merge: true });

    previewFilm = null;
    document.getElementById("search-preview").classList.add("hidden");
    document.getElementById("search-results").innerHTML = "";
    document.getElementById("film-search-input").value = "";
}

// ======================================
// STAR RATING (anonymous)
// ======================================

function initStarInput() {
    const container = document.getElementById("star-input");
    if (!container) return;

    container.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const star = document.createElement("span");
        star.className = "star";
        star.dataset.value = i;
        star.textContent = "★";
        star.addEventListener("click", () => {
            selectedRatingStars = i;
            paintStars(i);
        });
        container.appendChild(star);
    }

    document.getElementById("submit-rating-btn").addEventListener("click", submitRating);

    // Pre-fill with this browser's existing vote, if any, so revisiting
    // the page to change your rating shows your current choice.
    getDoc(doc(db, "filmClubPicks", currentMonthStrSafe(), "ratings", getVoterId())).then(snap => {
        if (snap.exists()) {
            selectedRatingStars = snap.data().stars;
            paintStars(selectedRatingStars);
        }
    }).catch(() => {});
}

function currentMonthStrSafe() {
    return currentMonthStr();
}

function paintStars(value) {
    document.querySelectorAll("#star-input .star").forEach(star => {
        star.classList.toggle("filled", Number(star.dataset.value) <= value);
    });
}

async function submitRating() {
    const message = document.getElementById("rating-message");

    if (!selectedRatingStars) {
        message.textContent = "Pick a star rating first!";
        return;
    }

    const month = currentMonthStr();

    await setDoc(doc(db, "filmClubPicks", month, "ratings", getVoterId()), {
        stars: selectedRatingStars,
        ratedAt: serverTimestamp()
    }, { merge: true });

    message.textContent = "Thanks for voting! 🎉";
}

function listenForRatings(month) {
    onSnapshot(collection(db, "filmClubPicks", month, "ratings"), snapshot => {
        const ratings = snapshot.docs.map(d => d.data().stars);
        renderRatingSummary(ratings);
    });
}

function renderRatingSummary(ratings) {
    const avgEl = document.getElementById("rating-average");
    const countEl = document.getElementById("rating-count");
    if (!avgEl || !countEl) return;

    countEl.textContent = ratings.length;

    if (ratings.length === 0) {
        avgEl.textContent = "–";
        return;
    }

    const avg = ratings.reduce((sum, s) => sum + s, 0) / ratings.length;
    avgEl.textContent = `${avg.toFixed(1)}/10`;
}

// ======================================
// PAST FILMS
// ======================================

async function renderHistory() {
    const container = document.getElementById("history-list");
    if (!container) return;

    const month = currentMonthStr();
    const snapshot = await getDocs(collection(db, "filmClubPicks"));

    const pastPicks = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(pick => pick.id !== month && pick.title)
        .sort((a, b) => b.id.localeCompare(a.id));

    if (pastPicks.length === 0) {
        container.innerHTML = '<p class="history-empty">No past films yet &mdash; this month will be the first entry in the reel.</p>';
        return;
    }

    const cards = await Promise.all(pastPicks.map(async pick => {
        const ratingsSnap = await getDocs(collection(db, "filmClubPicks", pick.id, "ratings"));
        const ratings = ratingsSnap.docs.map(d => d.data().stars);
        const avg = ratings.length
            ? (ratings.reduce((sum, s) => sum + s, 0) / ratings.length).toFixed(1)
            : null;

        return `
            <div class="history-card">
                <img class="history-poster" src="${escapeHtml(pick.poster || "")}" alt="">
                <div class="history-info">
                    <p class="history-month">${escapeHtml(monthLabel(pick.id))}</p>
                    <p class="history-title">${escapeHtml(pick.title)} ${pick.year ? `(${escapeHtml(pick.year)})` : ""}</p>
                    <p class="history-chooser">Chosen by ${escapeHtml(pick.chooser || "?")}</p>
                    <p class="history-rating">${avg ? `★ ${avg}/10` : "No votes cast"} ${ratings.length ? `(${ratings.length} vote${ratings.length === 1 ? "" : "s"})` : ""}</p>
                </div>
            </div>
        `;
    }));

    container.innerHTML = cards.join("");
}

// ======================================
// TABS
// ======================================

function initTabs() {
    const buttons = document.querySelectorAll(".tab-btn");

    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            buttons.forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

            if (btn.dataset.tab === "history") {
                renderHistory();
            }
        });
    });
}

// ======================================
// START APP
// ======================================

function start() {
    initTabs();
    initMemberForm();
    initFilmSearch();
    initStarInput();

    document.getElementById("draw-chooser-btn").addEventListener("click", drawChooser);

    listenForMembers();
    listenForCurrentPick();
}

start();
