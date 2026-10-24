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

- USB vendor `0x1203`, product `0x0126`.
- Two empty text lines, Arial Bold and Arial Regular at 8 pt.
- Browser rasterization, monochrome packing and TSPL BITMAP output.
- Draggable symmetric padding guides and a shaped physical-tag preview.
- Print defaults retain the pre-padding baseline of SIZE 4.00,0.28,
  GAP 0.35,0 and DIRECTION 1,0.

The physical preview is 4 by 0.625 inches, with the leftmost 0.5 inches reduced
to 0.53 inches tall. The print page and physical preview heights differ. The
bitmap is cropped to ink bounds; physical alignment after that change has not
yet been confirmed on the printer. Tests verify command generation, not hardware
registration.

Interface fonts currently load from Google Fonts. Label text uses locally
available Arial and does not upload text to a rendering service. No hosting or
Cloudflare configuration is included.
