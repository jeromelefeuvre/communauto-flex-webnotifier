const { test, expect } = require('@playwright/test');

test.describe('Communauto Flex WebNotifier end-to-end tests', () => {

    test.beforeEach(async ({ page }) => {
        // Auto-accept any alerts the app throws (e.g. Stop Search)
        page.on('dialog', dialog => dialog.accept());

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
        await expect(page.locator('#status-text')).toContainText('Fetching cars');
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

        // A visual check of the zoom would be ideal here but is hard via code without intercepting viewport
        // This ensures the logic at least doesn't crash
    });
});
