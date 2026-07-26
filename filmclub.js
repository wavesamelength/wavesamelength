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

// Pre-agreed chooser for a specific month, bypassing the random draw.
// Add entries here as needed; every other month falls back to random.
const FORCED_CHOOSERS = {
    "2026-07": "Jack"
};

// A month in here reuses another month's whole pick (chooser + film)
// instead of drawing/searching again - e.g. July's film running into August.
const CARRY_OVER_PICKS = {
    "2026-08": "2026-07"
};

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
// FILM QUOTES (tagline)
// ======================================

const FILM_QUOTES = [
    { quote: "D'ya like jazz?", movie: "Bee Movie", year: 2007 },
    { quote: "I'll be back.", movie: "The Terminator", year: 1984 },
    { quote: "Why so serious?", movie: "The Dark Knight", year: 2008 },
    { quote: "Just keep swimming.", movie: "Finding Nemo", year: 2003 },
    { quote: "You can't handle the truth!", movie: "A Few Good Men", year: 1992 },
    { quote: "I feel the need... the need for speed.", movie: "Top Gun", year: 1986 },
    { quote: "Here's looking at you, kid.", movie: "Casablanca", year: 1942 },
    { quote: "May the Force be with you.", movie: "Star Wars", year: 1977 },
    { quote: "Life is like a box of chocolates.", movie: "Forrest Gump", year: 1994 },
    { quote: "To infinity and beyond!", movie: "Toy Story", year: 1995 },
    { quote: "I see dead people.", movie: "The Sixth Sense", year: 1999 },
    { quote: "You're gonna need a bigger boat.", movie: "Jaws", year: 1975 },
    { quote: "Houston, we have a problem.", movie: "Apollo 13", year: 1995 },
    { quote: "There's no place like home.", movie: "The Wizard of Oz", year: 1939 },
    { quote: "Nobody puts Baby in a corner.", movie: "Dirty Dancing", year: 1987 },
    { quote: "I'm king of the world!", movie: "Titanic", year: 1997 },
    { quote: "Not all those who wander are lost.", movie: "The Fellowship of the Ring", year: 2001 },
    { quote: "Great Scott!", movie: "Back to the Future", year: 1985 },
    { quote: "Hasta la vista, baby.", movie: "Terminator 2: Judgment Day", year: 1991 },
    { quote: "After all, tomorrow is another day!", movie: "Gone with the Wind", year: 1939 },
    { quote: "Bond. James Bond.", movie: "Dr. No", year: 1962 },
    { quote: "No, I am your father.", movie: "The Empire Strikes Back", year: 1980 },
    { quote: "I'm gonna make him an offer he can't refuse.", movie: "The Godfather", year: 1972 },
    { quote: "Here's Johnny!", movie: "The Shining", year: 1980 },
    { quote: "You talkin' to me?", movie: "Taxi Driver", year: 1976 },
    { quote: "E.T. phone home.", movie: "E.T. the Extra-Terrestrial", year: 1982 },
    { quote: "My precious.", movie: "The Lord of the Rings: The Two Towers", year: 2002 },
    { quote: "Wax on, wax off.", movie: "The Karate Kid", year: 1984 },
    { quote: "Show me the money!", movie: "Jerry Maguire", year: 1996 },
    { quote: "You can't sit with us.", movie: "Mean Girls", year: 2004 },
    { quote: "That'll do, pig. That'll do.", movie: "Babe", year: 1995 },
    { quote: "Hakuna Matata.", movie: "The Lion King", year: 1994 },
    { quote: "Let it go.", movie: "Frozen", year: 2013 },
    { quote: "There's no crying in baseball!", movie: "A League of Their Own", year: 1992 },
    { quote: "It's alive! It's alive!", movie: "Frankenstein", year: 1931 },
    { quote: "Fasten your seatbelts, it's going to be a bumpy night.", movie: "All About Eve", year: 1950 },
    { quote: "Elementary, my dear Watson.", movie: "The Adventures of Sherlock Holmes", year: 1939 },
    { quote: "Toga! Toga!", movie: "National Lampoon's Animal House", year: 1978 },
    { quote: "I'll have what she's having.", movie: "When Harry Met Sally...", year: 1989 },
    { quote: "Snap out of it!", movie: "Moonstruck", year: 1987 },
    { quote: "Carpe diem. Seize the day.", movie: "Dead Poets Society", year: 1989 },
    { quote: "Is it safe?", movie: "Marathon Man", year: 1976 },
    { quote: "They call me Mister Tibbs!", movie: "In the Heat of the Night", year: 1967 },
    { quote: "A martini. Shaken, not stirred.", movie: "Goldfinger", year: 1964 },
    { quote: "Adrian!", movie: "Rocky", year: 1976 },
    { quote: "Yippee-ki-yay.", movie: "Die Hard", year: 1988 },
    { quote: "I have a very particular set of skills.", movie: "Taken", year: 2008 },
    { quote: "Keep your friends close, and your enemies closer.", movie: "The Godfather Part II", year: 1974 },
    { quote: "I'm gonna live forever!", movie: "Fame", year: 1980 },
    { quote: "If you build it, he will come.", movie: "Field of Dreams", year: 1989 },
    { quote: "Life finds a way.", movie: "Jurassic Park", year: 1993 },
    { quote: "There is no spoon.", movie: "The Matrix", year: 1999 },
    { quote: "Surely you can't be serious. I am serious, and don't call me Shirley.", movie: "Airplane!", year: 1980 },
    { quote: "Who you gonna call?", movie: "Ghostbusters", year: 1984 },
    { quote: "Welcome to Earth.", movie: "Independence Day", year: 1996 },
    { quote: "What we've got here is failure to communicate.", movie: "Cool Hand Luke", year: 1967 },
    { quote: "Well, Clarice, have the lambs stopped screaming?", movie: "The Silence of the Lambs", year: 1991 },
    { quote: "I'm just a girl, standing in front of a boy, asking him to love her.", movie: "Notting Hill", year: 1999 },
    { quote: "Big mistake. Big. Huge.", movie: "Pretty Woman", year: 1990 },
    { quote: "As if!", movie: "Clueless", year: 1995 },
    { quote: "What, like it's hard?", movie: "Legally Blonde", year: 2001 },
    { quote: "Tell me about it, stud.", movie: "Grease", year: 1978 },
    { quote: "As you wish.", movie: "The Princess Bride", year: 1987 },
    { quote: "It's just a flesh wound.", movie: "Monty Python and the Holy Grail", year: 1975 },
    { quote: "Ogres have layers.", movie: "Shrek", year: 2001 },
    { quote: "Light bulb!", movie: "Despicable Me", year: 2010 },
    { quote: "No capes!", movie: "The Incredibles", year: 2004 },
    { quote: "Stay classy, San Diego.", movie: "Anchorman: The Legend of Ron Burgundy", year: 2004 },
    { quote: "Blue Steel.", movie: "Zoolander", year: 2001 },
    { quote: "Shake and bake!", movie: "Talladega Nights: The Ballad of Ricky Bobby", year: 2006 },
    { quote: "it's morbin' time!", movie: "Morbius", year: 2022 },
    { quote: "You better hold on tight, spider monkey.", movie: "Twilight", year: 2008 }
];

