const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const draws = [];
function canvas(){
  const node = { width: 812, height: 127, style: {}, addEventListener(){},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 310 }) };
  const ctx = new Proxy({
    fillText(text, x, y){ draws.push({ text, x, y, font: this.font }); },
    getImageData: () => {
      const data = new Uint8Array(node.width * node.height * 4).fill(255);
      data[(3 * node.width + 39) * 4] = 0;
      return { data };
    },
  }, { get: (object, key) => key in object ? object[key] : () => {} });
  node.getContext = () => ctx;
  return node;
}
const values = { name: '', line2: '', copies: '1', reg: 'gap', gap: '0.35',
  speed: '3', direction: '1', density: '8', padX: '0.19', padY: '0' };
const nodes = { preview: canvas() };
const get = id => nodes[id] ??= { value: values[id] ?? '', addEventListener(){} };
const scope = { document: { getElementById: get, createElement: canvas },
  navigator: {}, TextEncoder, Uint8Array, console };
vm.createContext(scope);
vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1], scope);
const run = code => vm.runInContext(code, scope);
get('name').value = 'banana';
get('line2').value = 'second line';
const job = new TextDecoder().decode(run('buildTSPL(opts())'));
assert(job.includes('DIRECTION 1,0\r\nCLS'));
assert(source.includes('<option value="1" selected>'));
assert(job.includes('SIZE 4.00,0.28\r\nGAP 0.35,0\r\n'));
assert(!job.includes('REFERENCE '));
assert(!job.includes('SHIFT '));
assert(draws.some(d => d.text === 'banana' && d.x === 39 && d.y === 0 && d.font.startsWith('700 ')));
assert(draws.some(d => d.text === 'second line' && d.x === 39 && d.y === 28 && d.font.startsWith('400 ')));
assert(job.includes('BITMAP 39,3,1,1,0,'));
assert(!job.includes('BITMAP 0,0,102,127,0,'));
const blank = new Uint8Array(10 * 10 * 4).fill(255);
assert.equal(run('cropToInk')(blank, 10, 10), null);
blank[(2 * 10 + 3) * 4] = 0;
blank[(6 * 10 + 8) * 4] = 0;
const ink = run('cropToInk')(blank, 10, 10);
assert.deepEqual([ink.x, ink.y, ink.width, ink.height], [3, 2, 6, 5]);
assert.equal(ink.pixels[0], 0);
assert.equal(ink.pixels[(4 * 6 + 5) * 4], 0);
console.log('Passed pre-padding media settings, upright direction, cropped bitmap coordinates, empty raster and two-line font placement.');
