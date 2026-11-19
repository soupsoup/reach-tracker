// Runs the top-level api/*.js handlers on the VPS (api/cron is Vercel-only). On Vercel each file was its own
// serverless function; here one small Node process loads them all and gives
// each the subset of Vercel's request/response helpers the handlers use:
// request.query / .body, response.status() / .json() / .send().
// nginx serves the static site and proxies /api/* to this process
// (deploy/vps/nginx.conf).
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_DIR = path.join(__dirname, '..', 'api');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4424);
const MAX_BODY = 1024 * 1024;

// Load every handler once at startup; the route is the file name.
const handlers = new Map();
for (const file of fs.readdirSync(API_DIR)) {
  if (!file.endsWith('.js')) continue;
  handlers.set(file.slice(0, -3), (await import(pathToFileURL(path.join(API_DIR, file)))).default);
}

const readBody = (req) => new Promise((resolve, reject) => {
  if (req.method === 'GET' || req.method === 'HEAD') return resolve(undefined);
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return resolve(undefined);
    if ((req.headers['content-type'] || '').includes('application/json')) {
      try { return resolve(JSON.parse(raw)); } catch { return reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    }
    resolve(raw);
  });
  req.on('error', reject);
});

const withHelpers = (res) => {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return res;
  };
  res.send = (data) => {
    if (data !== null && typeof data === 'object' && !Buffer.isBuffer(data)) return res.json(data);
    res.end(data);
    return res;
  };
  return res;
};

const server = http.createServer(async (req, res) => {
  withHelpers(res);
  const url = new URL(req.url, 'http://localhost');
  const match = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/);
  const handler = match && handlers.get(match[1]);
  if (!handler) return res.status(404).json({ error: 'Not found' });

  try {
    req.query = Object.fromEntries(url.searchParams);
    req.body = await readBody(req);
    await handler(req, res);
    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error(`/api/${match[1]}:`, error);
    if (!res.headersSent) res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal error' });
    else if (!res.writableEnded) res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`reach-tracker api on http://${HOST}:${PORT} (${[...handlers.keys()].join(', ')})`);
});
