import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const apps = resolve(dirname(fileURLToPath(import.meta.url)), '../apps');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.m3u': 'audio/x-mpegurl' };
const port = Number(process.env.PORT || 3210);
const host = process.env.HOST || '127.0.0.1';

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/malayalam-tv' || pathname === '/kerala-news') {
      response.writeHead(302, { Location: `${pathname}/` });
      response.end();
      return;
    }
    const prefix = pathname.startsWith('/malayalam-tv/') ? '/malayalam-tv/' : pathname.startsWith('/kerala-news/') ? '/kerala-news/' : '/';
    const app = prefix === '/malayalam-tv/' ? 'malayalam-tv' : 'kerala-news';
    const root = resolve(apps, app);
    const relative = pathname.slice(prefix.length) || 'index.html';
    const target = resolve(root, relative);
    if (!target.startsWith(root + sep) || !(await stat(target)).isFile()) throw new Error('Not found');
    response.writeHead(200, {
      'Content-Type': types[extname(target)] || 'application/octet-stream',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  }
}).listen(port, host, () => {
  console.log(`Kerala News: http://${host}:${port}`);
  console.log(`Malayalam TV: http://${host}:${port}/malayalam-tv/`);
});
