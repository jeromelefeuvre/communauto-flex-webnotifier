const { test, expect } = require('@playwright/test');

test.describe('Communauto Flex WebNotifier end-to-end tests', () => {

    test.beforeEach(async ({ page }) => {
        // Auto-accept any alerts the app throws (e.g. Stop Search)
        page.on('dialog', dialog => dialog.accept());
        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

        // Intercept API calls to avoid spamming the live Communauto servers
        await page.route('**/api/cars*', async route => {
            const mockData = {
                d: {
                    Vehicles: [
                        {
                            CarBrand: "Mock",
                            CarModel: "Close Car",
                            CarPlate: "TEST 01",
                            CarColor: "Blue",
                            Latitude: 45.552531, // ~300m away (inside 600m limit, outside 200m)
                            Longitude: -73.652000
                        },
                        {
                            CarBrand: "Mock",
                            CarModel: "Far Car",
                            CarPlate: "TEST 02",
                            CarColor: "Red",
                            Latitude: 45.580000, // ~3.3km away (inside 5km, outside 1km)
                            Longitude: -73.652279
                        }
                    ]
                }
            };

            await new Promise(r => setTimeout(r, 100)); // Micro-delay to allow 'Fetching' state to paint
            await route.fulfill({ json: mockData });
        });

        // Mock geolocation to Montreal
        await page.context().grantPermissions(['geolocation']);
        await page.context().setGeolocation({ latitude: 45.549831, longitude: -73.652279 });
        await page.goto('http://localhost:8000');
    });

    test('UI Loads correctly', async ({ page }) => {
        await expect(page).toHaveTitle(/Communauto/);
        await expect(page.locator('h1')).toHaveText('Communauto Flex Car Notify');
        await expect(page.locator('#btn-geolocation')).toBeVisible();
        await expect(page.locator('#map')).toBeVisible();
    });

    test('Auto-geolocation on load works', async ({ page }) => {
        // Because permissions are granted in beforeEach, it should auto-fetch and start
        await expect(page.locator('#location')).toHaveValue('45.549831,-73.652279');
        await expect(page.locator('#btn-stop')).toBeVisible();
    });

    test('Start and Stop Search toggle works', async ({ page }) => {
        // Stop the auto-search
        await page.click('#btn-stop');
        await page.waitForSelector('#btn-start', { state: 'visible' });
        await page.waitForSelector('#btn-stop', { state: 'hidden' });

        // Start it again
        await page.click('#btn-start');
        await page.waitForSelector('#btn-stop', { state: 'visible' });
        await page.waitForSelector('#btn-start', { state: 'hidden' });
    });

    test('Map interacts and draws cars', async ({ page }) => {
        // Wait for the fetch cycle to complete and map to populate
        await expect(page.locator('#status-text')).toContainText('Waiting...', { timeout: 15000 });

        // Check if Leaflet drew the user marker and car markers
        const markers = page.locator('.leaflet-marker-icon');
        await expect(async () => {
            const count = await markers.count();
            expect(count).toBeGreaterThan(1);
        }).toPass({ timeout: 15000 }); // At least user + 1 car

        // Check if search circle was drawn
        const paths = page.locator('.leaflet-interactive');
        await expect(paths.first()).toBeVisible();
    });

    test('Map does not zoom out to whole world on first search', async ({ page }) => {
        // Wait for the fetch cycle to complete and map to populate on initial load
        await expect(page.locator('#status-text')).toContainText('Waiting...', { timeout: 15000 });

        // Check if map zoom is reasonable (not 0 or very small which means whole world)
        const initialZoom = await page.evaluate(() => {
            return window.MapController.map ? window.MapController.map.getZoom() : null;
        });

        // It should be zoomed in enough to comfortably see the city (typically >= 10 depending on radius)
        expect(initialZoom).toBeGreaterThanOrEqual(10);
    });

    test('Map circle radius updates dynamically on input change without map stuttering', async ({ page }) => {
        // Wait for the app to load and auto-search to start
        await expect(page.locator('#btn-stop')).toBeVisible();
        await page.click('#btn-stop');
        await page.waitForSelector('#btn-start', { state: 'visible' });

        // Record initial map zoom and center
        const initialZoom = await page.evaluate(() => window.MapController.map.getZoom());
        const initialCenter = await page.evaluate(() => window.MapController.map.getCenter());

        // Change the radius input
        await page.fill('#distance', '1200');

        // Check updated radius
        const updatedRadius = await page.evaluate(() => {
            return window.MapController.searchCircle ? window.MapController.searchCircle.getRadius() : null;
        });
        expect(updatedRadius).toBe(1200);

        // Verify map did NOT stutter (zoom or center shouldn't have changed just by typing)
        const currentZoom = await page.evaluate(() => window.MapController.map.getZoom());
        const currentCenter = await page.evaluate(() => window.MapController.map.getCenter());

        expect(currentZoom).toBe(initialZoom);
        expect(currentCenter.lat).toBeCloseTo(initialCenter.lat, 5);
        expect(currentCenter.lng).toBeCloseTo(initialCenter.lng, 5);
    });

    test('UI Search radius updates when a closer car is found', async ({ page }) => {
        // Wait for the app to load and auto-search to start
        await expect(page.locator('#btn-stop')).toBeVisible();
        await page.click('#btn-stop');
        await page.waitForSelector('#btn-start', { state: 'visible' });

        // Change distance to 600m
        await page.fill('#distance', '600');
        await page.click('#btn-start');

        // The mock API returns a car at ~300m away. 
        // The greedy search should automatically shrink the radius to keep looking.
        await expect(page.locator('#status-text')).toContainText('Waiting...', { timeout: 15000 });

        // We expect the distance input to sync downwards from 600
        await page.waitForTimeout(1000);
        const visibleValue = await page.evaluate(() => document.getElementById('distance').value);
        expect(parseInt(visibleValue)).toBeLessThan(600);

        // Ensure map circle also updated to match the visible input
        const updatedRadius = await page.evaluate(() => {
            return window.MapController.searchCircle ? window.MapController.searchCircle.getRadius() : null;
        });
        expect(updatedRadius).toBe(parseInt(visibleValue));
    });

    test('Verify Zoom Radius behavior', async ({ page }) => {
        // Reload the page and wait for the UI to hydrate
        await page.reload();

        // Halt the auto-search deterministically. 
        // We use a short timeout because on fast CI servers, the search might already auto-complete and hide the stop button.
        try {
            await page.click('#btn-stop', { timeout: 3000 });
        } catch (e) {
            // Button was already hidden or search auto-completed. That's fine.
        }

        // We are now deterministically halted and clean
        await page.waitForSelector('#btn-start', { state: 'visible' });

        // Setup initial manual search distance
        await page.fill('#distance', '5000');
        await page.click('#btn-start');

        // Wait for it to draw and finish the cycle
        await expect(page.locator('#status-text')).toContainText('Waiting...', { timeout: 15000 });

        // Grab zoom level at 5000m
        const zoom5000 = await page.evaluate(() => window.MapController.map.getZoom());

        // Halt it again to change distance cleanly
        try {
            await page.click('#btn-stop', { timeout: 3000 });
        } catch (e) {
            // Button was already hidden or search auto-completed. That's fine.
        }
        await page.waitForSelector('#btn-start', { state: 'visible' });

        // Change distance to zoom in
        await page.fill('#distance', '1000');
        await page.click('#btn-start');

        // Verify it updates correctly
        await expect(page.locator('#status-text')).toContainText('Waiting...', { timeout: 15000 });

        // Grab zoom level at 1000m
        const zoom1000 = await page.evaluate(() => window.MapController.map.getZoom());

        // The app auto-shrinks to the closest car (400m limit due to 300m mock car).
        // It should consistently land at the high-zoom tighter framing, and NEVER falsely pop out to 14.
        expect(zoom5000).not.toBe(14);
        expect(zoom1000).not.toBe(14);
        expect(zoom5000).toBeGreaterThanOrEqual(15);
        expect(zoom1000).toBeGreaterThanOrEqual(15);

        // A visual check of the zoom would be ideal here but is hard via code without intercepting viewport
        // This ensures the logic at least doesn't crash
    });
});
