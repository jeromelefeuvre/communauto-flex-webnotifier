import https from 'https';
import fs from 'fs';
import path from 'path';

const BASE_URL = (process.env.BASE_URL && process.env.BASE_URL !== '/') ? ('/' + process.env.BASE_URL.replace(/^\/|\/$/g, '')) : '';
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg']);

export const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

export function readBody(req) {
    const MAX_BODY_SIZE = 1e6; // 1 MB
    return new Promise((resolve, reject) => {
        let data = '';
        let bodySize = 0;
        req.on('data', chunk => {
            bodySize += chunk.length;
            if (bodySize > MAX_BODY_SIZE) {
                req.connection.destroy();
                return reject(new Error('Request body too large'));
            }
            data += chunk;
        });
        req.on('end', () => {
            if (!data) return resolve({});
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(new Error('Invalid JSON body')); }
        });
        req.on('error', reject);
    });
}

export function handleGeocodeAddress(requestUrl, res) {
    const params = new URL(requestUrl, 'http://localhost').searchParams;
    const q = params.get('q') || '';
    if (!q) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end('[]');
    }

    const target = new URL('https://nominatim.openstreetmap.org/search');
    target.searchParams.set('q', q);
    target.searchParams.set('format', 'json');
    target.searchParams.set('limit', '5');
    target.searchParams.set('addressdetails', '1');
    target.searchParams.set('countrycodes', 'ca');

    console.log(`[Geocode] Address lookup: ${q}`);

    https.get({ hostname: 'nominatim.openstreetmap.org', path: `/search?${target.searchParams}`, headers: {
        'Accept-Language': 'fr,en',
        'User-Agent': 'CommunautoFlexWebNotifier/1.0 (https://github.com/jeromelefeuvre/communauto-flex-webnotifier)'
    }}, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error('[Geocode] Address error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end('[]');
    });
}

export function handleGeocodePostal(requestUrl, res) {
    const params = new URL(requestUrl, 'http://localhost').searchParams;
    const q = params.get('q') || '';
    if (!q) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end('{}');
    }

    console.log(`[Geocode] Postal code lookup: ${q}`);

    https.get({ hostname: 'geocoder.ca', path: `/?locate=${encodeURIComponent(q)}&geoit=XML&json=1`, headers: {
        'User-Agent': 'CommunautoFlexWebNotifier/1.0'
    }}, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error('[Geocode] Postal error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end('{}');
    });
}

export function handleApiProxy(requestUrl, res) {
    const targetUrl = new URL(requestUrl.replace('/api/cars', '/WCF/LSI/LSIBookingServiceV3.svc/GetAvailableVehicles'), 'https://www.reservauto.net');
    console.log(`[API] Proxying request to: ${targetUrl.href}`);

    https.get(targetUrl, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error('[API] Proxy Error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
    });
}

export function handleVersionProxy(res) {
    fs.readFile('./package.json', 'utf8', (err, data) => {
        if (err) {
            console.error('[API] Version Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ version: 'unknown' }));
        }
        try {
            const pkg = JSON.parse(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ version: pkg.version }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ version: 'error' }));
        }
    });
}

export function handleStaticFiles(requestUrl, res) {
    requestUrl = requestUrl.split('?')[0];
    let filePath = './frontend' + requestUrl;
    if (filePath === './frontend/') filePath = './frontend/index.html';

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });

            if (TEXT_EXTENSIONS.has(extname)) {
                let text = content.toString('utf-8');
                text = text.replaceAll('__BASE_URL__', BASE_URL);

                if (filePath === './frontend/index.html') {
                    let version = 'unknown';
                    try {
                        const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
                        version = pkg.version;
                    } catch (e) { }

                    // Dynamically cache-bust main static assets based on package version
                    text = text.replace(/href="static\/css\/style\.css"/g, `href="static/css/style.css?v=${version}"`);
                    text = text.replace(/src="static\/js\/config\.js"/g, `src="static/js/config.js?v=${version}"`);
                    text = text.replace(/src="static\/js\/utils\.js"/g, `src="static/js/utils.js?v=${version}"`);
                    text = text.replace(/src="static\/js\/ui\.js"/g, `src="static/js/ui.js?v=${version}"`);
                    text = text.replace(/src="static\/js\/map\.js"/g, `src="static/js/map.js?v=${version}"`);
                    text = text.replace(/src="static\/js\/app\.js"/g, `src="static/js/app.js?v=${version}"`);
                }

                return res.end(text);
            }

            res.end(content);
        }
    });
}
