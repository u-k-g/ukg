const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const files = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/stake-printer.html': 'index.html',
  '/printer-boot.js': 'printer-boot.js',
  '/sw.js': 'sw.js',
};
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const file = files[pathname];
  if (!file) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await fs.readFile(path.join(__dirname, file));
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Could not read ' + file);
  }
});

server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(Number(process.env.PORT ?? 8000), '127.0.0.1', () => {
  console.log(`Stake printer: http://localhost:${server.address().port}`);
});
