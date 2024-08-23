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
    const weatherOptions = ["Sunny", "Cloudy", "Rainy", "Stormy", "Snowy"];
    const temperatureRanges = {
        Sunny: [20, 30],
        Cloudy: [15, 25],
        Rainy: [10, 20],
        Stormy: [5, 15],
        Snowy: [-5, 5]
    };

    const days = document.querySelectorAll(".day");

    days.forEach(day => {
        const randomWeather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
        const temperatureRange = temperatureRanges[randomWeather];
        const randomTemp = Math.floor(Math.random() * (temperatureRange[1] - temperatureRange[0] + 1)) + temperatureRange[0];

        day.querySelector(".weather").textContent = randomWeather;
        day.querySelector(".temp").textContent = `${randomTemp}°C`;
    });
}
