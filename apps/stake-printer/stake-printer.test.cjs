const assert = require('node:assert/strict');
const fs = require('node:fs');
const { defaults, initialState, decodeSettings, encodeSettings, isDefault, resetSettings } = require('./src/settings.ts');
const wasm = fs.readFileSync(`${__dirname}/printer-core/target/wasm32-unknown-unknown/release/printer_core.wasm`);
globalThis.PRINTER_EXPORTS = new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
const p = require('./src/printer.ts');
const draws = [];
function canvas(){
  const node = { width: 812, height: 127 };
  const context = new Proxy({
    fillText(text, x, y){ draws.push({ text, x, y, font: this.font }); },
    getImageData(){
      const data = new Uint8ClampedArray(node.width * node.height * 4).fill(255);
      data[(3 * node.width + 39) * 4] = 0;
      return { data };
    },
  }, { get: (object, key) => key in object ? object[key] : () => {} });
  node.getContext = () => context;
  return node;
}
globalThis.document = { createElement: tag => { assert.equal(tag, 'canvas'); return canvas(); } };
const css = fs.readFileSync(`${__dirname}/src/style.css`, 'utf8');
assert.deepEqual([...new Set(css.match(/#[\da-f]{6}\b/gi).map(color => color.toUpperCase()))].sort(), ['#000000', '#37654C', '#A41E14', '#FFFEFB']);
assert.deepEqual([defaults.offsetX, defaults.offsetY, defaults.printHeight, defaults.gap, defaults.speed, defaults.density, defaults.direction], ['128', '1', '0.25', '0.38', '2', '1', '1']);
assert.equal(defaults.listLine2, 'www.roothappyplants.com');
assert.equal(initialState().showOffsetGuides, false);
assert.equal(initialState().alignmentDot, false);
assert.equal(defaults.name, ''); assert.equal(defaults.line2, '');
const settings = { ...defaults, name: 'banana', line2: 'second line', copies: '1', reg: 'gap', gap: '0.35', printHeight: '0.28', speed: '3', density: '8', offsetX: '108', offsetY: '6' };
const o = p.options(settings);
const decode = bytes => new TextDecoder().decode(bytes), encode = text => new TextEncoder().encode(text);
const bytes = p.buildTSPL(o), job = decode(bytes);
assert(job.includes('DIRECTION 1,0\r\nCLS'));
assert(job.includes('SIZE 4.00,0.28\r\nGAP 0.35,0\r\n'));
assert(!job.includes('REFERENCE ')); assert(!job.includes('SHIFT '));
assert(job.includes('BITMAP 108,6,1,1,0,'));
assert(draws.some(d => d.text === 'banana' && d.x === 0 && d.y === 0 && d.font.startsWith('700 ')));
assert(draws.some(d => d.text === 'second line' && d.x === 0 && d.y === 28 && d.font.startsWith('400 ')));
for(const [value, command] of [['0', '0,0'], ['1', '1,0'], ['2', '0,1'], ['3', '1,1']]){
  assert(decode(p.buildTSPL({ ...o, direction: value })).includes('DIRECTION ' + command + '\r\n'));
  assert.equal(p.parseTSPL(encode('SIZE 4,0.28\r\nDIRECTION ' + command + '\r\nCLS\r\nPRINT 1,1\r\n')).settings.direction, value);
}
const blank = new Uint8Array(10 * 10 * 4).fill(255);
assert.equal(p.cropToInk(blank, 10, 10), null);
blank[(2 * 10 + 3) * 4] = 0; blank[(6 * 10 + 8) * 4] = 0;
const ink = p.cropToInk(blank, 10, 10);
assert.deepEqual([ink.x, ink.y, ink.width, ink.height], [3, 2, 6, 5]);
assert.equal(ink.pixels[0], 0); assert.equal(ink.pixels[(4 * 6 + 5) * 4], 0);
const bitmap = p.prepareBitmap(o), moved = p.prepareBitmap({ ...o, offsetX: 500, offsetY: 75 });
assert.deepEqual([moved.x, moved.y], [500, 75]);
assert.deepEqual(moved.bytes, bitmap.bytes);
assert.equal(moved.stride, bitmap.stride); assert.equal(moved.height, bitmap.height);
const unpacked = p.unpackBitmap(bitmap);
assert.equal(unpacked[0], 0); assert.equal(unpacked[4], 255); assert.equal(unpacked[3], 255);
assert.deepEqual(p.packBitmap(unpacked, bitmap.stride * 8, bitmap.height), bitmap.bytes);
const header = Buffer.from('BITMAP 108,6,1,1,0,');
const start = Buffer.from(bytes).indexOf(header) + header.length;
assert(start >= header.length);
assert.deepEqual(bytes.slice(start, start + bitmap.bytes.length), bitmap.bytes);
assert.deepEqual(Buffer.concat(p.jobParts(o, bitmap).map(part => Buffer.from(part))), Buffer.from(bytes));
assert(decode(p.buildTSPL({ ...o, printHeight: 0.625 })).includes('SIZE 4.00,0.625\r\nGAP 0.35,0'));
assert.equal(p.options({ ...settings, printHeight: '' }).printHeight, 0.25);
assert.equal(p.TAG_H, 0.625);
assert(Math.abs(p.LEFT_INSET - 0.0475) < 1e-10);
assert(Math.abs(p.printerX(128) - p.ix(0.57)) < 1e-8);
assert(Math.abs(p.printerY(0) - p.iy(0.1745)) < 1e-8);
assert(Math.abs(p.printerY(4) - p.iy(0.1745 + 4 / 203)) < 1e-8);
assert(Math.abs(p.printerY(62) - p.printerY(52) - 10 * p.SCALE / 203) < 1e-10);
const segments = p.offsetSegments(o);
assert.deepEqual(segments, [
  { axis: 'y', x1: p.printerX(0), y1: p.printerY(0), x2: p.printerX(0), y2: p.printerY(6) },
  { axis: 'x', x1: p.printerX(0), y1: p.printerY(6), x2: p.printerX(108), y2: p.printerY(6) },
]);
assert.equal(p.hitAxis(p.printerX(40), p.printerY(6), 800, o, false), null);
assert.equal(p.hitAxis(p.printerX(40), p.printerY(6), 800, o, true), 'x');
assert.equal(p.hitAxis(p.printerX(0), p.printerY(3), 800, o, true), 'y');
assert.equal(p.hitAxis(p.ix(0.9), p.iy(0.3), 800, o, true), null);
const orientationCalls = [];
const ctx = { translate: (...args) => orientationCalls.push(['translate', ...args]), scale: (...args) => orientationCalls.push(['scale', ...args]) };
p.applyPreviewOrientation(ctx, { direction: '1' }); assert.equal(orientationCalls.length, 0);
p.applyPreviewOrientation(ctx, { direction: '0' });
assert.deepEqual(orientationCalls, [['translate', p.ix(0) + p.ix(p.TAG_W), p.iy(0) + p.iy(p.TAG_H)], ['scale', -1, -1]]);
const target = { getBoundingClientRect: () => ({ left: 0, top: 0, width: p.CV_W, height: p.CV_H }) };
const pointer = { clientX: 700, clientY: 200 };
assert.deepEqual(p.canvasPos(pointer, target, o), { x: 700, y: 200 });
assert.deepEqual(p.canvasPos(pointer, target, { ...o, direction: '0' }), { x: p.ix(0) + p.ix(p.TAG_W) - 700, y: p.iy(0) + p.iy(p.TAG_H) - 200 });
for(const id of resetSettings){ assert(isDefault(id, defaults[id])); assert(!isDefault(id, 'not the default')); }
assert(!resetSettings.includes('name')); assert(!resetSettings.includes('line2')); assert(!resetSettings.includes('copies'));
assert(isDefault('offsetX', '128.0'));
const state = { settings, importedBitmap: { stride: bitmap.stride, height: bitmap.height, bytes: bitmap.bytes }, alignmentDot: true, showOffsetGuides: true };
const restored = decodeSettings(encodeSettings(state));
assert.deepEqual(restored, state);
assert.deepEqual(decodeSettings(null), initialState());
assert.deepEqual(decodeSettings('[]'), initialState());
assert.throws(() => decodeSettings('{broken json'));
const legacy = decodeSettings(JSON.stringify({ padX: '0.53', padY: '0.03', name: 'Legacy text' }));
assert.equal(legacy.settings.offsetX, '108'); assert.equal(legacy.settings.offsetY, '6'); assert.equal(legacy.settings.name, 'Legacy text');
const invalid = decodeSettings(JSON.stringify({ direction: 'invalid', copies: '-1', name: 42, offsetY: 'Infinity', importedBitmap: { stride: 2, height: 1, bytes: [999, 0] } }));
assert.deepEqual(invalid, initialState());
assert.equal(decodeSettings(JSON.stringify({ name: 'a'.repeat(90) })).settings.name.length, 40);
const parsed = p.parseTSPL(bytes);
assert.equal(parsed.settings.offsetX, '108'); assert.equal(parsed.settings.offsetY, '6');
assert.equal(parsed.settings.printHeight, '0.28'); assert.equal(parsed.settings.direction, '1');
assert.deepEqual(parsed.bitmap.bytes, bitmap.bytes);
assert.deepEqual(p.buildTSPL(p.options({ ...defaults, ...parsed.settings }), p.prepareBitmap(p.options({ ...defaults, ...parsed.settings }), parsed.bitmap)), bytes);
for(const [text, error] of [
  ['SIZE 4,0.28\r\nCLS\r\nKILL "*"\r\nPRINT 1,1\r\n', /Unsupported/],
  ['SIZE 4,0.28\r\nCLS\r\nBITMAP 0,0,33,49,0,', /truncated/],
  ['SIZE 4,0.28\r\nCLS\r\nPRINT 1,1\r\nPRINT 1,1\r\n', /one print job/],
  ['SIZE 4,0.28\r\nDIRECTION 2,0\r\nCLS\r\nPRINT 1,1\r\n', /Unsupported/],
  ['SIZE 4,0.28\r\nCLS\r\nBITMAP 0,0,103,1,0,', /supported range/],
]) assert.throws(() => p.parseTSPL(encode(text)), error);
const binaryPixels = new Uint8Array([13, 10, 0, 255]);
assert.deepEqual(p.parseTSPL(Buffer.concat([Buffer.from('SIZE 4,0.28\r\nCLS\r\nBITMAP 5,6,1,4,0,'), Buffer.from(binaryPixels), Buffer.from('\r\nPRINT 1,1\r\n')])).bitmap.bytes, binaryPixels);
const listText = `H. lacunosa ‘Silver Edge’            64
H. lacunosa ‘Silvana’                32
H. walliniana ‘Kinabalu’             32
H. minutiflora                       32
H. lacunosa ‘Red Leaf’               32
H. lacunosa ‘Asami’                  32
H. bakoensis ‘Albomarginata’         64
H. lacunosa ‘Mint Coin’              32
H. lacunosa ‘Souma’                  32
H. lacunosa ‘Black Silver’           64
H. lacunosa ‘Winter Pandora’         96
H. polyneura ‘Inner Variegated’      32
A. ‘Thai Pink’                       40
H. sp. Buntok                        64
H. lacunosa ‘Minara’                 160
H. lacunosa ‘Violet’                 96
H. kanyakumariana ‘Inner Variegated’ 16
H. walliniana ‘Variegated’           32
H. sp. ‘Mini Coin’ Borneo Silver     32
H. lacunosa ‘Variegated’             96
H. sigillatis                        64
H. ‘Mathilde’ Gray Fairy             48`;
const parsedList = p.parsePlantList(listText);
assert.equal(parsedList.errors.length, 0); assert.equal(parsedList.entries.length, 22); assert.equal(parsedList.total, 1192);
assert.equal(parsedList.entries[0].name, 'H. lacunosa ‘Silver Edge’'); assert.equal(parsedList.entries[14].copies, 160);
assert.equal(p.parsePlantList('\n  H.   sp. Buntok\t64\r\n\r\nA. ‘Thai Pink’\u00a0 40 ').total, 104);
assert.equal(p.parsePlantList('Plant 42\t16').entries[0].name, 'Plant 42');
assert.equal(p.parsePlantList('Plant 0\nPlant -2\nPlant 1.5\nPlant 1000\nNo quantity\n32').errors.length, 6);
const listSettings = { ...settings, editMode: 'list', listText };
const listJobs = p.currentJobs(listSettings, { stride: 2, height: 1, bytes: new Uint8Array([1, 2]) }, false);
assert.equal(listJobs.length, 22);
listJobs.forEach((job, index) => {
  assert.equal(job.name, parsedList.entries[index].name); assert.equal(job.copies, parsedList.entries[index].copies);
  assert(decode(job.bytes).endsWith('PRINT ' + job.copies + ',1\r\n'));
  assert(decode(job.bytes).includes('BITMAP 108,6,1,1,0,'));
});
assert(draws.some(d => d.text === 'www.roothappyplants.com' && d.font.startsWith('400 ')));
assert.equal(p.listOptions(o, parsedList.entries[0], 'Custom').line2, 'Custom');
assert.equal(p.listOptions(o, parsedList.entries[0], '').line2, '');
assert.throws(() => p.currentJobs({ ...listSettings, listText: 'Good plant 32\nBad row' }, null, false), /Fix the list errors/);
assert.throws(() => p.currentJobs({ ...listSettings, listText: '' }, null, false), /Fix the list errors/);
assert(p.currentJobs({ ...listSettings, offsetX: '140' }, null, false).every(job => decode(job.bytes).includes('BITMAP 140,6,')));
const emptyOptions = p.options({ ...defaults, offsetY: '58' });
assert.equal(p.prepareBitmap(emptyOptions), null);
const dot = p.prepareBitmap(emptyOptions, null, true);
assert.deepEqual([dot.x, dot.y, dot.height, dot.stride], [128, 58, 8, 1]);
assert.equal(dot.bytes[0], 0); assert(dot.bytes.slice(1).every(byte => byte === 0x7f));
const sourceBytes = new Uint8Array([255, 255, 255, 255]);
const stamped = p.stampAlignmentDot({ x: 1, y: 2, stride: 2, height: 2, bytes: sourceBytes });
assert.equal(sourceBytes[0], 255); assert.deepEqual(Array.from(stamped.bytes), [0, 0, 127, 255]);
console.log('Passed defaults, settings migration/persistence, bitmap packing, Arial rendering, TSPL import/export, orientation and offset geometry, alignment and all 22 list batches / 1,192 labels.');

(async () => {
  const sent = []; let active = 0;
  const target = { async transferOut(endpoint, bytes){
    assert.equal(endpoint, 1); assert.equal(active++, 0); await Promise.resolve(); sent.push(bytes); active--;
    return { status: 'ok', bytesWritten: bytes.length };
  } };
  await p.sendPrintJobs(target, 1, listJobs, () => {});
  assert.equal(sent.length, 22); sent.forEach((bytes, index) => assert.equal(bytes, listJobs[index].bytes));
  let attempts = 0;
  const broken = { async transferOut(endpoint, bytes){ attempts++; return { status: attempts === 2 ? 'stall' : 'ok', bytesWritten: bytes.length }; } };
  await assert.rejects(p.sendPrintJobs(broken, 1, listJobs, () => {}), /Stopped at batch 2/); assert.equal(attempts, 2);
  await assert.rejects(p.sendPrintJobs({ transferOut: async () => ({ status: 'ok', bytesWritten: 0 }) }, 1, listJobs, () => {}), /incomplete/);
  console.log('Passed sequential WebUSB transfers, incomplete-transfer detection and stop-on-failure without automatic retry.');
})().catch(error => { console.error(error); process.exitCode = 1; });
