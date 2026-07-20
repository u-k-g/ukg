# Project Guidance

## Product values

Build for immediacy. Pages should feel instant, direct, and dependable, taking
inspiration from McMaster-Carr's unusually fast and straightforward web
experience. Prefer useful information and obvious interactions over visual
spectacle.

The governing qualities are:

- Lightweight
- Fast and responsive
- Simple to understand and operate
- Static and local-first where practical
- Reproducible from source
- Configured in code

## Performance

- Default to static HTML and CSS served from Cloudflare's edge.
- Pre-render content at build time. Do not add request-time rendering without a
  concrete need.
- Ship no client-side JavaScript unless it enables a real interaction.
- Prefer browser-native HTML and CSS over framework code.
- Avoid hydration, large dependency graphs, animation libraries, and general UI
  frameworks for pages that do not require them.
- Keep each page's critical path short. Avoid third-party network requests,
  trackers, tag managers, and externally hosted fonts when assets can be
  self-hosted.
- Optimize images during the build and use appropriately sized modern formats.
- Prevent layout shifts and interaction delays. Dynamic elements must have
  stable dimensions.
- Treat regressions in load time, bundle size, request count, or interaction
  latency as product regressions.

## Design

- Prefer dense clarity over decorative composition.
- Interfaces should be quiet, legible, and immediately usable.
- Navigation and controls should be obvious without explanatory UI copy.
- Avoid ornamental effects that increase rendering cost or distract from the
  content.
- Add visual complexity only when it contributes meaningfully to the project.
- Preserve accessibility, semantic HTML, keyboard operation, reduced-motion
  preferences, and strong contrast.

## Architecture

- Choose the smallest architecture that completely solves the problem.
- A static project should remain static.
- Do not introduce a database, backend, container, server, or persistent process
  until a feature actually requires one.
- Keep substantial projects independently deployable, generally with one
  repository, Cloudflare Worker, and `*.ukg.one` subdomain per project.
- Prefer Cloudflare Workers Static Assets for static sites and browser-based
  applications.
- Add Worker code or other Cloudflare primitives only to the project that needs
  them.

## Infrastructure as code

- Infrastructure and hosting configuration belong in version-controlled code.
- Use Alchemy for Cloudflare resources such as Workers, assets, custom domains,
  DNS, redirects, and bindings.
- A fresh deployment should be reproducible from the repository plus secrets.
- Do not rely on undocumented dashboard state.
- Dashboard actions are acceptable only when a provider makes them unavoidable,
  such as account creation, registrar nameserver delegation, credential
  issuance, billing, or initial secret entry.
- Document every unavoidable manual bootstrap step and automate it when a stable
  API becomes available.

## Nix

- Follow the Nix philosophy: pinned inputs, reproducible builds, explicit
  dependencies, immutable outputs, and declarative configuration.
- Use Nix whenever it improves reproducibility, portability, validation, or
  operational simplicity.
- Keep Nix expressions small and readable. Do not add abstraction merely to make
  something more Nix-like.
- Expose useful workflows through the flake, including development shells,
  builds, checks, and deployment apps.
- Build deployable static assets as Nix derivations when practical.
- Keep `flake.lock` committed and update dependencies intentionally.

## JavaScript and TypeScript

- If JavaScript or TypeScript tooling is needed, choose Deno by default.
- Pin Deno through Nix and dependencies through `deno.json` and `deno.lock`.
- Prefer Web APIs and Deno-native capabilities over Node-specific packages.
- Use npm packages through Deno only when they provide meaningful value.
- Explicitly approve any required npm lifecycle scripts. Do not broadly allow
  dependency scripts.
- Do not introduce Node, Bun, npm, yarn, or pnpm unless Deno cannot reasonably
  support a required tool, and document the reason if that exception is made.

## Dependencies

- Every dependency must justify its download cost, maintenance cost, and effect
  on reproducibility.
- Prefer platform capabilities and small focused libraries.
- Avoid dependencies for behavior that can be implemented clearly in a small
  amount of local code.
- Remove unused dependencies and generated configuration promptly.

## Verification

Before considering a change complete, run the relevant checks:

```sh
deno fmt --check
deno task check
nix flake check
git diff --check
```

For user-facing changes, also verify the production build in a browser at
desktop and mobile sizes. Check that content appears immediately, interactions
remain responsive, external requests are intentional, and the console is clean.
