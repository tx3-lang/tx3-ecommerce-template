# White-label e-Commerce Platform on Cardano

A forkable, configurable **white-label e-commerce template** that settles payments
directly on Cardano. Catalog, cart, checkout and admin work like any mainstream store,
but payment happens from the buyer's own wallet via CIP-30 — with optional on-chain
escrow, order traceability, and reputation badges.

Built by [TxPipe](https://txpipe.io) under Project Catalyst Fund 14. Released under
Apache 2.0. This repository is the reference consumer of the companion
[Shipping Oracle](https://github.com/tx3-lang/shipping-oracle) and is built on
the [tx3](https://github.com/tx3-lang) toolchain.

## Features

- **Storefront** — product catalog, cart, checkout, multi-currency (ADA + configurable
  Cardano native tokens).
- **Native wallet payments** — direct CIP-30 payments (Eternl, Lace) with CBOR-level
  witness verification, no heavyweight wallet SDK.
- **Order management** — stock reservation and health-checked automatic cleanup.
- **White-label by configuration** — branding, theming, and feature flags (disable
  cart, product pages, or individual on-chain features) without touching the code.
- **Advanced on-chain features (optional)** — Plutus V3 escrow, immutable order
  traceability metadata, and reputation badge NFTs. See
  [docs/advanced-onchain.md](docs/advanced-onchain.md).
- **Oracle-driven settlement (optional)** — a keeper consumes signed shipping-oracle
  attestations and drives escrow settlement automatically. See
  [docs/integration-escrow.md](docs/integration-escrow.md).

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React 19) + [Vite](https://vite.dev/)
- [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Supabase](https://supabase.com/) (Postgres) for catalog, orders, and lifecycle state
- [tx3](https://github.com/tx3-lang) transaction definitions + [Aiken](https://aiken-lang.org/)
  Plutus V3 validators for the on-chain features
- [Biome](https://biomejs.dev/) for lint/format, [Vitest](https://vitest.dev/) for tests

## Prerequisites

**For the basic storefront:**

- [Node.js](https://nodejs.org/) 20+ and [pnpm](https://pnpm.io/)
- A [Supabase](https://supabase.com/) project (or the local Supabase CLI — bundled as a
  dev dependency, run via `pnpm supabase`)
- A CIP-30 wallet (Eternl or Lace) with funds on your target network (preview, preprod, or mainnet)

**Additionally, for the advanced on-chain features:**

- [Aiken](https://aiken-lang.org/installation-instructions) — to compile the validators
- [trix](https://github.com/tx3-lang/trix) (the tx3 CLI) — to regenerate the protocol client
- A TRP endpoint + API key for your target network. A hosted endpoint (preview, preprod,
  or mainnet) is available from [Demeter](https://demeter.run/); for local development use
  a [dolos](https://github.com/txpipe/dolos) node with `TX3_PROFILE=local`.
- A funded wallet on your target network for the merchant backend signer

## Network

The template runs on **any Cardano network** — mainnet, preprod, or preview. The active
network is selected by your TRP endpoint and `TX3_PROFILE` (see [.env.example](.env.example));
nothing in the code is preview-specific. We use **preview** for testing, but **mainnet is
fully supported** with the same configuration.

## Quick start

```bash
pnpm install
```

The app needs Supabase before it will run. Create a project (or start the local stack),
apply the migrations, then set the environment variables:

```bash
cp .env.example .env        # then fill in the values — see docs/USER_GUIDE.md
pnpm supabase migration up   # apply the schema in supabase/migrations
pnpm dev                     # http://localhost:3000
```

See the [User Guide](docs/USER_GUIDE.md) for the full setup, branding/white-label
configuration, environment variables, and deployment.

## Documentation

- [User Guide](docs/USER_GUIDE.md) — setup, branding, env vars, Supabase, Vercel deploy
- [Advanced on-chain features](docs/advanced-onchain.md) — traceability, escrow, badges
- [Oracle-driven escrow settlement](docs/integration-escrow.md) — the keeper integration
- [Design document](design/000-ecommerce-cardano.md) and
  [architecture diagrams](docs/architecture/README.md)

## Scripts

```bash
pnpm dev        # start the dev server on port 3000
pnpm build      # production build
pnpm test       # unit tests (Vitest)
pnpm test:e2e   # end-to-end tests (require a local dolos node + env — see integration-escrow.md)
pnpm lint       # Biome lint
pnpm format     # Biome format
pnpm check      # Biome lint + format check
```

Operator CLI scripts (traceability, escrow, badges, keeper) are documented in
[docs/advanced-onchain.md](docs/advanced-onchain.md#operator-scripts).

## License

[Apache 2.0](LICENSE).
