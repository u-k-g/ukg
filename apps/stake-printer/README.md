# Stake printer

SolidJS and TypeScript TSC TTP-247 pot-stake label editor. Vite builds static
assets for Cloudflare. Sends binary TSPL over WebUSB in Chrome or Edge, without
a Windows driver or backend. The Rust printer core builds to WASM.

## Run locally

Requires Node 24 LTS, pnpm, Rust stable and the `wasm32-unknown-unknown` target.
Run `pnpm install --frozen-lockfile` from the repo root first.

```sh
cd apps/stake-printer
pnpm dev
```

Open http://localhost:8000 in Chrome or Edge, then click Connect printer.
Vite binds only to the loopback interface and reloads frontend edits.
Restart `pnpm dev` after editing Rust to rebuild WASM.

```sh
pnpm test
pnpm build
pnpm preview
```

The production preview runs at http://localhost:8001 and supports offline
reloads after its service worker finishes installing. Service worker registration
is disabled in Vite development mode. The production build retains the older
`/stake-printer.html` URL.

`src/App.tsx` owns reactive settings, connection state and actions. `Preview.tsx`
renders canvas previews; `printer.ts` handles rasterization and the WASM bridge;
`settings.ts` defines defaults and validates saved settings. Existing browser
settings keep the same localStorage key.

## Printing

- Single mode edits one label's two text lines and copy count.
- List mode takes one plant name and a trailing quantity per line, separated by
  spaces or tabs. Blank lines are ignored. Names retain Unicode punctuation;
  quantities must be whole numbers from 1 to 999. Invalid rows block printing
  and downloading rather than being silently omitted.
- Every list row gets a tag preview and quantity. List labels share an editable
  subtext field, defaulting to `www.roothappyplants.com`, and the shared offsets and printer
  settings. Sent bitmap and TSPL detail panels are hidden in list mode.
- Print sends one bitmap job per row, in pasted order, with that row's quantity.
  Jobs are snapshotted before sending, USB writes run sequentially, and a failed
  transfer stops the batch without automatic retry. USB success means bytes
  were accepted, not confirmation that every physical tag has printed.
- Download list TSPL bundles those jobs into one file. The importer currently
  accepts single-label files only, not multi-job list bundles.
- The mode and pasted list persist locally alongside the other form values.
- Alignment angle paints the bitmap's top row and left column black. Their
  corner is the bitmap origin.
- USB vendor `0x1203`, product `0x0126`.
- Two empty text lines, Arial Bold and Arial Regular at 8 pt.
- Browser rasterization, monochrome packing and TSPL BITMAP output.
- Import TSPL restores supported commands and the binary bitmap from this app's
  exports, without printing anything. Imported images persist locally and can be
  repositioned. Text fields are disabled until Clear imported bitmap is clicked;
  pixel data cannot recover editable text. Imports accept one job, one overwrite
  bitmap, files up to 1 MB, and only commands represented by this app's controls.
  Unknown commands are rejected, not forwarded to the printer.
- Advanced settings toggles draggable X/Y offset lines in all tag previews.
  Lines default to hidden and never change the printed bitmap.
- X/Y are explicit BITMAP coordinates in whole dots, with read-only inch
  equivalents at 203 dpi. The bitmap is cropped before positioning; font
  bearings do not add to X/Y. Offsets do not create mirrored margins or clip
  the bitmap. The physical outline clips only the positioned preview.
- Text and all form settings persist in browser localStorage, including guide
  dragging. Previously saved padding values migrate to offsets. They restore on
  refresh and are not stored server-side. Storage is
  specific to the browser profile and origin, including the port. Clearing site
  data removes saved settings; private browsing may discard them when closed.
- Print defaults are SIZE 4.00,0.25, GAP 0.38,0, bitmap offsets X 128
  and Y 1 dot, and DIRECTION 1,0.
- Advanced settings includes Print height (in), default 0.25, to change the
  TSPL SIZE height independently of the physical preview. The gap is separate;
  changing the print height can change feed spacing.

The physical preview is 4 by 0.625 inches, with the leftmost 0.5 inches reduced
to a vertically centered 0.53 inches tall, leaving 0.0475 inches above and below.
The print page and physical preview heights differ. The
bitmap is cropped to ink bounds. Preview registration comes from one printed
alignment square at X 128, Y 0: its top-left was 0.57 in from the left edge
and 0.1745 in from the top edge. Tests verify that mapping, not a new hardware
measurement.

The production build precaches its HTML, JavaScript, CSS and embedded WASM.
Later visits work offline at the same origin. WebUSB requires HTTPS or localhost;
opening the HTML file directly cannot reach the printer.
Bitmap packing, TSPL jobs, and the preview origin live in `printer-core` and
run in the browser as WebAssembly.

## Cloudflare deployment

The root `alchemy.run.ts` deploys this app as the `ukg-ttp` static Worker,
separate from the main website. Every deployment attaches `ttp.ukg.one` without
requiring `ATTACH_PRODUCTION_DOMAIN`. The existing Cloudflare account/token and Alchemy state secrets
are shared with the main site's deployment. The token needs permission to
deploy Workers and attach custom domains in the `ukg.one` zone.

`pnpm build` compiles the Rust core, bundles the Solid app with Vite and writes
the deployable files to `dist/`. The service worker precaches every emitted asset
and gets a content-based version on each build.
Builds require Node 24 LTS, Rust's stable toolchain, and its
`wasm32-unknown-unknown` target. CI installs Node and Rust before running the
printer checks and the existing Alchemy deployment. Deployment runs on pushes
to `master` or through the workflow's manual trigger.

Open `https://ttp.ukg.one` directly in Chrome or Edge, not in an embedded frame.
Settings and USB permissions are separate from localhost. All text rendering,
job generation and USB transfers stay in the browser. After the service worker
finishes caching the first visit, the site can reload without the server.

Label text uses locally
available Arial and does not upload text to a rendering service.