function renderRandomQuote() {
    const el = document.getElementById("tagline");
    if (!el) return;

    const pick = FILM_QUOTES[Math.floor(Math.random() * FILM_QUOTES.length)];
    el.textContent = `"${pick.quote}" - ${pick.movie}, ${pick.year}`;
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

    let chosen = FORCED_CHOOSERS[month];

    if (!chosen) {
        const previousMonth = addMonths(month, -1);

        const previousSnap = await getDoc(doc(db, "filmClubPicks", previousMonth));
        const previousChooser = previousSnap.exists() ? previousSnap.data().chooser : null;

        const eligible = members.length > 1 && previousChooser
            ? members.filter(name => name !== previousChooser)
            : members;

        chosen = eligible[Math.floor(Math.random() * eligible.length)];
    }

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

        if (!currentPick) {
            maybeCarryOverPick(month);
        }

        renderCurrentPick();
        refreshDrawButton();

        if (currentPick && currentPick.title) {
            listenForRatings(month);
        }
    });
}

// If this month is set up to reuse another month's pick, and that source
// month already has a film chosen, copy it straight in - no new draw or
// search needed. Harmless if it runs more than once (same data every time).
async function maybeCarryOverPick(month) {
    const sourceMonth = CARRY_OVER_PICKS[month];
    if (!sourceMonth) return;

    const sourceSnap = await getDoc(doc(db, "filmClubPicks", sourceMonth));
    if (!sourceSnap.exists() || !sourceSnap.data().title) return;

    const source = sourceSnap.data();

    await setDoc(doc(db, "filmClubPicks", month), {
        month,
        chooser: source.chooser,
        imdbID: source.imdbID,
        title: source.title,
        year: source.year,
        poster: source.poster,
        plot: source.plot,
        carriedOverFrom: sourceMonth,
        chosenAt: serverTimestamp(),
        filmSelectedAt: serverTimestamp()
    }, { merge: true });
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
    renderRandomQuote();
    initTabs();
    initMemberForm();
    initFilmSearch();
    initStarInput();

    document.getElementById("draw-chooser-btn").addEventListener("click", drawChooser);

    listenForMembers();
    listenForCurrentPick();
}

start();
