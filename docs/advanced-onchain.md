# Milestone 3 — Advanced On-chain Features

This document covers three advanced Cardano on-chain features built in milestone 3 of the e-commerce platform:

- **Feature A — On-chain Traceability:** immutable transaction metadata recording key order events (paid, shipped, completed, cancelled).
- **Feature B — On-chain Escrow Contract:** a Plutus V3 escrow validator that holds buyer funds until the merchant ships, with a refund path on timeout.
- **Feature C — On-chain Reputation Badges:** soulbound (off-chain) NFTs minted to buyers and the merchant upon successful order completion.

These features were built to the **minimum scope required to produce milestone evidence** for the grant. They are not production-ready but demonstrate the complete lifecycle on Cardano preview testnet.

## Trust model

This milestone operates in **off-chain admin mode**: the merchant holds a server-side Ed25519 signing key and authorises all backend actions (traceability events, escrow transitions, badge minting). Frontend buyers interact via CIP-30 wallet, and the backend signer never substitutes a buyer's signature.

Reputation badges are **off-chain soulbound** — uniqueness is enforced at the DB layer (a UNIQUE constraint on `(kind, recipient_pkh)` in the `issued_badges` table) and via the on-chain rule that each mint produces exactly one token. There is no on-chain soulbound enforcement or Burn redeemer in this milestone.

## Required environment

All transactions live on Cardano **preview** testnet. Explorer: <https://preview.cexplorer.io>.

Before running any operator script against preview, copy `.env.preview` as `.env` and set the following in `.env` (do not commit this file):

| Variable | Purpose |
|---|---|
| `TX3_TRP_ENDPOINT` | URL of the TRP server (dolos local or preview TRP). |
| `TX3_TRP_API_KEY` | `dmtr-api-key` header value. Required for preview. |
| `TX3_PROFILE` | `local` or `preview`. Must match a profile in `tx3/trix.toml`. |
| `VITE_TX3_PROFILE` | Same value as `TX3_PROFILE`, exposed to the browser — drives the explorer link in the buyer UI. |
| `CARDANO_MERCHANT_SKEY` | Ed25519 hex signing key for the merchant. Server-side only. |
| `MERCHANT_ADDRESS` | Bech32 address of the merchant's backend wallet. |
| `ESCROW_SHIP_DEADLINE_SECONDS` | Timeout for the merchant to ship. `.env.example` uses `60`. |
| `ESCROW_GRACE_PERIOD_SECONDS` | Grace period after shipped before release. `.env.example` uses `60`. |
| `ESCROW_SCRIPT_REF_TX_HASH` | Tx hash of the escrow validator reference-script UTxO. Re-publish whenever `aiken build` produces a new validator hash. |
| `ESCROW_SCRIPT_REF_OUTPUT_INDEX` | Output index of the escrow reference-script UTxO. |
| `BADGE_SCRIPT_REF_TX_HASH` | Tx hash of the badge minting-policy reference-script UTxO (published once via `publish_badge_script`). |
| `BADGE_SCRIPT_REF_OUTPUT_INDEX` | Output index of the badge reference-script UTxO. |
| `VITE_SUPABASE_URL` | Supabase project URL (used by app + operator scripts). |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key for client/browser access. |
| `SUPABASE_SECRET_KEY` | Supabase service-role/secret key for operator scripts. Server-side only. |
| `VITE_API_URL` | Base URL of the app's API, exposed to the browser. |
| `METADATA_LABEL` | Optional, default `1337`. Numeric label for order-event metadata. |

> The `order-cleanup` Supabase Edge Function additionally reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, but Supabase injects those automatically in the function runtime — they are not part of `.env`.

For local development against dolos, use `TX3_PROFILE=local`.

## How to deploy

1. **Aiken build** — compile the validators:

   ```bash
   cd aiken && aiken check && aiken build
   ```

   Produces `aiken/plutus.json` containing both the escrow and badges validators.

2. **Database migration** — apply schema changes:

   ```bash
   pnpm supabase db reset --local   # or: pnpm supabase migration up
   ```

   This creates all required tables (`order_events`, `escrows`, `issued_badges`) with constraints.

3. **tx3 bindgen** — regenerate the TypeScript protocol client:

   ```bash
   trix codegen
   ```

   Ensures `src/lib/tx3/protocol.ts` matches the transaction definitions in `tx3/main.tx3`.

