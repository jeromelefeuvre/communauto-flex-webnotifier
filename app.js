const branchIds = {
    montreal: 1,
    quebec: 2,
    toronto: 3,
};

const distanceRadii = [
    10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 900, 800, 700, 600, 500, 400, 300, 200
];

const earthRadius = 6371; // In km

// DOM Elements
const form = document.getElementById('notify-form');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnGeo = document.getElementById('btn-geolocation');
const locationInput = document.getElementById('location');
const statusContainer = document.getElementById('status-container');
const statusText = document.getElementById('status-text');
const resultsContainer = document.getElementById('results-container');

let isSearching = false;
let searchTimeout = null;
let currentDistanceRadius = 1500;
let userLocation = null;

// Map Variables
let map = null;
let carMarkers = [];
let userMarker = null;
let searchCircle = null;
let activeRoute = null; // New variable to track the drawn route
let lastRoutedCoord = null; // Prevent spamming routing API

// Ask for notification permission early
if (window.Notification && Notification.permission !== "granted") {
    Notification.requestPermission();
}

btnGeo.addEventListener('click', async () => {
    btnGeo.disabled = true;
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        locationInput.value = `${lat},${lng}`;
        userLocation = [parseFloat(lat), parseFloat(lng)];
    } catch (err) {
        alert("Could not get location. Please type it in manually (lat,lng).");
    } finally {
        btnGeo.disabled = false;
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSearching) return;

    // Permissions check
    if (window.Notification && Notification.permission !== "granted") {
        await Notification.requestPermission();
    }

    const city = document.getElementById('city').value;
    const initialDistance = parseInt(document.getElementById('distance').value);
    const delay = parseInt(document.getElementById('delay').value) * 1000;
    const locString = locationInput.value;

    if (locString) {
        userLocation = locString.split(',').map(c => parseFloat(c.trim()));
    } else {
        alert("Please provide a location or use the GPS button.");
        return;
    }

    currentDistanceRadius = initialDistance;
    isSearching = true;

    // UI Toggle
    btnStart.classList.add('hidden');
    btnStop.classList.remove('hidden');
    statusContainer.classList.remove('hidden');
    resultsContainer.innerHTML = '';

    document.getElementById('map-wrapper').classList.remove('hidden');
    if (!map) {
        initMap(userLocation[0], userLocation[1]);
    } else {
        updateMapCenter(userLocation[0], userLocation[1]);
    }
    setTimeout(() => map.invalidateSize(), 100);

    document.getElementById('city').disabled = true;
    document.getElementById('distance').disabled = true;
    document.getElementById('delay').disabled = true;
    locationInput.disabled = true;
    btnGeo.disabled = true;

    searchLoop(city, delay);
});

btnStop.addEventListener('click', () => {
    stopSearch('Search stopped manually.');
});

function stopSearch(message) {
    isSearching = false;
    clearTimeout(searchTimeout);

    // UI Toggle
    btnStart.classList.remove('hidden');
    btnStop.classList.add('hidden');
    statusContainer.classList.add('hidden');

    document.getElementById('city').disabled = false;
    document.getElementById('distance').disabled = false;
    document.getElementById('delay').disabled = false;
    locationInput.disabled = false;
    btnGeo.disabled = false;

    if (activeRoute) map.removeLayer(activeRoute);
    activeRoute = null;
    lastRoutedCoord = null;

    if (message) alert(message);
}

async function searchLoop(city, delay) {
    if (!isSearching) return;

    const branchId = branchIds[city];

    try {
        statusText.innerText = `Fetching cars for ${city}...`;

        // Fetch via local proxy to bypass CORS
        const url = `/api/cars?BranchID=${branchId}&LanguageID=2`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Proxy server error");

        const json = await res.json();

        const cars = json.d.Vehicles.map(vehicle => ({
            brand: vehicle.CarBrand,
            model: vehicle.CarModel,
            plate: vehicle.CarPlate,
            color: vehicle.CarColor,
            lat: vehicle.Latitude,
            lng: vehicle.Longitude,
            distance: calculateDistance(userLocation[0], userLocation[1], vehicle.Latitude, vehicle.Longitude),
        }));

        const filteredCars = cars
            .filter(car => car.distance <= currentDistanceRadius)
            .sort((a, b) => a.distance - b.distance);

        drawCarsOnMap(filteredCars, city);

        statusText.innerText = `${cars.length} cars found. ${filteredCars.length} within ${humanDistance(currentDistanceRadius)}. Waiting...`;

        if (filteredCars.length > 0) {
            const car = filteredCars[0];
            const nextSmallerRadius = distanceRadii.find(i => i < car.distance);

            showSuccessCar(car, city);
            sendDesktopNotification(car, city, nextSmallerRadius);

            if (nextSmallerRadius) {
                currentDistanceRadius = nextSmallerRadius;
                if (searchCircle) searchCircle.setRadius(currentDistanceRadius);
            } else {
                stopSearch('Closest possible car found! Search stopped.');
                return;
            }
        } else {
            resultsContainer.innerHTML = ''; // Clear stale results
        }

    } catch (err) {
        console.error(err);
        statusText.innerText = "Error fetching cars. Retrying...";
    }

    if (isSearching) {
        searchTimeout = setTimeout(() => searchLoop(city, delay), delay);
    }
}

