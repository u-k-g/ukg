const http = require('node:http');
const fs = require('node:fs/promises');

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  if (!['/', '/index.html', '/stake-printer.html'].includes(pathname)) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const html = await fs.readFile(`${__dirname}/index.html`);
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : html);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Could not read index.html');
  }
});

server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(Number(process.env.PORT ?? 8000), '127.0.0.1', () => {
  console.log(`Stake printer: http://localhost:${server.address().port}`);
});
