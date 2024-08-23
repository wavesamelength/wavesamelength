document.addEventListener("DOMContentLoaded", () => {
    updateWeather();

    // Set interval to update the weather forecast at midnight
    const now = new Date();
    const millisUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0) - now;
    setTimeout(() => {
        updateWeather();
        setInterval(updateWeather, 24 * 60 * 60 * 1000); // Repeat every 24 hours
    }, millisUntilMidnight);
});

function updateWeather() {
    const weatherOptions = ["Heavy", "Moderate", "Low", "None"];
    const temperatureRanges = {
        Heavy: [100, 10000],
        Moderate: [50, 99],
        Low: [1, 49],
        None: [0, 0],
    };

    const days = document.querySelectorAll(".day");

    const seed = getSeedFromDate(new Date());
    const prng = seededRandom(seed);

    days.forEach(day => {
        const randomWeather = weatherOptions[Math.floor(prng() * weatherOptions.length)];
        const temperatureRange = temperatureRanges[randomWeather];
        const randomTemp = Math.floor(prng() * (temperatureRange[1] - temperatureRange[0] + 1)) + temperatureRange[0];

        day.querySelector(".weather").textContent = randomWeather;
        day.querySelector(".temp").textContent = randomTemp; // No unit added here
    });
}

function getSeedFromDate(date) {
    // Generate a seed based on the current date (Year-Month-Day)
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function seededRandom(seed) {
    // A simple seed-based random number generator (PRNG)
    let value = seed;
    return function() {
        value = (value * 9301 + 49297) % 233280;
        return value / 233280;
    };
}
