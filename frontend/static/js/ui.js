// UI Controller
const UIController = {
    els: {
        form: document.getElementById('notify-form'),
        btnStart: document.getElementById('btn-start'),
        btnStop: document.getElementById('btn-stop'),
        btnGeo: document.getElementById('btn-geolocation'),
        geoLabel: document.getElementById('geo-label'),
        locationInput: document.getElementById('location'),
        addressWrapper: document.getElementById('address-input-wrapper'),
        addressInput: document.getElementById('address-input'),
        addressSuggestions: document.getElementById('address-suggestions'),
        statusContainer: document.getElementById('status-container'),
        statusText: document.getElementById('status-text'),
        resultsContainer: document.getElementById('results-container'),
        city: document.getElementById('city'),
        distance: document.getElementById('distance'),
        delay: document.getElementById('delay'),
        mapWrapper: document.getElementById('map-wrapper'),
        formInputs: document.getElementById('form-inputs'),
        floatingSearchBar: document.getElementById('floating-search-bar'),
        floatingSearchText: document.getElementById('floating-search-text'),
        distanceValue: document.getElementById('distance-value')
    },

    toggleSearching: function () {
        this.els.btnStart.classList.add('hidden');
        this.els.btnStop.classList.remove('hidden');
        this.els.statusContainer.classList.remove('hidden');

        // Collapse the form immediately upon search start to embrace minimalist interface
        this.els.formInputs.classList.add('hidden');
        this.els.floatingSearchBar.classList.remove('hidden');

        this.els.resultsContainer.innerHTML = '';
        this.els.mapWrapper.classList.remove('hidden');

        this.els.city.disabled = true;
        this.els.distance.disabled = true;
        this.els.delay.disabled = true;
        this.els.locationInput.disabled = true;
        this.els.btnGeo.disabled = true;
    },

    toggleStopped: function () {
        this.els.btnStart.classList.remove('hidden');
        this.els.btnStop.classList.add('hidden');
        this.els.statusContainer.classList.add('hidden');

        this.els.city.disabled = false;
        this.els.distance.disabled = false;
        this.els.delay.disabled = false;
        this.els.locationInput.disabled = false;
        this.els.btnGeo.disabled = false;
    },

    updateStatus: function (text) {
        this.els.statusText.innerText = text;
    },

    showSuccessCars: function (cars, city) {
        // Collapse the search inputs to save vertical screen space
        this.els.formInputs.classList.add('hidden');
        this.els.floatingSearchBar.classList.remove('hidden');

        const bookingUrl = getBookingUrl(city);

        let html = '';
        cars.forEach((car, index) => {
            html += `
                <div class="car-card" data-plate="${car.plate}" data-lat="${car.lat}" data-lng="${car.lng}">
                    <div class="car-info-layout">
                        <div class="car-icon-wrapper">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="10" width="18" height="10" rx="2" ry="2"></rect>
                                <line x1="7" y1="14" x2="7" y2="14"></line>
                                <line x1="17" y1="14" x2="17" y2="14"></line>
                                <path d="M4 10l2-4h12l2 4"></path>
                            </svg>
                        </div>
                        <div class="car-details">
                            <h3 class="car-title">${car.brand} ${car.model}</h3>
                            <div class="car-meta">${car.color} • Plate: ${car.plate}</div>
                            <div id="desc-${car.plate}" class="car-distance">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                                <span>${Math.floor(car.distance)}m (straight line)</span>
                            </div>
                        </div>
                    </div>
                    <div class="car-actions">
                        <a href="${bookingUrl}" target="_blank" class="book-btn" onclick="event.stopPropagation()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            Reserve
                        </a>
                    </div>
                </div>
            `;
        });

        this.els.resultsContainer.innerHTML = html;

        // Attach click listeners to cards for map routing
        const cards = this.els.resultsContainer.querySelectorAll('.car-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                // Remove selected class from all
                cards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');

                const lat = parseFloat(card.dataset.lat);
                const lng = parseFloat(card.dataset.lng);
                const plate = card.dataset.plate;

                const car = cars.find(c => c.plate === plate);

                MapController.drawRouteToCar(AppState.userLocation[0], AppState.userLocation[1], lat, lng).then(routeData => {
                    if (routeData) {
                        this.updateCarUIWithWalkingData(car, MathUtils.humanDistance(routeData.distance), Math.round(routeData.duration / 60));
                    }
                });

                // Also open the popup on the map for the associated marker
                const marker = MapController.carMarkers.find(m => m.options.plate === plate);
                if (marker) {
                    marker.openPopup();
                }
            });
        });
    },

    updateCarUIWithWalkingData: function (car, walkDistanceStr, walkMins) {
        const cardDesc = document.getElementById(`desc-${car.plate}`);
        if (cardDesc) {
            cardDesc.classList.add('has-walking');
            cardDesc.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/></svg>
                <span class="walking-highlight">${walkDistanceStr} walk (${walkMins} min)</span>
            `;
        }
    },

    updateFilterText: function (city, radius) {
        const cityCap = city.charAt(0).toUpperCase() + city.slice(1);
        this.els.floatingSearchText.innerText = `${cityCap} - ${radius}m`;
    },

    expandForm: function () {
        this.els.formInputs.classList.remove('hidden');
        this.els.floatingSearchBar.classList.add('hidden');
        this.els.resultsContainer.innerHTML = ''; // Optionally clear results when modifying
        MapController.clearRoutes(); // Optionally clear map routes when modifying
        MapController.carMarkers.forEach(m => MapController.map.removeLayer(m));
        MapController.carMarkers = [];
    }
};
