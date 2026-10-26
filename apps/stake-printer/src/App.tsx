import {
  For,
  Show,
  batch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";
import {
  choices,
  clamp,
  decodeSettings,
  defaults,
  encodeSettings,
  errorMessage,
  initialState,
  isDefault,
  numericLimits,
  resetSettings,
  SETTINGS_KEY,
} from "./settings.ts";
import type { Bitmap, Setting } from "./settings.ts";
import {
  currentJobs,
  jobParts,
  listOptions,
  options,
  parsePlantList,
  parseTSPL,
  prepareBitmap,
  sendPrintJobs,
} from "./printer.ts";
import { Preview, WireBitmap } from "./Preview.tsx";

function Icon(props: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={props.path} />
    </svg>
  );
}

export default function App() {
  let restoreError = "";
  let restored = initialState();
  try {
    restored = decodeSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    restoreError = "Could not restore saved settings. Using defaults.";
  }
  const [settings, setSettings] = createStore(restored.settings);
  const [importedBitmap, setImportedBitmap] = createSignal<Bitmap | null>(restored.importedBitmap);
  const [alignmentDot, setAlignmentDot] = createSignal(restored.alignmentDot);
  const [showOffsetGuides, setShowOffsetGuides] = createSignal(restored.showOffsetGuides);
  const [connection, setConnection] = createSignal<{ device: USBDevice; endpoint: number } | null>(
    null,
  );
  const [connecting, setConnecting] = createSignal(false);
  const [printing, setPrinting] = createSignal(false);
  const [error, setError] = createSignal(restoreError, { equals: false });
  const [progress, setProgress] = createSignal("", { equals: false });
  for (const [message, dismiss] of [
    [error, setError],
    [progress, setProgress],
  ] as const) {
    createEffect(() => {
      if (!message()) return;
      const timeout = setTimeout(() => dismiss(""), 10_000);
      onCleanup(() => clearTimeout(timeout));
    });
  }
  const [menuOpen, setMenuOpen] = createSignal(false);
  let menu!: HTMLElement, fileInput!: HTMLInputElement;
  const list = () => settings.editMode === "list";
  const parsed = createMemo(() => parsePlantList(settings.listText));
  const opts = createMemo(() => options(settings));
  const invalid = () => list() && (!parsed().entries.length || parsed().errors.length > 0);
  const busy = () => printing() || connecting();
  const singleBitmap = createMemo(() =>
    list() ? null : prepareBitmap(opts(), importedBitmap(), alignmentDot()),
  );
  const tspl = createMemo(() =>
    list()
      ? ""
      : jobParts(opts(), singleBitmap())
          .map((part) =>
            typeof part === "string" ? part : "<binary pixels: " + part.length + " bytes>",
          )
          .join(""),
  );
  const listSummary = () =>
    parsed().entries.length
      ? parsed().entries.length +
        " batches · " +
        parsed().total.toLocaleString() +
        " labels" +
        (parsed().errors.length
          ? " · fix " + parsed().errors.length + " invalid rows before printing"
          : "")
      : parsed().errors.length
        ? "No valid rows. Fix the errors below."
        : "Paste a list to preview the labels.";

  createEffect(() => {
    const saved = encodeSettings({
      settings: { ...settings },
      importedBitmap: importedBitmap(),
      alignmentDot: alignmentDot(),
      showOffsetGuides: showOffsetGuides(),
    });
    try {
      localStorage.setItem(SETTINGS_KEY, saved);
    } catch {
      setError("Browser storage is unavailable. Changes will not survive refresh.");
    }
  });

  const update = (id: Setting, value: string) => setSettings(id, value);
  const setOffset = (axis: "x" | "y", dots: number) =>
    update(axis === "x" ? "offsetX" : "offsetY", String(clamp(Math.round(dots), 0, 65535)));
  const setMode = (mode: "granular" | "list") => {
    if (!printing()) update("editMode", mode);
  };

  async function attach(device: USBDevice) {
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);
    const iface = device.configuration!.interfaces.find((iface) =>
      iface.alternates.some((alt) =>
        alt.endpoints.some((ep) => ep.direction === "out" && ep.type === "bulk"),
      ),
    );
    const alt = iface?.alternates.find((alt) =>
      alt.endpoints.some((ep) => ep.direction === "out" && ep.type === "bulk"),
    );
    const endpoint = alt?.endpoints.find((ep) => ep.direction === "out" && ep.type === "bulk");
    if (!iface || !alt || !endpoint) throw new Error("no bulk OUT endpoint");
    await device.claimInterface(iface.interfaceNumber);
    if (iface.alternate.alternateSetting !== alt.alternateSetting)
      await device.selectAlternateInterface(iface.interfaceNumber, alt.alternateSetting);
    setConnection({ device, endpoint: endpoint.endpointNumber });
    setError("");
  }
  async function connect() {
    const current = connection();
    if (current) {
      setConnection(null);
      try {
        await current.device.close();
      } catch (error) {
        setError("Disconnect failed: " + errorMessage(error));
      }
      return;
    }
    if (!navigator.usb) {
      setError(
        "WebUSB is not available here. Open this in Chrome or Edge, over https or localhost.",
      );
      return;
    }
    setConnecting(true);
    try {
      await attach(
        await navigator.usb.requestDevice({ filters: [{ vendorId: 0x1203, productId: 0x0126 }] }),
      );
    } catch (error) {
      setError("Connect failed: " + errorMessage(error));
    } finally {
      setConnecting(false);
    }
  }
  async function print() {
    if (busy()) return;
    const target = connection();
    if (!target) {
      await connect();
      return;
    }
    try {
      const jobs = currentJobs(settings, importedBitmap(), alignmentDot());
      batch(() => {
        setPrinting(true);
        setError("");
      });
      await sendPrintJobs(target.device, target.endpoint, jobs, (index, job) => {
        setProgress(
          "Sending batch " +
            (index + 1) +
            " of " +
            jobs.length +
            " · " +
            job.name +
            " · " +
            job.copies +
            " labels",
        );
      });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      batch(() => {
        setPrinting(false);
        setProgress("");
      });
    }
  }
  function download() {
    menu.hidePopover();
    try {
      const jobs = currentJobs(settings, importedBitmap(), alignmentDot());
      const url = URL.createObjectURL(
        new Blob(
          jobs.map((job) => job.bytes),
          { type: "application/octet-stream" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = list() ? "labels.tspl" : "label.tspl";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("TSPL file exceeds 1 MB.");
      const parsed = parseTSPL(new Uint8Array(await file.arrayBuffer()));
      batch(() => {
        setSettings(parsed.settings);
        setSettings("editMode", "granular");
        setImportedBitmap(parsed.bitmap);
        setError("");
      });
    } catch (error) {
      setError("Import failed: " + errorMessage(error));
    }
    fileInput.value = "";
  }
  onMount(() => {
    if (!navigator.usb) return;
    const disconnected = (event: USBConnectionEvent) => {
      if (connection()?.device === event.device) {
        setConnection(null);
        setError("Printer disconnected.");
      }
    };
    navigator.usb.addEventListener("disconnect", disconnected);
    let disposed = false;
    void (async () => {
      setConnecting(true);
      try {
        const devices = await navigator.usb.getDevices();
        const device = devices.find(
          (device) => device.vendorId === 0x1203 && device.productId === 0x0126,
        );
        if (device && !disposed) await attach(device);
      } catch {
        /* Previously granted printers may be unplugged or busy. */
      } finally {
        if (!disposed) setConnecting(false);
      }
    })();
    onCleanup(() => {
      disposed = true;
      navigator.usb.removeEventListener("disconnect", disconnected);
    });
  });

  function Field(props: {
    id: Setting;
    label: string;
    type?: "text" | "number";
    step?: string;
    disabled?: boolean;
    offset?: boolean;
  }) {
    let input!: HTMLInputElement | HTMLSelectElement;
    const selectChoices = () =>
      props.id in choices ? choices[props.id as keyof typeof choices] : null;
    const limits = () =>
      props.id in numericLimits ? numericLimits[props.id as keyof typeof numericLimits] : null;
    const resettable = () => resetSettings.some((id) => id === props.id);
    const label = () => <label for={props.id}>{props.label}</label>;
    const control = () => (
      <Show
        when={selectChoices()}
        fallback={
          <input
            ref={(element) => {
              input = element;
            }}
            id={props.id}
            type={props.type ?? "text"}
            value={settings[props.id]}
            min={limits()?.[0]}
            max={limits()?.[1]}
            step={props.step}
            disabled={props.disabled}
            maxLength={props.id === "name" ? 40 : props.type === "number" ? undefined : 80}
            autocomplete="off"
            aria-describedby={props.offset ? props.id + "Units" : undefined}
            onInput={(event) => update(props.id, event.currentTarget.value)}
          />
        }
      >
        {(items) => (
          <select
            ref={(element) => {
              input = element;
            }}
            id={props.id}
            value={settings[props.id]}
            disabled={props.disabled}
            onChange={(event) => update(props.id, event.currentTarget.value)}
          >
            <For each={items()}>{([value, text]) => <option value={value}>{text}</option>}</For>
          </select>
        )}
      </Show>
    );
    return (
      <div class="field">
        <Show when={resettable()} fallback={label()}>
          <div class="setting-label">
            {label()}
            <button
              class="reset-setting"
              type="button"
              title="Restore default"
              aria-label={"Restore default for " + props.label}
              hidden={isDefault(props.id, settings[props.id])}
              onClick={() => {
                update(props.id, defaults[props.id]);
                input.focus();
              }}
            >
              <Icon path="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6" />
            </button>
          </div>
        </Show>
        <Show when={props.offset} fallback={control()}>
          <div class="offset-value">
            {control()}
            <span id={props.id + "Units"}>
              dots (
              <output id={props.id + "In"} for={props.id}>
                {(Number(settings[props.id]) / 203).toFixed(4)}
              </output>{" "}
              in)
            </span>
          </div>
        </Show>
      </div>
    );
  }
  function BatchPreview(props: { entry: ReturnType<typeof parsePlantList>["entries"][number] }) {
    const o = createMemo(() => listOptions(opts(), props.entry, settings.listLine2));
    const bitmap = createMemo(() => prepareBitmap(o(), null, alignmentDot()));
    return (
      <article class="batch-preview">
        <div class="batch-heading">
          <h3>{props.entry.name}</h3>
          <span class="batch-quantity">{props.entry.copies} labels</span>
        </div>
        <Preview
          label={props.entry.name + ", " + props.entry.copies + " labels"}
          options={o()}
          bitmap={bitmap()}
          guides={showOffsetGuides()}
          onOffset={setOffset}
        />
      </article>
    );
  }

  return (
    <div class="app">
      <div class="toasts" aria-label="Notifications">
        <Show when={error()}>
          <div id="errorMessage" class="toast" role="alert">
            <span>{error()}</span>
            <button
              class="toast-dismiss"
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setError("")}
            >
              <Icon path="M6 6l12 12M18 6 6 18" />
            </button>
          </div>
        </Show>
        <Show when={progress()}>
          <div id="printProgress" class="toast" role="status">
            {progress()}
          </div>
        </Show>
      </div>
      <header class="toolbar" aria-label="Printer toolbar">
        <h1>
          <button
            id="appMenuBtn"
            class="app-menu-trigger"
            type="button"
            popovertarget="appMenu"
            aria-expanded={menuOpen()}
            aria-controls="appMenu"
          >
            ttp
            <span id="connectionDot" data-connected={Boolean(connection())}>
              .
            </span>
          </button>
        </h1>
        <div class="mode-switch" role="group" aria-label="Editing mode">
          <button
            id="modeGranularBtn"
            class="mode-button"
            type="button"
            aria-pressed={!list()}
            disabled={printing()}
            onClick={() => setMode("granular")}
          >
            Single
          </button>
          <button
            id="modeListBtn"
            class="mode-button"
            type="button"
            aria-pressed={list()}
            disabled={printing()}
            onClick={() => setMode("list")}
          >
            List
          </button>
        </div>
        <div class="toolbar-actions">
          <button id="printBtn" type="button" disabled={busy() || invalid()} onClick={print}>
            Print
          </button>
        </div>
      </header>
      <nav
        ref={(element) => {
          menu = element;
        }}
        id="appMenu"
        class="app-menu"
        popover="auto"
        aria-label="File and printer"
        onToggle={(event) => setMenuOpen(event.newState === "open")}
      >
        <button
          id="importBtn"
          class="menu-item"
          type="button"
          disabled={busy()}
          onClick={() => {
            menu.hidePopover();
            fileInput.click();
          }}
        >
          <Icon path="M12 15V3m-5 5 5-5 5 5M4 16v4h16v-4" />
          Import TSPL
        </button>
        <button
          id="dlBtn"
          class="menu-item"
          type="button"
          disabled={printing() || invalid()}
          aria-label={list() ? "Export list TSPL" : "Export TSPL"}
          title={list() ? "Export list TSPL" : "Export TSPL"}
          onClick={download}
        >
          <Icon path="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />
          Export TSPL
        </button>
        <button id="connectBtn" class="menu-item" type="button" disabled={busy()} onClick={connect}>
          <Icon path="M7 8V3m10 5V3M5 8h14v3a7 7 0 0 1-7 7v3m0-3a7 7 0 0 1-7-7" />
          <span id="connectLabel">{connection() ? "Disconnect printer" : "Connect printer"}</span>
        </button>
      </nav>
      <main class="sheet">
        <div class="workspace">
          <form class="form" onSubmit={(event) => event.preventDefault()}>
            <div id="granularInputs" class="granular-inputs" hidden={list()}>
              <Field id="name" label="Text" disabled={Boolean(importedBitmap())} />
              <Field id="line2" label="Subtext" disabled={Boolean(importedBitmap())} />
              <div class="row2">
                <Field id="copies" label="Copies" type="number" />
              </div>
            </div>
            <div id="listInputs" hidden={!list()}>
              <label for="listText">Plant names and quantities</label>
              <textarea
                id="listText"
                spellcheck={false}
                aria-describedby="listSummary"
                value={settings.listText}
                disabled={printing()}
                onInput={(event) => update("listText", event.currentTarget.value)}
              />
              <p id="listSummary" class="hint" role="status">
                {listSummary()}
              </p>
              <ul id="listErrors" class="list-errors" hidden={!parsed().errors.length}>
                <For each={parsed().errors}>
                  {(error) => (
                    <li>
                      Line {error.line}: {error.message}
                    </li>
                  )}
                </For>
              </ul>
              <Field id="listLine2" label="Subtext" />
            </div>
            <div>
              <div class="row2">
                <Field id="offsetX" label="X offset" type="number" step="1" offset />
              </div>
              <div class="row2" style={{ "margin-top": "12px" }}>
                <Field id="offsetY" label="Y offset" type="number" step="1" offset />
              </div>
            </div>
            <div class="actions">
              <input
                ref={(element) => {
                  fileInput = element;
                }}
                id="importFile"
                type="file"
                accept=".tspl,.tsplk,.prn,.bin,application/octet-stream"
                hidden
                onChange={(event) => importFile(event.currentTarget.files?.[0])}
              />
              <button
                id="clearImportBtn"
                class="btn-secondary"
                type="button"
                hidden={list() || !importedBitmap()}
                disabled={printing()}
                onClick={() => setImportedBitmap(null)}
              >
                Clear imported bitmap
              </button>
            </div>
            <p id="importStatus" class="hint" hidden={list() || !importedBitmap()}>
              Imported bitmap. Text cannot be recovered from pixels. Clear it to edit text.
            </p>
            <details>
              <summary>Advanced settings</summary>
              <div class="adv">
                <Field id="printHeight" label="Print height (in)" type="number" step="0.001" />
                <Field id="reg" label="Registration" />
                <Field id="speed" label="Speed (ips)" />
                <Field id="gap" label="Gap (in)" type="number" step="0.001" />
                <Field id="direction" label="Print orientation" />
                <Field id="density" label="Density (0–15)" type="number" />
              </div>
              <label class="check">
                <input
                  id="alignmentDot"
                  type="checkbox"
                  checked={alignmentDot()}
                  onChange={(event) => setAlignmentDot(event.currentTarget.checked)}
                />
                Alignment angle
              </label>
              <label class="check">
                <input
                  id="showOffsetGuides"
                  type="checkbox"
                  checked={showOffsetGuides()}
                  onChange={(event) => setShowOffsetGuides(event.currentTarget.checked)}
                />
                Show offset lines
              </label>
            </details>
          </form>
          <section class="canvas" aria-label="Label preview">
            <div class="canvas-head">
              <h2>Preview</h2>
            </div>
            <div id="granularPreview" hidden={list()}>
              <Preview
                id="preview"
                label="Stake label showing the left cut-out and bitmap offset guides"
                options={opts()}
                bitmap={singleBitmap()}
                guides={showOffsetGuides()}
                onOffset={setOffset}
              />
              <div class="bitmap-view">
                <h3>Bitmap</h3>
                <div class="bitmap-scroll">
                  <WireBitmap bitmap={singleBitmap()} />
                </div>
              </div>
              <div class="tspl-view">
                <h3>TSPL</h3>
                <pre id="tsplPreview" aria-label="Current TSPL print commands">
                  {tspl()}
                </pre>
              </div>
            </div>
            <div id="listPreviews" hidden={!list()} aria-label="Parsed label previews">
              <Show when={list()}>
                <For
                  each={parsed().entries}
                  fallback={<p class="hint">Your parsed labels will appear here.</p>}
                >
                  {(entry) => <BatchPreview entry={entry} />}
                </For>
              </Show>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