function showSuccessCar(car, city) {
    const bookingUrl = `https://${branchIds[city] === branchIds.toronto ? 'ontario' : 'quebec'}.client.reservauto.net/bookCar`;

    resultsContainer.innerHTML = `
        <div class="car-card" id="success-car-card">
            <div class="car-info">
                <h3>${car.brand} ${car.model}</h3>
                <p id="car-card-desc">${Math.floor(car.distance)}m away (straight line) • Plate: ${car.plate} • ${car.color}</p>
            </div>
            <a href="${bookingUrl}" target="_blank" class="book-btn">Reserve</a>
        </div>
    `;
}

function updateCarUIWithWalkingData(car, city, routeData) {
    const cardDesc = document.getElementById('car-card-desc');
    const walkDistanceStr = humanDistance(routeData.distance);
    const walkMins = Math.round(routeData.duration / 60);

    if (cardDesc) {
        cardDesc.innerText = `${walkDistanceStr} walking (${walkMins} min) • Plate: ${car.plate} • ${car.color}`;
    }

    // Update marker popup if it exists
    const marker = carMarkers.find(m => m.getLatLng().lat === car.lat && m.getLatLng().lng === car.lng);
    if (marker) {
        marker.setPopupContent(`<b>${car.brand} ${car.model}</b><br>${walkDistanceStr} walk (${walkMins} min)<br>Plate: ${car.plate}`);
    }
}

function sendDesktopNotification(car, city, nextSmallerRadius) {
    if (!window.Notification || Notification.permission !== "granted") return;

    const notification = new Notification("Communauto Found!", {
        body: `${car.brand} ${car.model} is ${Math.floor(car.distance)}m away.` + (nextSmallerRadius ? ` Reducing search radius to ${humanDistance(nextSmallerRadius)}.` : ''),
        icon: 'https://communauto.com/wp-content/uploads/2021/03/cropped-favicon-32x32.png',
        requireInteraction: true
    });

    notification.onclick = () => {
        window.open(`https://${branchIds[city] === branchIds.toronto ? 'ontario' : 'quebec'}.client.reservauto.net/bookCar`, '_blank');
        notification.close();
    };
}


// Map Helpers
function initMap(lat, lng) {
    if (map) return;
    map = L.map('map').setView([lat, lng], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    updateMapCenter(lat, lng);
}

function updateMapCenter(lat, lng) {
    if (!map) return;
    map.setView([lat, lng], 14);

    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color:#3b82f6; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 4px rgba(0,0,0,0.4);'></div>",
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        })
    }).addTo(map).bindPopup("<b>Your Location</b>");

    if (searchCircle) map.removeLayer(searchCircle);
    searchCircle = L.circle([lat, lng], {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        weight: 2,
        radius: currentDistanceRadius
    }).addTo(map);
}

function drawCarsOnMap(filteredCars, city) {
    if (!map) return;

    // Clear old markers
    carMarkers.forEach(m => map.removeLayer(m));
    carMarkers = [];

    const carIcon = L.icon({
        iconUrl: '/proxy-image?url=' + encodeURIComponent('https://www.reservauto.net/images/GoogleMaps/pin-am.png'),
        iconSize: [20, 27],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });

    filteredCars.forEach(car => {
        const marker = L.marker([car.lat, car.lng], { icon: carIcon }).addTo(map);
        marker.bindPopup(`<b>${car.brand} ${car.model}</b><br>${Math.floor(car.distance)}m away (straight line)<br>Plate: ${car.plate}`);

        marker.on('click', () => {
            drawRouteToCar(userLocation[0], userLocation[1], car.lat, car.lng).then(routeData => {
                if (routeData) {
                    updateCarUIWithWalkingData(car, city, routeData);
                }
            });
        });

        carMarkers.push(marker);
    });
}

async function drawRouteToCar(startLat, startLng, endLat, endLng) {
    if (!map) return;
    const coordString = `${endLat},${endLng}`;
    if (lastRoutedCoord === coordString) return;

    if (activeRoute) map.removeLayer(activeRoute);
    lastRoutedCoord = coordString;

    try {
        const url = `https://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes && data.routes.length > 0) {
            const routeGeoJSON = data.routes[0].geometry;
            activeRoute = L.geoJSON(routeGeoJSON, {
                style: {
                    color: '#3b82f6',
                    weight: 6,
                    opacity: 0.8,
                    dashArray: '10, 10'
                }
            }).addTo(map);

            map.fitBounds(activeRoute.getBounds(), { padding: [50, 50] });

            return {
                distance: data.routes[0].distance,
                duration: data.routes[0].duration
            };
        }
    } catch (e) {
        console.error("Could not fetch route", e);
    }
    return null;
}

// Math Helpers
function calculateDistance(lat1, lng1, lat2, lng2) {
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c * 1000;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function humanDistance(inp) {
    if (inp < 1000) return inp + 'm';
    return (inp / 1000) + 'km';
}
