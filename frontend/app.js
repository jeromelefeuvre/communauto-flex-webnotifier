const AppState = {
    isFirstInitEvent: true,
    isSearching: false,
    searchTimeout: null,
    currentDistanceRadius: 600,
    userLocation: null,
    lastSearchLocation: null
};

window.addEventListener('DOMContentLoaded', () => {
    // Fetch and display the app version
    fetch('api/version')
        .then(res => res.json())
        .then(data => {
            if (data.version && data.version !== 'unknown' && data.version !== 'error') {
                document.getElementById('app-version').textContent = 'v' + data.version;
            }
        })
        .catch(() => console.warn("Could not fetch app version"));

    // If geolocation permission is already granted, auto-fetch the user's location
    if (navigator.permissions && navigator.geolocation) {
        navigator.permissions.query({ name: 'geolocation' }).then(result => {
            if (result.state === 'granted') {
                UIController.els.btnGeo.click();
            }
        });
    }
});

UIController.els.distance.addEventListener('input', (e) => {
    if (AppState.isSearching) return;
    const newRadius = parseInt(e.target.value);
    if (!isNaN(newRadius) && MapController.searchCircle && MapController.map) {
        MapController.searchCircle.setRadius(newRadius);
    }
});

UIController.els.btnGeo.addEventListener('click', async () => {
    UIController.els.btnGeo.disabled = true;
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);

        UIController.els.locationInput.value = `${lat},${lng}`;
        AppState.userLocation = [parseFloat(lat), parseFloat(lng)];

        // Automatically start the search once the location is successfully found
        UIController.els.btnStart.click();
    } catch (err) {
        alert("Could not get location. Ensure your browser has location permissions enabled for this site, or type it manually (lat,lng).");
    } finally {
        UIController.els.btnGeo.disabled = false;
    }
});

UIController.els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (AppState.isSearching) return;

    // Permissions check
    if (window.Notification && Notification.permission !== "granted") {
        await Notification.requestPermission();
    }

    const city = UIController.els.city.value;
    const initialDistance = parseInt(UIController.els.distance.value);
    const delay = parseInt(UIController.els.delay.value) * 1000;
    const locString = UIController.els.locationInput.value;

    if (locString) {
        AppState.userLocation = locString.split(',').map(c => parseFloat(c.trim()));
    } else {
        alert("Please provide a location or use the GPS button.");
        return;
    }

    const isSameLocation = AppState.lastSearchLocation && AppState.lastSearchLocation[0] === AppState.userLocation[0] && AppState.lastSearchLocation[1] === AppState.userLocation[1];
    AppState.lastSearchLocation = [...AppState.userLocation];

    AppState.currentDistanceRadius = initialDistance;
    AppState.isSearching = true;

    UIController.toggleSearching();

    let shouldFitBounds = false;

    if (!MapController.map) {
        MapController.init(AppState.userLocation[0], AppState.userLocation[1]);
        // Map is newly created, we definitely must fit bounds, but ONLY after invalidated.
        shouldFitBounds = true;
    } else {
        // If it's a new location, always fit bounds.
        shouldFitBounds = !isSameLocation;

        if (isSameLocation && MapController.searchCircle) {
            // Temporarily update circle to get new bounds without drawing yet
            MapController.searchCircle.setRadius(initialDistance);
            const circleBounds = MapController.searchCircle.getBounds();
            const mapBounds = MapController.map.getBounds();

            // Only fit bounds if we are zoomed OUT or panned away
            if (!circleBounds.contains(mapBounds)) {
                shouldFitBounds = true;
            }
        }

        MapController.updateCenter(AppState.userLocation[0], AppState.userLocation[1], false);
    }


    const executeSearch = () => {
        if (!AppState.isSearching) return; // Abort if user clicked stop before layout tick finished

        MapController.map.invalidateSize();
        if (shouldFitBounds && MapController.searchCircle) {
            MapController.map.fitBounds(MapController.searchCircle.getBounds(), { padding: [20, 20] });
        }
        AppController.searchLoop(city, delay);
    };

    if (AppState.isFirstInitEvent) {
        AppState.isFirstInitEvent = false;
        setTimeout(executeSearch, 100);
    } else {
        executeSearch();
    }
});

