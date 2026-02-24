import http from 'http';
import fs from 'fs';
import path from 'path';
import https from 'https';

const PORT = 8000;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
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

const server = http.createServer((req, res) => {
    // Enable CORS for all routes (just in case)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
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

    // Route handling
    if (requestUrl.startsWith('/api/cars')) {
        return handleApiProxy(requestUrl, res);
    }

    if (requestUrl.startsWith('/api/version')) {
        return handleVersionProxy(res);
    }

    if (requestUrl.startsWith('/proxy-image')) {
        return handleImageProxy(requestUrl, res);
    }

    return handleStaticFiles(requestUrl, res);
});

function handleApiProxy(requestUrl, res) {
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

function handleVersionProxy(res) {
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

function handleImageProxy(requestUrl, res) {
    const urlParams = new URLSearchParams(requestUrl.split('?')[1]);
    const imgUrl = urlParams.get('url');

    if (!imgUrl) {
        res.writeHead(400);
        return res.end('Missing url parameter');
    }

    console.log(`[IMG] Proxying image request to: ${imgUrl}`);
    const protocol = imgUrl.startsWith('https') ? https : http;

    protocol.get(imgUrl, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
            'Content-Type': proxyRes.headers['content-type'] || 'image/png',
            'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
    }).on('error', (err) => {
        console.error('[IMG] Image Proxy Error:', err);
        res.writeHead(500);
        res.end('Error fetching image');
    });
}

function handleStaticFiles(requestUrl, res) {
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

            if (filePath === './frontend/index.html') {
                let html = content.toString('utf-8');
                let version = 'unknown';
                try {
                    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
                    version = pkg.version;
                } catch (e) { }

                // Dynamically cache-bust main static assets based on package version
                html = html.replace(/href="static\/css\/style\.css"/g, `href="static/css/style.css?v=${version}"`);
                html = html.replace(/src="static\/js\/config\.js"/g, `src="static/js/config.js?v=${version}"`);
                html = html.replace(/src="static\/js\/utils\.js"/g, `src="static/js/utils.js?v=${version}"`);
                html = html.replace(/src="static\/js\/ui\.js"/g, `src="static/js/ui.js?v=${version}"`);
                html = html.replace(/src="static\/js\/map\.js"/g, `src="static/js/map.js?v=${version}"`);
                html = html.replace(/src="static\/js\/app\.js"/g, `src="static/js/app.js?v=${version}"`);

                return res.end(html);
            }

            res.end(content, 'utf-8');
        }
    });
}

server.listen(PORT, () => {
    console.log(`[🚀] Car Notify Web App running at http://localhost:${PORT}`);
});
