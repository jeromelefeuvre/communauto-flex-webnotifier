import https from 'https';
import webpush from 'web-push';
import { randomUUID } from 'crypto';

const branchIds = { montreal: 1, quebec: 2, toronto: 3 };

// In-memory subscription store: id → { subscription, city, lat, lng, radius, timerId }
const subscriptions = new Map();

const POLL_INTERVAL_MS = 30_000;

/**
 * Returns the Communauto booking URL for a given city.
 * Toronto uses the Ontario subdomain; all other cities use Quebec.
 * @param {string} city - 'montreal', 'quebec', or 'toronto'
 * @returns {string} Booking URL
 */
function getBookingUrl(city) {
    return `https://${branchIds[city] === branchIds.toronto ? 'ontario' : 'quebec'}.client.reservauto.net/bookCar`;
}

/**
 * Computes the straight-line distance in metres between two GPS coordinates
 * using the Haversine formula.
 * @param {number} lat1 - Latitude of point A
 * @param {number} lng1 - Longitude of point A
 * @param {number} lat2 - Latitude of point B
 * @param {number} lng2 - Longitude of point B
 * @returns {number} Distance in metres
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // metres
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetches the list of available Communauto vehicles for a given branch
 * directly from the Reservauto API.
 * @param {number} branchId - Numeric branch ID (1 = Montreal, 2 = Quebec, 3 = Toronto)
 * @returns {Promise<object>} Parsed JSON response from the Reservauto API
 */
function fetchCars(branchId) {
    return new Promise((resolve, reject) => {
        const url = new URL(`/WCF/LSI/LSIBookingServiceV3.svc/GetAvailableVehicles?BranchID=${branchId}&LanguageID=2`, 'https://www.reservauto.net');
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

/**
 * Core polling loop for a single subscription. Fetches available cars, filters
 * them by the subscriber's radius, and sends a Web Push notification if any
 * are found. On success the subscription is removed. On failure or no cars,
 * the poll is rescheduled after POLL_INTERVAL_MS.
 * @param {string} id - Subscription UUID
 */
async function pollForCars(id) {
    const entry = subscriptions.get(id);
    if (!entry) return;

    const { subscription, city, lat, lng, radius } = entry;
    const branchId = branchIds[city];

    try {
        const json = await fetchCars(branchId);
        const vehicles = json?.d?.Vehicles ?? [];

        const nearby = vehicles
            .map(v => ({ ...v, distance: haversineDistance(lat, lng, v.Latitude, v.Longitude) }))
            .filter(v => v.distance <= radius)
            .sort((a, b) => a.distance - b.distance);

        if (nearby.length > 0) {
            const top = nearby[0];
            const title = nearby.length > 1 ? `Communauto Found ${nearby.length} Cars!` : 'Communauto Found!';
            const body = nearby.length > 1
                ? `Closest: ${top.CarBrand} ${top.CarModel} (${Math.floor(top.distance)}m away)`
                : `${top.CarBrand} ${top.CarModel} is ${Math.floor(top.distance)}m away.`;

            await webpush.sendNotification(subscription, JSON.stringify({
                title,
                body,
                icon: 'static/images/android-chrome-192x192.png',
                url: getBookingUrl(city)
            }));

            console.log(`[PUSH] Sent notification to subscription ${id}`);
            removeSubscription(id);
            return;
        }
    } catch (err) {
        console.error(`[PUSH] Poll error for ${id}:`, err.message);
    }

    if (subscriptions.has(id)) {
        const timerId = setTimeout(() => pollForCars(id), POLL_INTERVAL_MS);
        subscriptions.get(id).timerId = timerId;
    }
}

/**
 * Initialises the web-push library with VAPID credentials from environment
 * variables. Must be called once at server startup before any subscriptions
 * are accepted.
 * @returns {boolean} true if VAPID keys were found and set, false otherwise
 */
export function initWebPush() {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.warn('[PUSH] VAPID keys not set — background push notifications disabled.');
        return false;
    }
    webpush.setVapidDetails(VAPID_EMAIL || 'mailto:admin@localhost', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    return true;
}

/**
 * Registers a new push subscription and immediately starts a polling loop for
 * it. The loop will fire a push notification as soon as a car is found within
 * the specified radius and then remove itself.
 * @param {object} params
 * @param {object} params.pushSubscription - Web Push subscription object from the browser
 * @param {string} params.city             - Target city ('montreal', 'quebec', 'toronto')
 * @param {number} params.lat              - User latitude
 * @param {number} params.lng              - User longitude
 * @param {number} params.radius           - Search radius in metres
 * @returns {string} UUID identifying this subscription (used to cancel it later)
 */
export function addSubscription({ pushSubscription, city, lat, lng, radius }) {
    const id = randomUUID();
    subscriptions.set(id, { subscription: pushSubscription, city, lat, lng, radius, timerId: null });
    pollForCars(id);
    console.log(`[PUSH] New subscription ${id} (${city}, radius ${radius}m)`);
    return id;
}

/**
 * Cancels an active subscription: clears its pending poll timer and removes it
 * from the store. Safe to call with an unknown id (no-op).
 * @param {string} id - Subscription UUID returned by addSubscription
 */
export function removeSubscription(id) {
    const entry = subscriptions.get(id);
    if (entry?.timerId) clearTimeout(entry.timerId);
    subscriptions.delete(id);
    console.log(`[PUSH] Removed subscription ${id}`);
}

/**
 * Returns the number of currently active push subscriptions.
 * @returns {number}
 */
export function getSubscriptionCount() {
    return subscriptions.size;
}
