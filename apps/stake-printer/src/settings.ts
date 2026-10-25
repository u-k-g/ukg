export const SETTINGS_KEY = "ukg.stake-printer.settings.v1";

export const defaults = {
  name: "",
  line2: "",
  listLine2: "www.roothappyplants.com",
  copies: "1",
  offsetX: "128",
  offsetY: "1",
  printHeight: "0.25",
  reg: "gap",
  gap: "0.38",
  speed: "2",
  density: "1",
  direction: "1",
  editMode: "granular",
  listText: "",
};
export type Settings = typeof defaults;
export type Setting = keyof Settings;
export type Bitmap = { stride: number; height: number; bytes: Uint8Array<ArrayBuffer> };
export type SavedState = {
  settings: Settings;
  importedBitmap: Bitmap | null;
  alignmentDot: boolean;
  showOffsetGuides: boolean;
};
export const numericLimits = {
  copies: [1, 999],
  offsetX: [0, 65535],
  offsetY: [0, 65535],
  printHeight: [0.01, 90],
  gap: [0, 1],
  density: [0, 15],
} satisfies Partial<Record<Setting, [number, number]>>;
export const choices = {
  reg: [
    ["current", "Keep calibrated settings"],
    ["continuous", "Continuous"],
    ["gap", "Gap sensor"],
    ["bline", "Black mark"],
  ],
  speed: [
    ["2", "2"],
    ["3", "3"],
    ["4", "4"],
    ["5", "5"],
  ],
  direction: [
    ["1", "Direction 1 (upright on your stock)"],
    ["0", "Direction 0 (rotate 180°)"],
  ],
} satisfies Partial<Record<Setting, string[][]>>;
const textLimits: Partial<Record<Setting, number>> = { name: 40, line2: 80, listLine2: 80 };
export const resetSettings = [
  "offsetX",
  "offsetY",
  "printHeight",
  "reg",
  "gap",
  "speed",
  "density",
  "direction",
] as const;
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function initialState(): SavedState {
  return {
    settings: { ...defaults },
    importedBitmap: null,
    alignmentDot: false,
    showOffsetGuides: false,
  };
}

export function isDefault(id: Setting, value: string) {
  return id in numericLimits && value !== ""
    ? Number(value) === Number(defaults[id])
    : value === defaults[id];
}

export function decodeSettings(raw: string | null): SavedState {
  const state = initialState();
  if (!raw) return state;
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return state;
  const data = saved as Record<string, unknown>;
  for (const axis of ["X", "Y"]) {
    const legacy = data["pad" + axis];
    if (
      data["offset" + axis] === undefined &&
      typeof legacy === "string" &&
      legacy.trim() !== "" &&
      Number.isFinite(Number(legacy)) &&
      Number(legacy) >= 0
    ) {
      data["offset" + axis] = String(Math.round(Number(legacy) * 203));
    }
  }
  for (const id of Object.keys(defaults) as Setting[]) {
    const value = data[id];
    if (typeof value !== "string") continue;
    if (id === "editMode" && !["granular", "list"].includes(value)) continue;
    if (id in choices && !choices[id as keyof typeof choices].some(([option]) => option === value))
      continue;
    if (id in numericLimits && value !== "") {
      const [min, max] = numericLimits[id as keyof typeof numericLimits];
      if (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) continue;
    }
    state.settings[id] = textLimits[id] ? value.slice(0, textLimits[id]) : value;
  }
  const image = data.importedBitmap as Record<string, unknown> | undefined;
  if (
    image &&
    Number.isInteger(image.stride) &&
    Number(image.stride) >= 1 &&
    Number(image.stride) <= 102 &&
    Number.isInteger(image.height) &&
    Number(image.height) >= 1 &&
    Number(image.height) <= 4096 &&
    Array.isArray(image.bytes) &&
    image.bytes.length === Number(image.stride) * Number(image.height) &&
    image.bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    state.importedBitmap = {
      stride: Number(image.stride),
      height: Number(image.height),
      bytes: new Uint8Array(image.bytes),
    };
  }
  state.alignmentDot = data.alignmentDot === "1";
  state.showOffsetGuides = data.showOffsetGuides === "1";
  return state;
}

export function encodeSettings(state: SavedState) {
  return JSON.stringify({
    ...state.settings,
    alignmentDot: state.alignmentDot ? "1" : "0",
    showOffsetGuides: state.showOffsetGuides ? "1" : "0",
    ...(state.importedBitmap
      ? {
          importedBitmap: {
            ...state.importedBitmap,
            bytes: Array.from(state.importedBitmap.bytes),
          },
        }
      : {}),
  });
}
