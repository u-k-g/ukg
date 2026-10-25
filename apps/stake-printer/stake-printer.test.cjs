const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const css = source.match(/<style>([\s\S]*?)<\/style>/)[1];
assert.deepEqual([...new Set(css.match(/#[\da-f]{6}\b/gi).map(color => color.toUpperCase()))].sort(), ['#000000', '#FFFEFB']);
assert.match(source, /id="offsetX"[^>]*value="128"/);
assert.match(source, /id="offsetY"[^>]*value="0"/);
assert.match(source, /id="printHeight"[^>]*value="0.25"/);
assert.match(source, /id="gap"[^>]*value="0.38"/);
assert.match(source, /id="density"[^>]*value="1"/);
assert.match(source, /id="speed"><option selected>2<\/option>/);
const draws = [];
function canvas(){
  const node = { width: 812, height: 127, style: {}, addEventListener(){}, setAttribute(){},
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
  printHeight: '0.28', speed: '3', direction: '1', density: '8', offsetX: '108', offsetY: '6' };
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
    children: [], append(...children){ this.children.push(...children); },
    replaceChildren(...children){ this.children = children; },
    attributes:{}, setAttribute(key, value){this.attributes[key]=value;},
    addEventListener(){}, focus(){},
  };
};
const stored = new Map();
const localStorage = {
  getItem: key => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
};
const wasmBytes = fs.readFileSync(`${__dirname}/printer-core/target/wasm32-unknown-unknown/release/printer_core.wasm`);
const printer = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes)).exports;
const scope = { PRINTER_EXPORTS: printer, document: { getElementById: get,
  querySelector: selector => ({textContent:selector, replaceWith(){}}),
  createElement: tag => tag === 'canvas' ? canvas() : {children:[], append(...children){this.children.push(...children);}, setAttribute(){}, addEventListener(){}},
},
  navigator: {}, localStorage, TextEncoder, TextDecoder, Uint8Array, console };
vm.createContext(scope);
vm.runInContext(source.match(/<script>([\s\S]*?)<\/script>/)[1], scope);
const run = code => vm.runInContext(code, scope);
assert(Math.abs(run('LEFT_INSET') - 0.0475) < 1e-10);
assert(Math.abs(run('TAG_H - 2 * LEFT_INSET') - 0.53) < 1e-10);
const segments = run('offsetSegments(opts())');
assert.equal(segments[0].axis, 'y');
assert.equal(segments[0].x1, run('printerX(0)'));
assert.equal(segments[0].x2, run('printerX(0)'));
assert.equal(segments[0].y1, run('printerY(0)'));
assert.equal(segments[0].y2, run('printerY(6)'));
assert.equal(segments[1].axis, 'x');
assert.equal(segments[1].x1, run('printerX(0)'));
assert.equal(segments[1].x2, run('printerX(108)'));
assert.equal(segments[1].y1, segments[0].y2);
assert.equal(segments[1].y2, segments[0].y2);
assert.equal(run('hitAxis(printerX(40), printerY(6))'), 'x');
assert.equal(run('hitAxis(printerX(0), printerY(3))'), 'y');
assert(Math.abs(run('printerX(128) - ix(0.57)')) < 1e-8);
assert(Math.abs(run('printerY(0) - iy(0.1745)')) < 1e-8);
assert(Math.abs(run('printerY(4) - iy(0.1745 + 4 / 203)')) < 1e-8);
assert(run('printerX(0) > 0 && printerY(0) > 0'));
assert(Math.abs(run('printerY(62) - printerY(52) - 10 * SCALE / 203')) < 1e-10);
assert.equal(run('hitAxis(ix(0.9), iy(0.3))'), null);
get('name').value = 'banana';
get('line2').value = 'second line';
const job = new TextDecoder().decode(run('buildTSPL(opts())'));
assert(job.includes('DIRECTION 1,0\r\nCLS'));
assert(source.includes('<option value="1" selected>'));
assert(job.includes('SIZE 4.00,0.28\r\nGAP 0.35,0\r\n'));
assert(!job.includes('REFERENCE '));
assert(!job.includes('SHIFT '));
assert(draws.some(d => d.text === 'banana' && d.x === 0 && d.y === 0 && d.font.startsWith('700 ')));
assert(draws.some(d => d.text === 'second line' && d.x === 0 && d.y === 28 && d.font.startsWith('400 ')));
assert(job.includes('BITMAP 108,6,1,1,0,'));
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
get('offsetX').value = '500';
get('offsetY').value = '75';
const movedBitmap = run('prepareBitmap(opts())');
assert.deepEqual([movedBitmap.x, movedBitmap.y], [500, 75]);
assert.deepEqual(Array.from(movedBitmap.bytes), Array.from(bitmap.bytes));
assert.equal(movedBitmap.stride, bitmap.stride);
assert.equal(movedBitmap.height, bitmap.height);
get('offsetX').value = '108';
get('offsetY').value = '6';
const unpacked = run('unpackBitmap')(bitmap);
assert.equal(unpacked[0], 0);
assert.equal(unpacked[4], 255);
assert.equal(unpacked[3], 255);
const binaryJob = run('buildTSPL(opts())');
const header = new TextEncoder().encode('BITMAP 108,6,1,1,0,');
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
assert.equal(run('opts().printHeight'), 0.25);
get('gap').value = '0.095';
assert(new TextDecoder().decode(run('buildTSPL(opts())')).includes('GAP 0.095,0\r\n'));
get('gap').value = '0.35';
run('drawPreview()');
assert(get('tsplPreview').textContent.includes('SIZE 4.00,0.25\r\nGAP 0.35,0'));
assert(get('tsplPreview').textContent.includes('BITMAP 108,6,1,1,0,<binary pixels: 1 bytes>'));
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
assert.equal(get('printHeight').value, '0.25');
assert.equal(run("resetButtons.get('printHeight').hidden"), true);
get('offsetX').value = '128';
run('updateResetButtons()');
assert.equal(run("resetButtons.get('offsetX').hidden"), true);
get('offsetX').value = '20';
run('updateResetButtons()');
assert.equal(run("resetButtons.get('offsetX').hidden"), false);
run("resetSetting('offsetX')");
assert.equal(get('offsetX').value, '128');
get('direction').value = '0';
run("resetSetting('direction')");
assert.equal(get('direction').value, '1');
assert.equal(JSON.parse(stored.get(run('SETTINGS_KEY'))).direction, '1');
assert.equal(run("resetButtons.has('name') || resetButtons.has('line2') || resetButtons.has('copies')"), false);
assert(run("resetButtons.get('offsetX').innerHTML").includes('<svg'));
assert.equal(run("resetButtons.get('offsetX').title"), 'Restore default');
get('name').value = 'Persisted plant';
get('line2').value = 'Persisted description';
run("setOffset('X', 106); setOffset('Y', 6)");
const saved = JSON.parse(stored.get(run('SETTINGS_KEY')));
assert.equal(saved.name, 'Persisted plant');
assert.equal(saved.line2, 'Persisted description');
assert.equal(saved.offsetX, '106');
assert.equal(saved.offsetY, '6');
assert.equal(get('offsetXIn').textContent, (106 / 203).toFixed(4));
assert.equal(get('offsetYIn').textContent, (6 / 203).toFixed(4));
assert(!/<input[^>]*id="offset[XY]In"/.test(source));
for(const id of run('SETTINGS_IDS')) get(id).value = '';
run('restoreSettings()');
for(const [id, value] of Object.entries(saved)){
  if(id === 'alignmentDot' || id === 'importedBitmap') continue;
  assert.equal(get(id).value, value);
}
stored.set(run('SETTINGS_KEY'), JSON.stringify({padX:'0.53',padY:'0.03',name:'Legacy text'}));
run('restoreSettings()');
assert.equal(get('offsetX').value, '108');
assert.equal(get('offsetY').value, '6');
assert.equal(get('name').value, 'Legacy text');
stored.set(run('SETTINGS_KEY'), JSON.stringify(saved));
run('restoreSettings()');
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
assert(get('errorMessage').textContent.includes('unavailable'));
assert.equal(get('errorMessage').hidden, false);
run("log('Imported successfully')");
assert.equal(get('errorMessage').hidden, true);
assert(!source.includes('id="settingsStatus"'));
assert(!source.includes('id="log"'));
localStorage.setItem = (key, value) => stored.set(key, value);
scope.importFixture = binaryJob;
const parsed = run('parseTSPL(importFixture)');
assert.equal(parsed.settings.offsetX, '108');
assert.equal(parsed.settings.offsetY, '6');
assert.equal(parsed.settings.printHeight, '0.28');
assert.equal(parsed.settings.direction, '1');
assert.deepEqual(Array.from(parsed.bitmap.bytes), Array.from(bitmap.bytes));
run(`{
  const parsed = parseTSPL(importFixture);
  for(const [id, value] of Object.entries(parsed.settings)) $(id).value = value;
  importedBitmap = parsed.bitmap;
  saveSettings(); drawPreview();
}`);
assert.deepEqual(Array.from(run('buildTSPL(opts())')), Array.from(binaryJob));
assert.equal(get('name').disabled, true);
assert.equal(get('clearImportBtn').hidden, false);
run('importedBitmap = null; restoreSettings(); drawPreview()');
assert.deepEqual(Array.from(run('prepareBitmap(opts()).bytes')), Array.from(bitmap.bytes));
assert.equal(get('name').disabled, true);
run('importedBitmap = null; saveSettings(); drawPreview()');
assert.equal(get('name').disabled, false);
const parse = run('parseTSPL');
const encode = text => new TextEncoder().encode(text);
assert.throws(() => parse(encode('SIZE 4,0.28\r\nCLS\r\nKILL "*"\r\nPRINT 1,1\r\n')), /Unsupported/);
assert.throws(() => parse(encode('SIZE 4,0.28\r\nCLS\r\nBITMAP 0,0,33,49,0,')), /truncated/);
assert.throws(() => parse(encode('SIZE 4,0.28\r\nCLS\r\nPRINT 1,1\r\nPRINT 1,1\r\n')), /one print job/);
assert.throws(() => parse(encode('SIZE 4,0.28\r\nDIRECTION 1,1\r\nCLS\r\nPRINT 1,1\r\n')), /Unsupported/);
assert.throws(() => parse(encode('SIZE 4,0.28\r\nCLS\r\nBITMAP 0,0,103,1,0,')), /supported range/);
const binaryPixels = new Uint8Array([13, 10, 0, 255]);
const embeddedNewlines = Buffer.concat([
  Buffer.from('SIZE 4,0.28\r\nCLS\r\nBITMAP 5,6,1,4,0,'),
  Buffer.from(binaryPixels), Buffer.from('\r\nPRINT 1,1\r\n'),
]);
assert.deepEqual(Array.from(parse(embeddedNewlines).bitmap.bytes), Array.from(binaryPixels));
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
const parseList = run('parsePlantList');
const parsedList = parseList(listText);
assert.equal(parsedList.errors.length, 0);
assert.equal(parsedList.entries.length, 22);
assert.equal(parsedList.total, 1192);
assert.equal(parsedList.entries[0].name, 'H. lacunosa ‘Silver Edge’');
assert.equal(parsedList.entries[14].copies, 160);
assert.equal(parseList('\n  H.   sp. Buntok\t64\r\n\r\nA. ‘Thai Pink’\u00a0 40 ').total, 104);
assert.equal(parseList('Plant 42\t16').entries[0].name, 'Plant 42');
assert.equal(parseList('Plant 0\nPlant -2\nPlant 1.5\nPlant 1000\nNo quantity\n32').errors.length, 6);
get('editMode').value = 'list';
get('listText').value = listText;
run('importedBitmap = {stride:2, height:1, bytes:new Uint8Array([1,2])}');
const listJobs = run('currentJobs()');
assert.equal(listJobs.length, 22);
listJobs.forEach((job, index) => {
  assert.equal(job.name, parsedList.entries[index].name);
  assert.equal(job.copies, parsedList.entries[index].copies);
  assert(new TextDecoder().decode(job.bytes).endsWith('PRINT ' + job.copies + ',1\r\n'));
  assert(new TextDecoder().decode(job.bytes).includes('BITMAP 108,6,1,1,0,'));
});
assert(draws.some(d => d.text === 'www.roothappyplants.com' && d.font.startsWith('400 ')));
run('drawPreview()');
assert.equal(run('listPreviewNodes.length'), 22);
assert(get('listSummary').textContent.includes('1,192'));
assert.equal(get('granularPreview').hidden, true);
assert.equal(get('listPreviews').hidden, false);
const firstListCanvas = run('listPreviewNodes[0]');
run("setOffset('X', 140)");
assert.equal(run('listPreviewNodes[0]'), firstListCanvas);
assert(run('currentJobs()').every(job => new TextDecoder().decode(job.bytes).includes('BITMAP 140,6,')));
run('saveSettings()');
get('editMode').value = 'granular'; get('listText').value = '';
run('restoreSettings()');
assert.equal(get('editMode').value, 'list');
assert.equal(get('listText').value, listText);
get('listText').value = 'Good plant 32\nBad row';
run('drawPreview()');
assert.equal(get('printBtn').disabled, true);
assert.equal(get('dlBtn').disabled, true);
assert.equal(get('listErrors').hidden, false);
assert.throws(() => run('currentJobs()'), /Fix the list errors/);
get('listText').value = '';
assert.throws(() => run('currentJobs()'), /Fix the list errors/);
get('editMode').value = 'granular';
run('drawPreview()');
assert.equal(get('granularPreview').hidden, false);
assert.equal(get('listPreviews').hidden, true);
assert.equal(get('modeGranularBtn').attributes['aria-pressed'], 'true');
assert.equal(get('modeListBtn').attributes['aria-pressed'], 'false');
run("setMode('list')");
assert.equal(get('modeListBtn').attributes['aria-pressed'], 'true');
assert.equal(get('modeGranularBtn').attributes['aria-pressed'], 'false');
assert.equal(JSON.parse(stored.get(run('SETTINGS_KEY'))).editMode, 'list');
run('printing = true; updatePrintControls()');
assert.equal(get('modeListBtn').disabled, true);
run("setMode('granular')");
assert.equal(get('editMode').value, 'list');
run("printing = false; setMode('granular')");
assert.equal(get('modeListBtn').disabled, false);
get('name').value = '';
get('line2').value = '';
get('offsetX').value = '128';
get('offsetY').value = '58';
run('importedBitmap = null');
get('alignmentDot').checked = false;
assert.equal(run('prepareBitmap(opts())'), null);
get('alignmentDot').checked = true;
const dot = run('prepareBitmap(opts())');
assert.equal(dot.x, 128);
assert.equal(dot.y, 58);
assert.equal(dot.height, 8);
assert.equal(dot.stride, 1);
assert.equal(dot.bytes[0], 0);
assert(dot.bytes.slice(1).every(byte => byte === 0x7f));
const sourceBytes = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
const stamped = run('stampAlignmentDot')({ x: 1, y: 2, stride: 2, height: 2, bytes: sourceBytes });
assert.equal(sourceBytes[0], 0xff);
assert.equal(stamped.bytes[0], 0);
assert.equal(stamped.bytes[1], 0);
assert.equal(stamped.bytes[2], 0x7f);
assert.equal(stamped.bytes[3], 0xff);
run('saveSettings()');
assert.equal(JSON.parse(stored.get(run('SETTINGS_KEY'))).alignmentDot, '1');
get('alignmentDot').checked = false;
run('restoreSettings()');
assert.equal(get('alignmentDot').checked, true);
get('alignmentDot').checked = false;
console.log('Passed pre-padding media settings, upright direction, cropped bitmap coordinates, empty raster and two-line font placement.');
console.log('Passed preview decoder round-trip and byte equality with the USB payload.');
console.log('Passed configurable print height, unchanged gap and physical outline, and default height fallback.');
console.log('Passed live TSPL preview and shared command serialization.');
console.log('Passed explicit bitmap offsets, unchanged pixel payload when moving, dot/inch display and legacy padding migration.');
console.log('Passed local settings round-trip, saved guide dragging, invalid saved values, corrupt JSON and blocked storage.');
console.log('Passed per-setting default visibility, numeric and select resets, local persistence and text field exclusion.');
console.log('Passed binary TSPL import/export round-trip, stored image restore, clear image and unsupported/truncated command rejection.');
console.log('Passed all 22 pasted rows / 1,192 labels, whitespace parsing, quantities, list previews, shared offsets, persistence and invalid-list blocking.');

(async () => {
  const sent = [];
  let active = 0;
  const target = { async transferOut(endpoint, bytes){
    assert.equal(endpoint, 1);
    assert.equal(active++, 0);
    await Promise.resolve();
    sent.push(bytes);
    active--;
    return {status:'ok', bytesWritten:bytes.length};
  }};
  await run('sendPrintJobs')(target, 1, listJobs, () => {});
  assert.equal(sent.length, 22);
  sent.forEach((bytes, index) => assert.equal(bytes, listJobs[index].bytes));
  let attempts = 0;
  const broken = {async transferOut(endpoint, bytes){
    attempts++;
    return {status:attempts === 2 ? 'stall' : 'ok', bytesWritten:bytes.length};
  }};
  await assert.rejects(run('sendPrintJobs')(broken, 1, listJobs, () => {}), /Stopped at batch 2/);
  assert.equal(attempts, 2);
  console.log('Passed ordered, non-overlapping batch transfers and stop-on-failure without automatic retries.');
})().catch(error => {console.error(error);process.exitCode = 1;});
