const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

execFileSync(process.execPath, [path.join(__dirname, 'build-wasm.cjs')], { stdio: 'inherit' });
const out = path.join(__dirname, 'dist');
fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.join(__dirname, 'index.html'));
const boot = fs.readFileSync(path.join(__dirname, 'printer-boot.js'));
const revision = createHash('sha256').update(html).update(boot).digest('hex').slice(0, 16);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'stake-printer.html'), html);
fs.writeFileSync(path.join(out, 'printer-boot.js'), boot);
const worker = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
fs.writeFileSync(path.join(out, 'sw.js'), worker.replace('stake-printer-v1', `stake-printer-${revision}`));
console.log(`Static assets: ${out}`);
