const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

execFileSync(process.execPath, [path.join(__dirname, 'build-wasm.cjs')], { stdio: 'inherit' });

async function build(){
  const { build: viteBuild } = await import('vite');
  await viteBuild({ root: __dirname, configFile: path.join(__dirname, 'vite.config.ts') });
  const out = path.join(__dirname, 'dist');
  fs.copyFileSync(path.join(out, 'index.html'), path.join(out, 'stake-printer.html'));
  const files = fs.readdirSync(out, { recursive: true }).filter(file => fs.statSync(path.join(out, file)).isFile()).sort();
  const hash = createHash('sha256');
  for(const file of files) hash.update(file).update(fs.readFileSync(path.join(out, file)));
  const worker = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  const revision = hash.update(worker).digest('hex').slice(0, 16);
  const urls = ['/', ...files.map(file => '/' + file.replaceAll(path.sep, '/')), '/sw.js'];
  fs.writeFileSync(path.join(out, 'sw.js'), worker.replace('stake-printer-v1', `stake-printer-${revision}`).replace('/* precache */ []', JSON.stringify(urls)));
  console.log(`Static assets: ${out}`);
}

build().catch(error => { console.error(error); process.exitCode = 1; });
