import alchemy from "alchemy";
import { Website } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const attachProductionDomain = process.env.ATTACH_PRODUCTION_DOMAIN === "true";

const app = await alchemy("ukg", {
  stateStore: (scope) =>
    new CloudflareStateStore(scope, {
      scriptName: "ukg-alchemy-state",
    }),
});

const site = await Website("site", {
  name: "ukg-one",
  build: "nix build .#site --out-link dist",
  assets: {
    directory: "./dist",
    html_handling: "auto-trailing-slash",
    not_found_handling: "404-page",
    _headers: `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/index.html
  Cache-Control: public, max-age=0, must-revalidate`,
  },
  domains: attachProductionDomain
    ? [
      { domainName: "ukg.one", adopt: true },
      { domainName: "www.ukg.one", adopt: true },
    ]
    : undefined,
  previewSubdomains: true,
  url: true,
});

console.log(`Deployed ukg.one site: ${site.url}`);

await app.finalize();
