const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
assert.match(source, /id="padX"[^>]*value="0\.53"/);
assert.match(source, /id="padY"[^>]*value="0\.03"/);
assert.match(source, /id="density"[^>]*value="1"/);
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
  printHeight: '0.28', speed: '3', direction: '1', density: '8', padX: '0.19', padY: '0' };
const nodes = { preview: canvas(), wireBitmap: canvas() };
const get = id => {
  if(nodes[id]) return nodes[id];
  const input = source.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'));
  const select = source.match(new RegExp('<select[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</select>'));
  const options = select ? Array.from(select[1].matchAll(/<option([^>]*)>([^<]*)<\/option>/g), match => ({
    value: match[1].match(/value="([^"]*)"/)?.[1] ?? match[2], defaultSelected: /\bselected\b/.test(match[1]),
  })) : undefined;
  return nodes[id] = { value: values[id] ?? '', tagName: select ? 'SELECT' : 'INPUT', options,
    defaultValue: input?.[0].match(/value="([^"]*)"/)?.[1] ?? '',
    type: input?.[0].match(/type="([^"]*)"/)?.[1] ?? '',
    min: input?.[0].match(/min="([^"]*)"/)?.[1] ?? '',
    max: input?.[0].match(/max="([^"]*)"/)?.[1] ?? '',
    addEventListener(){}, focus(){},
  };
};
const stored = new Map();
const localStorage = {
  getItem: key => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
};
const scope = { document: { getElementById: get,
  querySelector: selector => ({textContent:selector, replaceWith(){}}),
  createElement: tag => tag === 'canvas' ? canvas() : {append(){}, setAttribute(){}, addEventListener(){}},
},
  navigator: {}, localStorage, TextEncoder, Uint8Array, console };
vm.createContext(scope);
vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1], scope);
const run = code => vm.runInContext(code, scope);
assert(Math.abs(run('LEFT_INSET') - 0.0475) < 1e-10);
assert(Math.abs(run('TAG_H - 2 * LEFT_INSET') - 0.53) < 1e-10);
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
const bitmap = run('prepareBitmap(opts())');
const unpacked = run('unpackBitmap')(bitmap);
assert.equal(unpacked[0], 0);
assert.equal(unpacked[4], 255);
assert.equal(unpacked[3], 255);
const binaryJob = run('buildTSPL(opts())');
const header = new TextEncoder().encode('BITMAP 39,3,1,1,0,');
const start = Buffer.from(binaryJob).indexOf(Buffer.from(header)) + header.length;
assert(start >= header.length);
assert.deepEqual(Array.from(binaryJob.slice(start, start + bitmap.bytes.length)), Array.from(bitmap.bytes));
const roundTrip = run('packBitmap')(unpacked, bitmap.stride * 8, bitmap.height);
assert.deepEqual(Array.from(roundTrip), Array.from(bitmap.bytes));
get('printHeight').value = '0.625';
const tallerJob = new TextDecoder().decode(run('buildTSPL(opts())'));
assert(tallerJob.includes('SIZE 4.00,0.625\r\nGAP 0.35,0\r\n'));
assert.equal(run('TAG_H'), 0.625);
get('printHeight').value = '';
assert.equal(run('opts().printHeight'), 0.28);
run('drawPreview()');
assert(get('tsplPreview').textContent.includes('SIZE 4.00,0.28\r\nGAP 0.35,0'));
assert(get('tsplPreview').textContent.includes('BITMAP 39,3,1,1,0,<binary pixels: 1 bytes>'));
get('copies').value = '3';
get('printHeight').value = '0.625';
run('drawPreview()');
assert(get('tsplPreview').textContent.startsWith('SIZE 4.00,0.625\r\n'));
assert(get('tsplPreview').textContent.endsWith('PRINT 3,1\r\n'));
const parts = run('jobParts(opts(), prepareBitmap(opts()))');
const encodedParts = Buffer.concat(parts.map(part => typeof part === 'string' ? Buffer.from(part) : Buffer.from(part)));
assert.deepEqual(encodedParts, Buffer.from(run('buildTSPL(opts())')));
run('updateResetButtons()');
assert.equal(run("resetButtons.get('printHeight').hidden"), false);
run("resetSetting('printHeight')");
assert.equal(get('printHeight').value, '0.28');
assert.equal(run("resetButtons.get('printHeight').hidden"), true);
get('padX').value = '0.53';
run('updateResetButtons()');
assert.equal(run("resetButtons.get('padX').hidden"), true);
get('padX').value = '0.1';
run('updateResetButtons()');
assert.equal(run("resetButtons.get('padX').hidden"), false);
run("resetSetting('padX')");
assert.equal(get('padX').value, '0.53');
get('direction').value = '0';
run("resetSetting('direction')");
assert.equal(get('direction').value, '1');
assert.equal(JSON.parse(stored.get(run('SETTINGS_KEY'))).direction, '1');
assert.equal(run("resetButtons.has('name') || resetButtons.has('line2')"), false);
get('name').value = 'Persisted plant';
get('line2').value = 'Persisted description';
run("setPad('x', 0.52); setPad('y', 0.03)");
const saved = JSON.parse(stored.get(run('SETTINGS_KEY')));
assert.equal(saved.name, 'Persisted plant');
assert.equal(saved.line2, 'Persisted description');
assert.equal(saved.padX, '0.52');
assert.equal(saved.padY, '0.03');
for(const id of run('SETTINGS_IDS')) get(id).value = '';
run('restoreSettings()');
for(const [id, value] of Object.entries(saved)) assert.equal(get(id).value, value);
get('direction').tagName = 'SELECT';
get('direction').options = [{value:'0'}, {value:'1', defaultSelected:true}];
get('copies').type = 'number'; get('copies').min = '1'; get('copies').max = '999';
stored.set(run('SETTINGS_KEY'), JSON.stringify({direction:'invalid', copies:'-1', name:42}));
run('restoreSettings()');
assert.equal(get('direction').value, saved.direction);
assert.equal(get('copies').value, saved.copies);
assert.equal(get('name').value, saved.name);
stored.set(run('SETTINGS_KEY'), '{broken json');
assert.doesNotThrow(() => run('restoreSettings()'));
localStorage.setItem = () => { throw new Error('storage blocked'); };
assert.doesNotThrow(() => run('saveSettings()'));
assert(get('settingsStatus').textContent.includes('unavailable'));
console.log('Passed pre-padding media settings, upright direction, cropped bitmap coordinates, empty raster and two-line font placement.');
console.log('Passed preview decoder round-trip and byte equality with the USB payload.');
console.log('Passed configurable print height, unchanged gap and physical outline, and default height fallback.');
console.log('Passed live TSPL preview and shared command serialization.');
console.log('Passed local settings round-trip, saved guide dragging, invalid saved values, corrupt JSON and blocked storage.');
console.log('Passed per-setting default visibility, numeric and select resets, local persistence and text field exclusion.');