4. **Environment variables** — copy the example file and fill in values:

   ```bash
   cp .env.example .env          # local development
   cp .env.example .env.preview  # preview testnet
   ```

   See the [Required environment](#required-environment) section above for all variables.

5. **Run the demo scripts** — follow the [happy-path lifecycle](#how-to-use--happy-path-lifecycle) below.

## How to use — happy-path lifecycle

> **Two subsystems, two responsibilities.** The lifecycle is driven by two
> independent families of scripts that you run together:
>
> - **Traceability (Feature A)** — `mark-order-shipped`, `mark-order-completed`,
>   `cancel-order` (and the `paid` event from checkout). These submit
>   metadata-only on-chain transactions and own the `orders.status` column and
>   the `order_events` table (one row per `(order_id, event_type)`).
> - **Escrow (Feature B)** — `escrow-mark-shipped`, `escrow-release`,
>   `escrow-refund`. These spend/re-lock the escrow UTxO and own **only** the
>   `escrows` table (escrow tx hashes live in `escrows.{shipped,release,refund}_tx_hash`).
>
> The two never write the same row, so running both for one order is correct and
> does not collide. The `shipped`/`completed`/`cancelled` traceability event and
> the corresponding escrow transition are **different on-chain transactions** —
> the traceability tx records the event; the escrow tx moves the funds.

A complete order lifecycle from checkout through badge minting:

1. **Buyer checkout (frontend)** — the buyer adds items to cart and completes checkout via Cypher-30 wallet. The frontend submits a lock-to-script transaction and the server-fn records the `paid` traceability event.

2. **Lock escrow (buyer signs tx)** — the buyer's checkout transaction locks funds to the escrow script address with the escrow datum. At this point the order is in escrow.

3. **Mark shipped (merchant CLI)** — the merchant ships the physical goods and records the event on chain:

   ```bash
   pnpm tsx scripts/mark-order-shipped.ts --order-id <uuid> --tracking <code>
   ```

   For the escrow state machine, the merchant also marks the escrow as shipped:

   ```bash
   pnpm tsx scripts/escrow-mark-shipped.ts --order-id <uuid>
   ```

4. **Release escrow (merchant CLI after grace period)** — once the grace period elapses, the merchant releases funds:

   ```bash
   pnpm tsx scripts/escrow-release.ts --order-id <uuid>
   ```

5. **Mark completed (merchant CLI)** — records the `completed` traceability event:

   ```bash
   pnpm mark-completed -- --order-id <uuid>
   ```

6. **Mint buyer badge (merchant CLI)** — the buyer earned a `buyer-first-purchase` badge:

   ```bash
   pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind buyer-first-purchase
   ```

7. **Mint seller badge (merchant CLI)** — the merchant earned a `seller-first-delivery` badge:

   ```bash
   pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind seller-first-delivery
   ```

## Network

All transactions live on Cardano **preview** testnet. Explorer: <https://preview.cexplorer.io>.

## On-chain Traceability

The merchant backend signs three transactions per order lifecycle, each carrying CIP-25-style metadata under label `1337`:

```json
{ "v": 1, "event": "paid|shipped|completed|cancelled", "order_id": "<uuid>", "merchant": "<bech32>", "ts": <unix_seconds>, "data": { ... } }
```

### Order `<ORDER_ID>` (pending)

Run the demo:

1. Complete a checkout from a CIP-30 wallet against preview. The server-fn captures the buyer's payment tx and immediately submits the `paid` event.
2. Run `pnpm mark-shipped -- --order-id <ORDER_ID> --tracking <CODE>`.
3. Run `pnpm mark-completed -- --order-id <ORDER_ID>`.

Capture the resulting tx hashes:

| Event | Tx hash | Explorer link |
|---|---|---|
| `paid` | `f99e44c4c47ff2544a02fa56e2a4c539df30876498774159de5fc5230926f85c` | <https://preview.cexplorer.io/tx/f99e44c4c47ff2544a02fa56e2a4c539df30876498774159de5fc5230926f85c> |
| `shipped` | `91ee5c4f2ada10001e1cea61e0a68c30a98e79df81542831b3969728074926b0` | <https://preview.cexplorer.io/tx/91ee5c4f2ada10001e1cea61e0a68c30a98e79df81542831b3969728074926b0> |
| `completed` | `0d8516bc8ada400658a98c51e1c60e5ed2623cd1ce267fb1df2fdd1543b25fdf` | <https://preview.cexplorer.io/tx/0d8516bc8ada400658a98c51e1c60e5ed2623cd1ce267fb1df2fdd1543b25fdf> |

Each metadata payload should be visible under label `1337` in CardanoScan's metadata panel.

### Notes

- For the milestone walkthrough, additional events (`cancelled`) can be demonstrated with a second order using `pnpm cancel-order -- --order-id <ORDER_ID> --reason "<REASON>"`.
- If any tx confirms slowly and the corresponding `order_events.confirmed_at` stays `NULL`, run `pnpm reconcile-events` to fill it in.

## On-chain Escrow Contract

The escrow contract is a Plutus V3 validator with three redeemers: `MarkShipped` (merchant confirms shipment), `Release` (merchant collects funds after grace period), and `Refund` (buyer refunds if merchant misses the ship deadline). Each escrow lives as a single UTxO at the script address with an `EscrowDatum` carrying order details and deadlines.

### Release

Lock → mark shipped → wait grace period → release:

| Step | Tx hash | Explorer link |
|---|---|---|
| Lock to script | `f99e44c4c47ff2544a02fa56e2a4c539df30876498774159de5fc5230926f85c` | <https://preview.cexplorer.io/tx/f99e44c4c47ff2544a02fa56e2a4c539df30876498774159de5fc5230926f85c> |
| Mark shipped | `fa6f06b2a2e473fabf070e926310c1199c6b78d3ed9f660419d798b5c0c0f266` | <https://preview.cexplorer.io/tx/fa6f06b2a2e473fabf070e926310c1199c6b78d3ed9f660419d798b5c0c0f266> |
| Release | `c75e1c458f5bbe613d308e38d15cc9275b691c510f74b33d4ece626baef774f4` | <https://preview.cexplorer.io/tx/c75e1c458f5bbe613d308e38d15cc9275b691c510f74b33d4ece626baef774f4> |


## Reputation Badges

Two badge kinds are defined:

| Kind | Recipient | Description | Trigger |
|---|---|---|---|
| `buyer-first-purchase` | Buyer | First Purchase Badge | Escrow released for the buyer's first order |
| `seller-first-delivery` | Merchant | First Delivery Badge | First escrow released store-wide |

Each badge is an NFT minted under a single Aiken minting policy parameterised by the merchant's public key hash. The policy enforces:
- Merchant signature is required for every mint.
- Every asset minted under this policy has quantity exactly 1.

Asset names encode `(2-byte kind_id, 28-byte recipient_pkh)` for uniqueness. CIP-25 metadata (label 721) provides name, description, and image for wallet/explorer rendering.

### Minting instructions

Both badges are minted via the CLI after a successful escrow release:

```bash
# Buyer badge
pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind buyer-first-purchase

# Seller badge
pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind seller-first-delivery
```

Eligibility is enforced off-chain by the script: the buyer must have exactly one released escrow (the current order), and the seller badge must be the first release store-wide. Double-minting is prevented by a UNIQUE constraint on `issued_badges (kind, recipient_pkh)`.

### Evidence tx hashes (pending)

| Badge | Tx hash | Explorer link |
|---|---|---|
| Buyer First Purchase | `cd20867329ed6457dbc61f464e7a18832e8902d5a7497a76dc440cb6ab40b745` | <https://preview.cexplorer.io/tx/cd20867329ed6457dbc61f464e7a18832e8902d5a7497a76dc440cb6ab40b745> |
| Seller First Delivery | `83886f27e8b57a7a4a1af914bb0ed329146b571b88c1ced807cb32add9e3ff03` | <https://preview.cexplorer.io/tx/83886f27e8b57a7a4a1af914bb0ed329146b571b88c1ced807cb32add9e3ff03> |

## Operator scripts

All operator scripts live under `scripts/` and are invoked via `pnpm` convenience shortcuts or `pnpm tsx`:

| Script | Purpose |
|---|---|
| `pnpm mark-shipped` | Backend-signed `shipped` traceability event + DB status flip. |
| `pnpm mark-completed` | Backend-signed `completed` traceability event + DB status flip. |
| `pnpm cancel-order` | Backend-signed `cancelled` traceability event + DB status flip. Requires `--reason`. |
| `pnpm reconcile-events` | Re-checks `order_events.confirmed_at` against chain status. |
| `scripts/escrow-mark-shipped.ts` | Escrow state transition: Pending → Shipped. |
| `scripts/escrow-release.ts` | Escrow state transition: Shipped → Released (after grace period). |
| `scripts/escrow-refund.ts` | Escrow state transition: Pending → Refunded (after ship deadline). |
| `scripts/reconcile-escrow.ts` | Re-checks escrow state against chain. |
| `scripts/mint-badge.ts` | Mints a reputation badge NFT to the buyer or merchant. |

## Limitations and out-of-scope items

The following are explicitly out of scope for this milestone and tracked as future improvements:

- **Threshold badges** — only first-purchase / first-delivery badges are implemented; no streak or volume-based badges.
- **On-chain soulbound enforcement** — badge uniqueness relies on DB constraints, not on-chain logic preventing transfers.
- **No Burn redeemer** — the minting policy has a single `Mint` redeemer; badges cannot be burned.
- **No reputation aggregator UI / leaderboard** — no page ranking buyers or sellers by badge count.
- **No reconcile-badges script** — no script to scan the chain for badge UTxOs and reconcile with the `issued_badges` table.
- **CLI-driven minting only** — all merchant actions (traceability, escrow, badge minting) are driven by CLI scripts, not an admin UI.
- **No scheduled reconciliation** — `reconcile-events` and `reconcile-escrow` are manual CLI commands, not cron jobs.

## Architecture reference

- Spec overview: `docs/superpowers/specs/2026-05-20-milestone-3-overview.md`
- Traceability design: `docs/superpowers/specs/2026-05-20-milestone-3-traceability-design.md`
- Escrow design: `docs/superpowers/specs/2026-05-20-milestone-3-escrow-design.md`
- Reputation design: `docs/superpowers/specs/2026-05-20-milestone-3-reputation-design.md`
- User guide: `docs/USER_GUIDE.md`
