document.addEventListener("DOMContentLoaded", () => {
    updateWeather();

    // Set interval to update the weather forecast every midnight
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

    days.forEach(day => {
        const randomWeather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
        const temperatureRange = temperatureRanges[randomWeather];
        const randomTemp = Math.floor(Math.random() * (temperatureRange[1] - temperatureRange[0] + 1)) + temperatureRange[0];

        day.querySelector(".weather").textContent = randomWeather;
        day.querySelector(".temp").textContent = randomTemp;
    });
}
