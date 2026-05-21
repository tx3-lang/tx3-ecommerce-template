# Milestone 3 / Feature A — On-chain Traceability (Design Spec)

> Date: 2026-05-20
> Status: design draft, pending user review.
> Cross-cutting decisions: see `2026-05-20-milestone-3-overview.md`.

## Goal

Record key order-lifecycle events as immutable on-chain transactions on Cardano, so that the full history of an order (paid → shipped → completed, or cancelled) can be independently audited against the chain.

Maps to grant outputs:
- **A1** — generate on-chain transactions that record data from key store order events.
- **A2** — video walkthrough showcasing the feature with resulting on-chain txs.

## Approach

Each traced event produces **one Cardano transaction** that carries a structured JSON payload as transaction metadata under a custom label. No smart contract, no native tokens, no on-chain state machine: the chain is used purely as an append-only log keyed by `order_id`. The trace of an order is reconstructed by querying all txs for the merchant's address that carry the label, then filtering by `order_id` in the payload.

### Why metadata-only

- Cheapest path that still satisfies A1 (each event becomes a real, immutable, verifiable tx).
- No Aiken validator required — keeps feature A simple while B introduces Aiken.
- Compatible with existing payment flow: the buyer's payment tx is unchanged.
- The traceability code path is the foundation for B and C (same signer, same provider, same submission flow).

### Traced events

