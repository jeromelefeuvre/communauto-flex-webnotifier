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
                            Latitude: 45.556000, // ~686m away (outside 600m limit, inside 800m map buffer)
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

    test('UI Search radius remains unchanged when a car is found', async ({ page }) => {
        // Wait for the app to load and auto-search to start
        await expect(page.locator('#btn-stop')).toBeVisible();
        await page.click('#btn-stop');
        await page.waitForSelector('#btn-start', { state: 'visible' });

        // Change distance to 800m to include the car
        await page.fill('#distance', '800');
        await page.click('#btn-start');

        // The mock API returns a car at ~686m away.
        // It should find the car, show it, and stop searching, but NOT shrink the radius.
        await expect(page.locator('#success-car-card')).toBeVisible({ timeout: 15000 });

        // The visible value should remain 800
        const visibleValue = await page.evaluate(() => document.getElementById('distance').value);
        expect(parseInt(visibleValue)).toBe(800);

        // Map circle should remain 800
        const updatedRadius = await page.evaluate(() => {
            return window.MapController.searchCircle ? window.MapController.searchCircle.getRadius() : null;
        });
        expect(updatedRadius).toBe(800);

        // Ensure search has dynamically stopped (Start button is visible again)
        await expect(page.locator('#btn-start')).toBeVisible();
    });

});
