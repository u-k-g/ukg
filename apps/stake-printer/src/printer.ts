import { clamp, errorMessage } from "./settings.ts";
import type { Bitmap, Settings } from "./settings.ts";

interface PrinterCore {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  result_ptr(): number;
  result_len(): number;
  preview_origin_x(): number;
  preview_origin_y(): number;
  pack_bitmap(ptr: number, width: number, height: number): number;
  crop_ink(ptr: number, width: number, height: number): number;
  stamp_dot(ptr: number, length: number, stride: number, height: number): number;
  job_parts(...args: number[]): number;
  parse_tspl(ptr: number, length: number): number;
}
declare global {
  var PRINTER_EXPORTS: PrinterCore;
}
const core = globalThis.PRINTER_EXPORTS;
if (!core) throw new Error("Printer core failed to load.");
export const TAG_W = 4,
  TAG_H = 0.625,
  LEFT_W = 0.5,
  LEFT_H = 0.53;
export const LEFT_INSET = (TAG_H - LEFT_H) / 2;
export const CV_W = 1600,
  CV_PX = 128,
  CV_PY = 90;
export const SCALE = (CV_W - 2 * CV_PX) / TAG_W;
export const CV_H = Math.ceil(CV_PY * 2 + TAG_H * SCALE);
export const ix = (v: number) => CV_PX + v * SCALE;
export const iy = (v: number) => CV_PY + v * SCALE;
const PREVIEW_ORIGIN_X = core.preview_origin_x(),
  PREVIEW_ORIGIN_Y = core.preview_origin_y();
export const printerX = (dots: number) => ix(PREVIEW_ORIGIN_X + dots / 203);
export const printerY = (dots: number) => iy(PREVIEW_ORIGIN_Y + dots / 203);
export type PrintOptions = ReturnType<typeof options>;
export type PlacedBitmap = Bitmap & { x: number; y: number };
export type ListEntry = { name: string; copies: number; line: number };
export type PrintJob = { name: string; copies: number; bytes: Uint8Array<ArrayBuffer> };

