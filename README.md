# ukg.one

Static website and TTP-247 label printer, deployed as separate Cloudflare Workers
through `alchemy.run.ts`.

## Development

```sh
nix develop
pnpm install --frozen-lockfile
pnpm dev
```

The development shell supplies Node 24 LTS and pnpm. `packageManager` pins pnpm
11.25.0. The workspace uses one root lockfile. Alchemy stays at 0.93.12.

`pnpm dev` builds the main site through Nix and serves it at
`http://localhost:4173`. For the printer app, use
`pnpm --filter @ukg/stake-printer dev`. Its WASM build also needs the Rust stable
toolchain and the `wasm32-unknown-unknown` target.

## Checks

```sh
pnpm check
pnpm lint
pnpm fmt:check
pnpm test
nix flake check
```

`pnpm check` runs the pinned experimental tsrs Rust TypeScript checker against
the Alchemy program and SolidJS printer app. `pnpm lint` runs Oxlint against the
deployment, frontend and Node scripts. Oxfmt checks the tooling configuration and
Solid app sources; the main page and existing printer scripts stay excluded.
The printer tests execute the compiled WASM core.

## Deployment

```sh
pnpm run deploy
# Or, with the Nix-provided Node runtime:
nix run .#deploy
```

Install dependencies first. Local deployment requires `ALCHEMY_PASSWORD`,
`ALCHEMY_STATE_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` in the
environment. Do not put secrets in source files. `ATTACH_PRODUCTION_DOMAIN=true`
attaches the main site's domains; the printer always attaches `ttp.ukg.one`.

Pushes to `master` run the GitHub workflow, which installs from the lockfile,
checks and builds the apps, and deploys using the existing repository secrets.
Deployment resource IDs, production stage, and Cloudflare state storage are
unchanged by the Node migration. Nothing in the runtime migration requires
recreating deployed Workers or changing state tokens.