| Event | Trigger | Submitted by | Notes |
|---|---|---|---|
| `paid` | Buyer payment confirmed, DB status flips `pending → paid` | Backend signer | Submitted as a separate tx (not enriching the buyer's payment tx) for simplicity and uniform schema. Cost: ~0.2 ADA. |
| `shipped` | Merchant clicks "Mark shipped" in admin | Backend signer | Optional `tracking_number` in payload. Will later become the trigger for escrow release in B. |
| `completed` | Merchant clicks "Mark completed", or auto-complete after grace period | Backend signer | Closure of the happy path. C uses this as a badge-mint trigger. |
| `cancelled` | Buyer or merchant cancels (or refund flow) | Backend signer | Reason string in payload. Required for the on-chain trace to reflect negative outcomes. |

Out of scope for A: `order.created` and `order.processing` events. Adding them later is a pure additive change — no schema break.

### Metadata payload

Single custom label (default `1337`, overridable via `METADATA_LABEL` env). Payload schema:

```json
{
  "v": 1,
  "event": "shipped",
  "order_id": "uuid-v4-string",
  "merchant": "addr1...",
  "ts": 1747843200,
  "data": {
    "tracking_number": "OPTIONAL-..."
  }
}
```

- `v` — schema version. Bump if breaking changes.
- `event` — one of `paid | shipped | completed | cancelled`.
- `order_id` — DB UUID of the order.
- `merchant` — bech32 address of the backend signer (same value as `MERCHANT_ADDRESS`).
- `ts` — Unix seconds at submission time.
- `data` — free-form sub-object per event; empty `{}` when no extra fields apply.

Cardano metadata size limit is 16 KB per tx; the payload is well under 1 KB.

## Components

### New files

| Path | Responsibility |
|---|---|
| `src/lib/cardano/network.ts` | Loads env (`TX3_TRP_ENDPOINT`, `TX3_PROFILE`, `METADATA_LABEL`, `MERCHANT_ADDRESS`). Exposes `getNetworkConfig()`. |
| `src/lib/cardano/u5c-client.ts` | Thin wrapper over the u5c client used by `tx3-sdk`. Exposes `getMerchantUtxos()` and reuses the SDK's submission path. |
| `src/lib/cardano/signer.ts` | Loads `CARDANO_MERCHANT_SKEY` and builds an `Ed25519Signer` instance. Exposes `getMerchantSigner()` (memoised). Throws on first call if the env is missing. |
| `src/lib/cardano/traceability.ts` | Per-event functions: `submitPaidTrace(orderId)`, `submitShippedTrace(orderId, {trackingNumber?})`, `submitCompletedTrace(orderId)`, `submitCancelledTrace(orderId, {reason})`. Each returns `{ txHash, confirmed: boolean }`. Used by both server-fns (for buyer-triggered `paid`) and CLI scripts (for merchant-triggered events). |
| `supabase/migrations/2026MMDD_order_events.sql` | Creates `order_events` table + RLS. See schema below. |
| `scripts/mark-order-shipped.ts` | CLI: takes `--order-id` (and optional `--tracking`), validates transition, calls `submitShippedTrace`, persists `order_events` row, updates `orders.status`. Uses service-role DB client + backend signer directly. |
| `scripts/mark-order-completed.ts` | CLI: same shape, for `paid|shipped → completed`. |
| `scripts/cancel-order.ts` | CLI: same shape, for `cancelled` from any pre-completed state. Takes `--reason`. |
| `scripts/reconcile-events.ts` | CLI: scans `order_events WHERE confirmed_at IS NULL` and re-runs `waitForConfirmed` for each. Run manually when needed. |
| `src/components/order/OrderTraceTimeline.tsx` | Renders `order_events` as a vertical timeline with explorer links. Used in buyer-facing order confirmation page. |

### Modified files

| Path | Change |
|---|---|
| `tx3/main.tx3` | Add `record_order_event(merchant_input, metadata_payload)` tx: self-payment of min-ADA from merchant to merchant with metadata attached. |
| `tx3/trix.toml` | Add `[profiles.local]` and `[profiles.preview]` blocks pointing to their respective TRP endpoints. |
| `src/server-fns/orders.ts` | After the buyer's payment is verified and `status` flips to `paid`, call `submitPaidTrace(orderId)` inside the same SQL transaction. Rollback on submission failure. Other status transitions are driven by CLI scripts, not server-fns. |
| `@types/database.d.ts` | Add `OrderEvent` interface. Extend `Order` with `events?: OrderEvent[]` (eager-loaded). |
| `src/routes/order-confirmation.$orderId.tsx` | Add `<OrderTraceTimeline events={order.events} />` below the existing summary. |
| `src/hooks/use-orders.ts` | Eager-load `order_events` in the existing query. |

### `order_events` schema

```sql
CREATE TABLE order_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN ('paid','shipped','completed','cancelled')),
  tx_hash       TEXT NOT NULL,
  payload       JSONB NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ NULL,
  UNIQUE (order_id, event_type)
);

CREATE INDEX order_events_order_id_idx ON order_events(order_id);
CREATE INDEX order_events_unconfirmed_idx ON order_events(confirmed_at) WHERE confirmed_at IS NULL;
```

RLS:
- `SELECT` for the order's `wallet_address` (matched against `current_setting('app.current_wallet')`).
- `INSERT` / `UPDATE` exclusively via service role from server-fns and CLI scripts. Service role bypasses RLS, so no explicit admin policy is needed in milestone-mode.

The `UNIQUE(order_id, event_type)` prevents duplicate event rows under concurrent retries.

## Data flow

### Happy path: paid

1. Buyer signs `pay_with_ada` / `pay_with_tokens` from the frontend (unchanged flow).
2. `submitPayment` server-fn writes `cardano_tx_hash` to `orders` and sets `status='paid'`.
3. Same server-fn calls `submitPaidTrace(orderId)`:
   - Builds `record_order_event` tx with backend signer's UTxO + metadata payload.
   - `resolve → sign → submit → waitForConfirmed(PollConfig.default())`.
   - On confirmed: insert `order_events` row with `confirmed_at=NOW()`.
   - On timeout (block not yet seen): insert row with `submitted_at=NOW()`, `confirmed_at=NULL`. Return the tx hash to the caller anyway.
4. Server-fn returns to client. Frontend re-fetches order and renders the timeline.

### Happy path: shipped (and analogous: completed, cancelled)

1. Merchant runs `pnpm tsx scripts/mark-order-shipped.ts --order-id <uuid> --tracking <code>` from a machine with the production env vars loaded.
2. The script:
   - Connects to the DB via the service-role Supabase client.
   - `SELECT ... FOR UPDATE` on the order row; assert current status is `paid`.
   - Calls `submitShippedTrace(orderId, {trackingNumber})`.
   - On success: insert `order_events` row + `UPDATE orders SET status='shipped'` in one SQL transaction.
   - On submission failure: rollback the SQL transaction; the order stays in `paid`. Exit non-zero with the error message.
3. Script prints the tx hash + CardanoScan link to stdout for the operator to record.

The buyer-facing order confirmation page picks up the new event on the next fetch (no admin UI involved).

### Reconciliation of pending confirmations

When `waitForConfirmed` times out in the server-fn or script, the `order_events` row is persisted with `confirmed_at = NULL` and the tx hash already known. Running `pnpm tsx scripts/reconcile-events.ts` scans those rows and re-invokes `waitForConfirmed` to fill `confirmed_at`. Run manually after a window where events are expected to have confirmed; not scheduled as a cron job in milestone-mode.

## Error handling

| Failure | Detection | Response |
|---|---|---|
| Merchant signer has no UTxOs | u5c can't find a suitable UTxO for fees | `503 MERCHANT_FUNDS_INSUFFICIENT`. Status unchanged. Operator alert. |
| u5c endpoint down | Connection / timeout error | `503 CHAIN_UNAVAILABLE`. Status unchanged. Manual retry. |
| Tx rejected by node | u5c returns submission error | `500` with node error message. Log tx CBOR for debugging. SQL rollback. |
| `waitForConfirmed` times out | SDK returns timeout, but tx is in mempool | Insert row with `confirmed_at=NULL`. Return tx hash. Reconciler completes later. |
| Double submission (concurrent clicks) | Two handlers try the same transition | `SELECT ... FOR UPDATE` serialises; second sees stale status and returns `409 INVALID_TRANSITION`. |
| Backend signer key rotation | Off-band | Rotate env var, redeploy. Old txs remain valid. Frontend indexer accepts both old + new merchant addresses during transition. |

## Idempotency

- `UNIQUE(order_id, event_type)` enforces one tx per event per order.
- If a retry re-submits the same conceptual event, the second `INSERT` fails on the constraint and the SQL transaction rolls back — but the first tx is already on-chain, so the system state is correct: one event, one tx.
- The status transition is gated by `SELECT ... FOR UPDATE`, so a retry against an already-transitioned order returns `409` without submitting a new tx.

## Auth model for merchant actions (milestone-mode)

There is no in-app merchant auth in milestone-mode. Merchant-initiated transitions (`shipped`, `completed`, `cancelled`) are run as CLI scripts on a machine that has:
- `SUPABASE_SERVICE_ROLE_KEY` — full DB access (already present in the project).
- `CARDANO_MERCHANT_SKEY` — the backend signer key.
- `TX3_TRP_ENDPOINT` + `TX3_PROFILE` — chain access config.

Anyone with that env can run the scripts; security boundary is the machine, not the app. A production iteration would introduce a wallet-gated admin panel (see "Future improvements" below).

## Testing strategy

### Unit (Vitest)
- `traceability.test.ts` — mocks u5c + signer, asserts payload shape per event.
- `network.test.ts` — env var loading, profile selection.
- `signer.test.ts` — fails loudly when `CARDANO_MERCHANT_SKEY` is missing.
- `order-events.repo.test.ts` — UNIQUE constraint, RLS read access.

### Integration / e2e (against dolos)
- Fixture seeds merchant address with UTxOs via `tx3/devnet.toml` style setup.
- Full lifecycle test: create order → buyer pays → trace paid → mark shipped → trace shipped → mark completed → trace completed. Assert 3 rows in `order_events`, all with `confirmed_at` set.
- Cancellation test: create order → mark cancelled before payment → assert single `cancelled` event.
- Error path: stop dolos mid-test, attempt `markShipped`, assert order stays in `paid` and no `order_events` row is created.

### Preview evidence run
- Manual run from `.env.preview`. Document tx hashes in `docs/advanced-onchain.md` (output D).

## Open questions / future improvements

- **Async confirmation** — current design awaits `waitForConfirmed` in the server-fn and scripts. On preview (~20s block time) this can hold a script for a block period. If demos become slow, change to "submit and return immediately; reconcile later". Doable without schema changes (`confirmed_at` is already nullable).
- **Enriching the payment tx vs separate paid tx** — chose separate paid tx to keep schema uniform. Could later swap to enriching by adding metadata to `pay_with_ada` / `pay_with_tokens`; the indexer would just see a paid event on a tx that also moves funds.
- **Schema evolution** — payload field `v: 1` is a forward-compatibility hook. Bumping is a future concern.
- **Wallet-gated admin panel** — milestone-mode uses CLI scripts. A production iteration would expose the same operations through a TanStack admin route protected by wallet auth (CIP-30 nonce signature). Out of scope for this milestone; introduce when the platform serves multiple merchants or non-developer operators.
- **Scheduled reconciler** — milestone-mode is a manual script. A production iteration would run it on Supabase pg_cron (e.g., hourly) to fill `confirmed_at` automatically.

## Implementation phases (preview — actual plan goes through writing-plans)

1. **Phase 0 — chain plumbing:** `network.ts`, `u5c-client.ts`, `signer.ts`. Smoke test against dolos.
2. **Phase 1 — DB:** migration + types + repo helpers.
3. **Phase 2 — tx3:** add `record_order_event` tx, regenerate ts-client.
4. **Phase 3 — traceability module:** the four `submit*Trace` functions, with unit tests.
5. **Phase 4 — server-fn integration:** wire `submitPaidTrace` into the payment confirmation flow.
6. **Phase 5 — CLI scripts:** `mark-order-shipped`, `mark-order-completed`, `cancel-order`, `reconcile-events`.
7. **Phase 6 — buyer UI:** timeline component on order confirmation.
8. **Phase 7 — preview evidence:** run against `.env.preview`, capture 3 tx hashes, record for D.