UIController.els.btnStop.addEventListener('click', () => {
    stopSearch();
});

UIController.els.btnModifySearch.addEventListener('click', () => {
    UIController.expandForm();
});

function stopSearch(message) {
    AppState.isSearching = false;
    clearTimeout(AppState.searchTimeout);

    UIController.toggleStopped();

    MapController.clearRoutes();

    if (message) alert(message);
}

const AppController = {
    searchLoop: async function (city, delay) {
        if (!AppState.isSearching) return;

        const branchId = branchIds[city];

        try {
            UIController.updateStatus(`Fetching cars for ${city}...`);

            // Fetch via local proxy to bypass CORS
            const url = `api/cars?BranchID=${branchId}&LanguageID=2`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Proxy server error");

            const json = await res.json();

            // If the user stopped the search while this fetch was in-flight, discard the stale response safely.
            if (!AppState.isSearching) return;

            const cars = json.d.Vehicles.map(vehicle => ({
                brand: vehicle.CarBrand,
                model: vehicle.CarModel,
                plate: vehicle.CarPlate,
                color: vehicle.CarColor,
                lat: vehicle.Latitude,
                lng: vehicle.Longitude,
                distance: MathUtils.calculateDistance(AppState.userLocation[0], AppState.userLocation[1], vehicle.Latitude, vehicle.Longitude),
            }));

            const alertCars = cars
                .filter(car => car.distance <= AppState.currentDistanceRadius)
                .sort((a, b) => a.distance - b.distance);

            const mapCars = cars
                .filter(car => car.distance <= AppState.currentDistanceRadius + 200)
                .sort((a, b) => a.distance - b.distance);

            MapController.drawCars(mapCars, city);

            UIController.updateStatus(`${cars.length} cars found. ${alertCars.length} within ${MathUtils.humanDistance(AppState.currentDistanceRadius)} (${mapCars.length} map total). Waiting...`);

            if (alertCars.length > 0) {
                const topCars = alertCars.slice(0, 3); // Take up to 3 cars

                UIController.showSuccessCars(topCars, city);
                this.sendDesktopNotification(topCars, city);

                stopSearch();

                // Automatically select the closest car (the first one) to draw the initial route
                const firstCard = document.querySelector('.car-card');
                if (firstCard) firstCard.click();

                return;
            } else {
                UIController.els.resultsContainer.innerHTML = ''; // Clear stale results
            }

        } catch (err) {
            console.error(err);
            UIController.updateStatus("Error fetching cars. Retrying...");
        }

        if (AppState.isSearching) {
            AppState.searchTimeout = setTimeout(() => this.searchLoop(city, delay), delay);
        }
    },

    sendDesktopNotification: function (cars, city) {
        if (!window.Notification || Notification.permission !== "granted") return;

        const primaryCar = cars[0];
        const title = cars.length > 1 ? `Communauto Found ${cars.length} Cars!` : "Communauto Found!";
        const body = cars.length > 1
            ? `Closest: ${primaryCar.brand} ${primaryCar.model} (${Math.floor(primaryCar.distance)}m away)`
            : `${primaryCar.brand} ${primaryCar.model} is ${Math.floor(primaryCar.distance)}m away.`;

        const notification = new Notification(title, {
            body: body,
            icon: 'https://communauto.com/wp-content/uploads/2021/03/cropped-favicon-32x32.png',
            requireInteraction: true
        });

        notification.onclick = () => {
            window.open(getBookingUrl(city), '_blank');
            notification.close();
        };
    }
};

// Expose internal controllers to global window for E2E testing
window.AppState = AppState;
window.MapController = MapController;
window.UIController = UIController;
