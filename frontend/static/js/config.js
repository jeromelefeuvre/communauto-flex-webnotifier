const branchIds = {
    montreal: 1,
    quebec: 2,
    toronto: 3,
};

const cityBounds = {
    montreal: { minLat: 45.38, maxLat: 45.73, minLng: -74.05, maxLng: -73.47 },
    quebec:   { minLat: 46.70, maxLat: 47.02, minLng: -71.58, maxLng: -71.10 },
    toronto:  { minLat: 43.57, maxLat: 43.88, minLng: -79.68, maxLng: -79.10 },
};

function detectCityFromCoords(lat, lng) {
    for (const [city, b] of Object.entries(cityBounds)) {
        if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
            return city;
        }
    }
    return null;
}

function getBookingUrl(city) {
    return `https://${branchIds[city] === branchIds.toronto ? 'ontario' : 'quebec'}.client.reservauto.net/bookCar`;
}
