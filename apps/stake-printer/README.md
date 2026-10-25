# Stake printer

Static TSC TTP-247 pot-stake label editor. Sends binary TSPL over WebUSB in
Chrome or Edge. No Windows driver or backend. The Rust printer core builds to WASM.

## Run locally

Requires Node 24 LTS, pnpm, Rust stable and the `wasm32-unknown-unknown` target.
Run `pnpm install --frozen-lockfile` from the repo root first.

```sh
cd apps/stake-printer
pnpm dev
```

Open http://localhost:8000 in Chrome or Edge, then click Connect printer.
The server binds only to the loopback interface and disables HTML caching.
The older `/stake-printer.html` URL also works.

```sh
pnpm test
```

## Printing

- Single mode edits one label's two text lines and copy count.
- List mode takes one plant name and a trailing quantity per line, separated by
  spaces or tabs. Blank lines are ignored. Names retain Unicode punctuation;
  quantities must be whole numbers from 1 to 999. Invalid rows block printing
  and downloading rather than being silently omitted.
- Every list row gets a tag preview and quantity. List labels use the fixed
  second line `www.roothappyplants.com` and the shared offsets and printer
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
- Draggable bitmap X/Y offset guides and a shaped physical-tag preview.
- X/Y are explicit BITMAP coordinates in whole dots, with editable inch
  equivalents at 203 dpi. The bitmap is cropped before positioning; font
  bearings do not add to X/Y. Offsets do not create mirrored margins or clip
  the bitmap. The physical outline clips only the positioned preview.
- Text and all form settings persist in browser localStorage, including guide
  dragging. Previously saved padding values migrate to offsets. They restore on
  refresh and are not stored server-side. Storage is
  specific to the browser profile and origin, including the port. Clearing site
  data removes saved settings; private browsing may discard them when closed.
- Print defaults are SIZE 4.00,0.25, GAP 0.38,0, bitmap offsets X 128
  and Y 0 dots, and DIRECTION 1,0.
- Printer settings includes Print height (in), default 0.25, to change the
  TSPL SIZE height independently of the physical preview. The gap is separate;
  changing the print height can change feed spacing.

The physical preview is 4 by 0.625 inches, with the leftmost 0.5 inches reduced
to a vertically centered 0.53 inches tall, leaving 0.0475 inches above and below.
The print page and physical preview heights differ. The
bitmap is cropped to ink bounds. Preview registration comes from one printed
alignment square at X 128, Y 0: its top-left was 0.57 in from the left edge
and 0.1745 in from the top edge. Tests verify that mapping, not a new hardware
measurement.

The page caches itself after the first visit to `http://localhost:8000`.
Later visits work with the Node server stopped. WebUSB still requires that
localhost address; opening the HTML file directly cannot reach the printer.
Bitmap packing, TSPL jobs, and the preview origin live in `printer-core` and
run in the browser as WebAssembly.

## Cloudflare deployment

The root `alchemy.run.ts` deploys this app as the `ukg-ttp` static Worker,
separate from the main website. Every deployment attaches `ttp.ukg.one` without
requiring `ATTACH_PRODUCTION_DOMAIN`. The existing Cloudflare account/token and Alchemy state secrets
are shared with the main site's deployment. The token needs permission to
deploy Workers and attach custom domains in the `ukg.one` zone.

`pnpm build` compiles the Rust core and writes the deployable files to `dist/`.
Builds require Node 24 LTS, Rust's stable toolchain, and its
`wasm32-unknown-unknown` target. CI installs Node and Rust before running the
printer checks and the existing Alchemy deployment. Deployment runs on pushes
to `master` or through the workflow's manual trigger.

Open `https://ttp.ukg.one` directly in Chrome or Edge, not in an embedded frame.
Settings and USB permissions are separate from localhost. All text rendering,
job generation and USB transfers stay in the browser. After the service worker
finishes caching the first visit, the site can reload without the server.

Label text uses locally
available Arial and does not upload text to a rendering service. No hosting or
Cloudflare configuration is included.