export function options(settings: Settings) {
  return {
    name: settings.name,
    line2: settings.line2,
    copies: Math.max(1, parseInt(settings.copies || "1", 10)),
    printHeight: clamp(parseFloat(settings.printHeight) || 0.25, 0.01, 90),
    reg: settings.reg,
    gap: parseFloat(settings.gap || "0") || 0,
    speed: settings.speed,
    direction: settings.direction,
    density: parseInt(settings.density || "1", 10),
    offsetX: clamp(Math.round(Number(settings.offsetX) || 0), 0, 65535),
    offsetY: clamp(Math.round(Number(settings.offsetY) || 0), 0, 65535),
  };
}
function coreBytes() {
  return new Uint8Array(core.memory.buffer, core.result_ptr(), core.result_len()).slice();
}
function withCore<T>(bytes: Uint8Array | Uint8ClampedArray, fn: (ptr: number) => T): T {
  const ptr = core.alloc(bytes.length);
  new Uint8Array(core.memory.buffer, ptr, bytes.length).set(bytes);
  try {
    return fn(ptr);
  } finally {
    core.dealloc(ptr, bytes.length);
  }
}
function readParts(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 4;
  const parts: (string | Uint8Array<ArrayBuffer>)[] = [];
  for (let i = 0; i < view.getUint32(0, true); i++) {
    const kind = view.getUint32(pos, true);
    pos += 4;
    const len = view.getUint32(pos, true);
    pos += 4;
    const slice = bytes.slice(pos, pos + len);
    pos += len;
    parts.push(kind ? slice : new TextDecoder().decode(slice));
  }
  return parts;
}
export function parsePlantList(text: string) {
  const entries: ListEntry[] = [],
    errors: { line: number; message: string }[] = [];
  text.split(/\r\n|\n|\r/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const match = /^(.*?)\s+(\d+)$/u.exec(line);
    if (!match || !match[1].trim()) {
      errors.push({
        line: index + 1,
        message: "End the line with a whole-number quantity, separated by spaces or a tab.",
      });
      return;
    }
    const copies = Number(match[2]);
    if (!Number.isSafeInteger(copies) || copies < 1 || copies > 999) {
      errors.push({ line: index + 1, message: "Quantity must be between 1 and 999." });
      return;
    }
    entries.push({ name: match[1].trim().replace(/\s+/gu, " "), copies, line: index + 1 });
  });
  return { entries, errors, total: entries.reduce((sum, entry) => sum + entry.copies, 0) };
}
export function listOptions(base: PrintOptions, entry: ListEntry, subtext: string): PrintOptions {
  return { ...base, name: entry.name, line2: subtext, copies: entry.copies };
}
export function renderLabel(o: PrintOptions) {
  const raster = document.createElement("canvas"),
    dpi = 203;
  raster.width = Math.round(TAG_W * dpi);
  raster.height = Math.round(TAG_H * dpi);
  const ctx = raster.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, raster.width, raster.height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";
  const fontSize = (8 * dpi) / 72,
    lineHeight = Math.round(fontSize * 1.25);
  ctx.font = "700 " + fontSize + "px Arial";
  ctx.fillText(o.name, 0, 0);
  ctx.font = "400 " + fontSize + "px Arial";
  ctx.fillText(o.line2, 0, lineHeight);
  return raster;
}
export function packBitmap(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number) {
  withCore(pixels, (ptr) => core.pack_bitmap(ptr, width, height));
  return coreBytes();
}
export function cropToInk(pixels: Uint8Array | Uint8ClampedArray, width: number, height: number) {
  if (withCore(pixels, (ptr) => core.crop_ink(ptr, width, height)) === 2) return null;
  const bytes = coreBytes(),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    x: view.getUint32(0, true),
    y: view.getUint32(4, true),
    width: view.getUint32(8, true),
    height: view.getUint32(12, true),
    pixels: bytes.slice(16),
  };
}
export function stampAlignmentDot(bitmap: PlacedBitmap): PlacedBitmap {
  withCore(bitmap.bytes, (ptr) =>
    core.stamp_dot(ptr, bitmap.bytes.length, bitmap.stride, bitmap.height),
  );
  return { ...bitmap, bytes: coreBytes() };
}
export function prepareBitmap(
  o: PrintOptions,
  imported: Bitmap | null = null,
  alignment = false,
): PlacedBitmap | null {
  if (imported) {
    const placed = { ...imported, x: o.offsetX, y: o.offsetY };
    return alignment ? stampAlignmentDot(placed) : placed;
  }
  const empty = () =>
    alignment
      ? stampAlignmentDot({
          x: o.offsetX,
          y: o.offsetY,
          stride: 1,
          height: 8,
          bytes: new Uint8Array(8).fill(255),
        })
      : null;
  if (!o.name && !o.line2) return empty();
  const raster = renderLabel(o);
  const pixels = raster.getContext("2d")!.getImageData(0, 0, raster.width, raster.height).data;
  const ink = cropToInk(pixels, raster.width, raster.height);
  if (!ink) return empty();
  const bitmap = {
    x: o.offsetX,
    y: o.offsetY,
    stride: Math.ceil(ink.width / 8),
    height: ink.height,
    bytes: packBitmap(ink.pixels, ink.width, ink.height),
  };
  return alignment ? stampAlignmentDot(bitmap) : bitmap;
}
export function unpackBitmap(bitmap: Bitmap) {
  const width = bitmap.stride * 8,
    pixels = new Uint8Array(width * bitmap.height * 4);
  for (let y = 0; y < bitmap.height; y++)
    for (let x = 0; x < width; x++) {
      const white = (bitmap.bytes[y * bitmap.stride + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
      const i = (y * width + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = white ? 255 : 0;
      pixels[i + 3] = 255;
    }
  return pixels;
}
export function bitmapCanvas(bitmap: Bitmap) {
  const raster = document.createElement("canvas");
  raster.width = bitmap.stride * 8;
  raster.height = bitmap.height;
  const ctx = raster.getContext("2d")!,
    image = ctx.getImageData(0, 0, raster.width, raster.height);
  image.data.set(unpackBitmap(bitmap));
  for (let i = 0; i < image.data.length; i += 4)
    if (image.data[i] === 255) {
      image.data[i + 1] = 254;
      image.data[i + 2] = 251;
    }
  ctx.putImageData(image, 0, 0);
  return raster;
}
export function jobParts(o: PrintOptions, bitmap: PlacedBitmap | null) {
  const reg = o.reg === "gap" ? 1 : o.reg === "bline" ? 2 : o.reg === "continuous" ? 3 : 0;
  const pixels = bitmap ? bitmap.bytes : new Uint8Array();
  withCore(pixels, (ptr) =>
    core.job_parts(
      o.printHeight,
      o.gap,
      o.copies,
      o.density,
      Number(o.direction),
      Number(o.speed),
      reg,
      bitmap ? bitmap.x : 0,
      bitmap ? bitmap.y : 0,
      bitmap ? bitmap.stride : 0,
      bitmap ? bitmap.height : 0,
      bitmap ? ptr : 0,
      pixels.length,
    ),
  );
  return readParts(coreBytes());
}
export function buildTSPL(o: PrintOptions, bitmap = prepareBitmap(o)) {
  const encoder = new TextEncoder(),
    parts = jobParts(o, bitmap).map((part) =>
      typeof part === "string" ? encoder.encode(part) : part,
    );
  const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
export function currentJobs(
  settings: Settings,
  imported: Bitmap | null,
  alignment: boolean,
): PrintJob[] {
  const base = options(settings);
  if (settings.editMode !== "list")
    return [
      {
        name: base.name,
        copies: base.copies,
        bytes: buildTSPL(base, prepareBitmap(base, imported, alignment)),
      },
    ];
  const parsed = parsePlantList(settings.listText);
  if (parsed.errors.length || !parsed.entries.length)
    throw new Error("Fix the list errors before printing or downloading.");
  return parsed.entries.map((entry) => {
    const o = listOptions(base, entry, settings.listLine2);
    return {
      name: o.name,
      copies: o.copies,
      bytes: buildTSPL(o, prepareBitmap(o, null, alignment)),
    };
  });
}
export async function sendPrintJobs(
  target: Pick<USBDevice, "transferOut">,
  endpoint: number,
  jobs: PrintJob[],
  progress: (index: number, job: PrintJob) => void,
) {
  for (let index = 0; index < jobs.length; index++) {
    progress(index, jobs[index]);
    try {
      const bytes = jobs[index].bytes,
        result = await target.transferOut(endpoint, bytes);
      if (result.status !== "ok" || result.bytesWritten !== bytes.length)
        throw new Error("USB transfer incomplete");
    } catch (error) {
      throw new Error(
        "Stopped at batch " +
          (index + 1) +
          " of " +
          jobs.length +
          ": " +
          errorMessage(error) +
          ". Earlier batches were sent. This batch may be partially sent; do not retry the whole list blindly.",
      );
    }
  }
}
export function parseTSPL(bytes: Uint8Array): {
  settings: Partial<Settings>;
  bitmap: Bitmap | null;
} {
  const code = withCore(bytes, (ptr) => core.parse_tspl(ptr, bytes.length));
  if (code === 1) throw new Error(new TextDecoder().decode(coreBytes()));
  const raw = coreBytes(),
    view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let pos = 0;
  const flags = view.getUint32(pos, true);
  pos += 4;
  const reg = raw[pos++],
    speed = raw[pos++];
  const copies = view.getUint16(pos, true);
  pos += 2;
  const density = view.getUint16(pos, true);
  pos += 2;
  const printHeight = view.getFloat64(pos, true);
  pos += 8;
  const gap = view.getFloat64(pos, true);
  pos += 8;
  const direction = raw[pos++];
  const settings: Partial<Settings> = { name: "", line2: "", reg: "current" };
  if (flags & 1) settings.printHeight = String(printHeight);
  if (flags & 2) {
    settings.gap = String(gap);
    settings.reg = reg === 2 ? "bline" : reg === 3 ? "continuous" : "gap";
  }
  if (flags & 4) settings.copies = String(copies);
  if (flags & 8) settings.speed = String(speed);
  if (flags & 16) settings.density = String(density);
  if (flags & 32) settings.direction = String(direction);
  if (flags & 64) {
    const x = view.getUint32(pos, true);
    pos += 4;
    const y = view.getUint32(pos, true);
    pos += 4;
    const stride = view.getUint32(pos, true);
    pos += 4;
    const height = view.getUint32(pos, true);
    pos += 4;
    const length = view.getUint32(pos, true);
    pos += 4;
    settings.offsetX = String(x);
    settings.offsetY = String(y);
    return { settings, bitmap: { stride, height, bytes: raw.slice(pos, pos + length) } };
  }
  return { settings, bitmap: null };
}
function tagPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(ix(0), iy(LEFT_INSET));
  ctx.lineTo(ix(LEFT_W), iy(LEFT_INSET));
  ctx.lineTo(ix(LEFT_W), iy(0));
  ctx.lineTo(ix(TAG_W), iy(0));
  ctx.lineTo(ix(TAG_W), iy(TAG_H));
  ctx.lineTo(ix(LEFT_W), iy(TAG_H));
  ctx.lineTo(ix(LEFT_W), iy(TAG_H - LEFT_INSET));
  ctx.lineTo(ix(0), iy(TAG_H - LEFT_INSET));
  ctx.closePath();
}
export function applyPreviewOrientation(
  ctx: CanvasRenderingContext2D,
  o: Pick<PrintOptions, "direction">,
) {
  if (Number(o.direction) === 0) {
    ctx.translate(ix(0) + ix(TAG_W), iy(0) + iy(TAG_H));
    ctx.scale(-1, -1);
  }
}
export function offsetSegments(o: PrintOptions) {
  const x = printerX(o.offsetX),
    y = printerY(o.offsetY);
  return [
    { axis: "y" as const, x1: printerX(0), y1: printerY(0), x2: printerX(0), y2: y },
    { axis: "x" as const, x1: printerX(0), y1: y, x2: x, y2: y },
  ];
}
export function drawTag(
  c: HTMLCanvasElement,
  o: PrintOptions,
  bitmap: PlacedBitmap | null,
  guides: boolean,
  image = bitmap ? bitmapCanvas(bitmap) : null,
) {
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, CV_W, CV_H);
  ctx.lineJoin = "miter";
  tagPath(ctx);
  ctx.fillStyle = "#FFFEFB";
  ctx.fill();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  tagPath(ctx);
  ctx.clip();
  applyPreviewOrientation(ctx, o);
  if (image && bitmap) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      image,
      printerX(bitmap.x),
      printerY(bitmap.y),
      (image.width * SCALE) / 203,
      (image.height * SCALE) / 203,
    );
  }
  ctx.restore();
  if (!guides) return;
  ctx.save();
  applyPreviewOrientation(ctx, o);
  ctx.beginPath();
  ctx.rect(
    printerX(0) - 2,
    printerY(0) - 2,
    ix(TAG_W) - printerX(0) + 4,
    iy(TAG_H) - printerY(0) + 4,
  );
  ctx.clip();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#000000";
  for (const segment of offsetSegments(o)) {
    ctx.beginPath();
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(segment.x2, segment.y2);
    ctx.stroke();
  }
  ctx.restore();
}
export function canvasPos(
  e: Pick<PointerEvent, "clientX" | "clientY">,
  target: HTMLCanvasElement,
  o: PrintOptions,
) {
  const r = target.getBoundingClientRect();
  const x = (e.clientX - r.left) * (CV_W / r.width),
    y = (e.clientY - r.top) * (CV_H / r.height);
  return Number(o.direction) === 0
    ? { x: ix(0) + ix(TAG_W) - x, y: iy(0) + iy(TAG_H) - y }
    : { x, y };
}
export function hitAxis(x: number, y: number, width: number, o: PrintOptions, guides: boolean) {
  if (!guides || x < printerX(0) || x > ix(TAG_W) || y < printerY(0) || y > iy(TAG_H)) return null;
  let nearest: "x" | "y" | null = null,
    distance = (12 * CV_W) / width;
  for (const segment of offsetSegments(o)) {
    const px = clamp(x, segment.x1, segment.x2),
      py = clamp(y, segment.y1, segment.y2),
      d = Math.hypot(x - px, y - py);
    if (d < distance) {
      nearest = segment.axis;
      distance = d;
    }
  }
  return nearest;
}
