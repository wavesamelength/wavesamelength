document.addEventListener("DOMContentLoaded", () => {
    const now = new Date();
    const lastUpdate = localStorage.getItem('lastUpdate');
    const forecastData = localStorage.getItem('forecastData');
    
    // If the last update was today, load the forecast from localStorage
    if (lastUpdate && isSameDay(new Date(parseInt(lastUpdate)), now) && forecastData) {
        loadForecastFromStorage(JSON.parse(forecastData));
    } else {
        updateWeather();
    }

    // Set interval to update the weather forecast at midnight
    const millisUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0) - now;
    setTimeout(() => {
        updateWeather();
        setInterval(updateWeather, 24 * 60 * 60 * 1000); // Repeat every 24 hours
    }, millisUntilMidnight);
});

function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

function updateWeather() {
    const weatherOptions = ["Heavy", "Moderate", "Low", "None"];
    const temperatureRanges = {
        Heavy: [100, 10000],
        Moderate: [50, 99],
        Low: [1, 49],
        None: [0, 0],
    };

    const days = document.querySelectorAll(".day");
    const forecastData = [];

    days.forEach(day => {
        const randomWeather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
        const temperatureRange = temperatureRanges[randomWeather];
        const randomTemp = Math.floor(Math.random() * (temperatureRange[1] - temperatureRange[0] + 1)) + temperatureRange[0];

        day.querySelector(".weather").textContent = randomWeather;
        day.querySelector(".temp").textContent = randomTemp; 

        forecastData.push({
            weather: randomWeather,
            temperature: randomTemp
        });
    });

    // Save the new forecast and the current time to localStorage
    localStorage.setItem('forecastData', JSON.stringify(forecastData));
    localStorage.setItem('lastUpdate', Date.now().toString());
}

function loadForecastFromStorage(forecastData) {
    const days = document.querySelectorAll(".day");

    days.forEach((day, index) => {
        day.querySelector(".weather").textContent = forecastData[index].weather;
        day.querySelector(".temp").textContent = forecastData[index].temperature; 
    });
}
