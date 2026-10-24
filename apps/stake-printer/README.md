# Stake printer

Static TSC TTP-247 pot-stake label editor. Sends binary TSPL over WebUSB in
Chrome or Edge. No Windows driver, backend, build step or external dependencies.

## Run locally

Requires Node 22 or newer. Node is an explicit exception to the repository's
Deno default, requested for this app. No dependency installation is needed.

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

- Granular mode edits one label's two text lines and copy count.
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
- Print defaults retain the pre-padding baseline of SIZE 4.00,0.28,
  GAP 0.35,0 and DIRECTION 1,0.
- Printer settings includes Print height (in), default 0.28, to change the
  TSPL SIZE height independently of the physical preview. The gap is separate;
  changing the print height can change feed spacing.

The physical preview is 4 by 0.625 inches, with the leftmost 0.5 inches reduced
to a vertically centered 0.53 inches tall, leaving 0.0475 inches above and below.
The print page and physical preview heights differ. The
bitmap is cropped to ink bounds; physical alignment after that change has not
yet been confirmed on the printer. Tests verify command generation, not hardware
registration.

Interface fonts currently load from Google Fonts. Label text uses locally
available Arial and does not upload text to a rendering service. No hosting or
Cloudflare configuration is included.
