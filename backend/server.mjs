import 'dotenv/config';
import http from 'http';
import { handleApiProxy, handleVersionProxy, handleStaticFiles, readBody } from './handlers.mjs';
import { initWebPush, addSubscription, removeSubscription } from './pushManager.mjs';

const pushEnabled = initWebPush();
const PORT = process.env.PORT || 8000;

const server = http.createServer(async (req, res) => {
    // Enable CORS for all routes (just in case)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, DELETE');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    // Support reverse proxies by stripping the configured base URL
    const baseUrl = process.env.BASE_URL || '';
    let requestUrl = req.url;

    if (baseUrl && requestUrl.startsWith(baseUrl)) {
        requestUrl = requestUrl.slice(baseUrl.length);
        if (requestUrl === '') requestUrl = '/';
    }

    // ── Push notification routes ──────────────────────────────────────────────

    if (requestUrl === '/api/push/vapid-public-key') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ publicKey: process.env.VAPID_PUBLIC_KEY || null }));
    }

    if (requestUrl === '/api/push/subscribe' && req.method === 'POST') {
        if (!pushEnabled) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Push not configured' }));
        }
        try {
            const body = await readBody(req);
            const { pushSubscription, city, lat, lng, radius } = body;
            const parsedLat = parseFloat(lat);
            const parsedLng = parseFloat(lng);
            const parsedRadius = parseInt(radius, 10);
            if (isNaN(parsedLat) || isNaN(parsedLng) || isNaN(parsedRadius)) {
                throw new Error('Invalid lat, lng, or radius');
            }
            const id = addSubscription({ pushSubscription, city, lat: parsedLat, lng: parsedLng, radius: parsedRadius });
            res.writeHead(201, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ id }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: err.message }));
        }
    }

    if (requestUrl === '/api/push/unsubscribe' && req.method === 'DELETE') {
        try {
            const body = await readBody(req);
            removeSubscription(body.id);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: err.message }));
        }
    }

    // ── Existing routes ───────────────────────────────────────────────────────

    if (requestUrl.startsWith('/api/cars')) {
        return handleApiProxy(requestUrl, res);
    }

    if (requestUrl.startsWith('/api/version')) {
        return handleVersionProxy(res);
    }

    return handleStaticFiles(requestUrl, res);
});

server.listen(PORT, () => {
    console.log(`[🚀] Communauto Flex Car Notify Web App running at http://localhost:${PORT}`);
});
