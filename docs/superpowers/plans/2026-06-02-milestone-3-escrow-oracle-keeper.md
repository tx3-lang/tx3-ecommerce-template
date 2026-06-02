# Milestone 3 — Oracle-Driven Escrow Settlement Keeper

> **For the coding agent:** This plan describes **goals, acceptance criteria, and constraints** — not line-by-line code. Implement each task idiomatically following the existing e-commerce patterns. Use TDD where a unit is testable in isolation. This work happens in **this** (e-commerce) repo, which uses **pnpm**, Vitest, TanStack/React, and Supabase.
>
> **Commits:** the USER runs `git commit` / does the final merge. At each commit point, hand over the files to stage and a message. Work on a feature branch (not `main`).

> **Related design spec (read first):** this plan implements **Phase C** of the Milestone 3 design, which lives in the **shipping-oracle** repo:
> - Design + decisions: `shipping-oracle/spec/002-milestone-3.md` (Option A off-chain keeper; the `IN_TRANSIT`→shipped / `DELIVERED`→release mapping; trust model; buyer-initiated refund).
> - SDK plan (already executed/merged): `shipping-oracle/spec/002-milestone-3-plan-1-ts-sdk.md` → the `shipping-oracle-sdk` this keeper consumes.
> References below to "the design spec" mean `shipping-oracle/spec/002-milestone-3.md`.

**Goal:** An oracle-driven settlement keeper in the e-commerce app that consumes the shipping oracle (via the `shipping-oracle-sdk` TypeScript SDK) and drives the existing, deployed escrow: `IN_TRANSIT` → `mark_shipped`, `DELIVERED` → `release`. Refund stays buyer-initiated. Plus keeper-driven e2e tests on local dolos.

**Architecture:** A poll-once CLI (`scripts/settle-escrows.ts`, cron-style, mirroring the existing `scripts/escrow-*.ts`) reads pending/shipped escrows that have a registered tracking number, queries the oracle through the SDK, runs a pure decision function, and calls the existing `submitMarkShipped` / `submitReleaseEscrow` + escrow-table updates. No on-chain change; the escrow validator is reused unchanged.

**Tech Stack:** TypeScript (ESM), pnpm, Vitest (`*.e2e.ts` via `pnpm test:e2e`), Supabase (service-role client), tx3 TRP client, `shipping-oracle-sdk`.

---

## Context from the codebases (verified)

**Escrow off-chain API** (`src/lib/cardano/escrow.ts`) — reuse as-is:
- `submitMarkShipped(orderId): Promise<{ txHash, newUtxoRef: { txHash, outputIndex }, newDatumCbor }>` — requires escrow `status='pending'` and on-chain `NOW() < ship_deadline`.
- `submitReleaseEscrow(orderId): Promise<{ txHash }>` — requires `status='shipped'` and on-chain `NOW() >= grace_period_end`.
- `submitRefundEscrow(orderId, buyerSigner, buyerAddress)` — buyer-initiated; **the keeper does NOT call this**.
- Merchant backend signer: `getMerchantSigner()` (`src/lib/cardano/signer.ts`), env `MERCHANT_SKEY` / `MERCHANT_ADDRESS`.

**Escrow DB** (`escrows` table, `supabase/migrations/20260522_escrows.sql`): `order_id` (UNIQUE), `status ∈ {pending,shipped,released,refunded}`, `ship_deadline`, `grace_period_end`, `utxo_*`, `datum_cbor`, `*_tx_hash`. Helpers in `src/lib/db/escrows.ts` (`getEscrowByOrderId`, etc.).

**CLI/transition pattern** (`scripts/escrow-*.ts`, `scripts/lib/transition.ts`): parse `--order-id` → read row (optimistic) → validate state/time → **submit chain BEFORE DB write** → update `escrows` → print result. The keeper generalizes this to "scan many escrows."

**E2E harness** (`tests/e2e/`, `tests/e2e/_fixtures/dolos.ts`): Vitest, `pnpm test:e2e`; requires a running dolos (`TX3_TRP_ENDPOINT`); `isE2eConfigured()` guard; `insertLockPaymentFixture({orderId, lockTxHash, lockOutputIndex})` seeds escrow(pending)+order+event; `advanceTime(seconds)` waits wall-clock; `getEscrowRow(orderId)` asserts state. Timing env: `ESCROW_SHIP_DEADLINE_SECONDS` / `ESCROW_GRACE_PERIOD_SECONDS` (set to `60` in e2e).

**Config** (`src/lib/cardano/network.ts` `getNetworkConfig()`): env `TX3_TRP_ENDPOINT`, `TX3_PROFILE`, `MERCHANT_ADDRESS`, etc.

**⚠️ Gap to close:** there is **no `carrier`/`tracking_number` column** on `orders` or `escrows` — tracking currently lives only in on-chain metadata (label 1340). The keeper needs `(carrier, tracking_number)` per escrow to query the oracle. Task 2 adds persistent storage.

**SDK to consume** (`shipping-oracle-sdk`, merged to shipping-oracle `main`): `new OracleClient(baseUrl, { expectedPublicKeyHex?, fetchFn? })`, `client.fetchAttestation(carrier, trackingNumber)`, `verifyAttestation`, `OracleStatus`. The injectable `fetchFn` is the e2e stubbing seam.

---

## File Structure (e-commerce repo)

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_escrow_tracking.sql` | Add `carrier` + `tracking_number` to `escrows` |
| `src/lib/oracle/client.ts` | Build an `OracleClient` from env (injectable) |
| `src/lib/oracle/settlement.ts` | `decideEscrowAction()` — pure decision function |
| `src/lib/oracle/settlement.test.ts` | Unit tests for the decision matrix |
| `scripts/settle-escrows.ts` | Poll-once keeper CLI |
| `tests/e2e/_fixtures/oracle.ts` | Build a signed attestation + stub `OracleClient`/`fetchFn` |
| `tests/e2e/escrow_oracle_delivery.e2e.ts` | Delivery → release |
| `tests/e2e/escrow_oracle_refund_blocked.e2e.ts` | Refund blocked after dispatch |
| `tests/e2e/escrow_oracle_no_tracking.e2e.ts` | No-tracking fallback |
| (docs) `shipping-oracle/docs/integration-escrow.md` | Integration guide (in the shipping-oracle repo) |

---

## Task 1: Consume the `shipping-oracle-sdk` via a local `file:` dependency

**Goal:** the e-commerce app can `import { OracleClient } from 'shipping-oracle-sdk'`.

**Mechanism (decided):** a local pnpm `file:` dependency pointing at the built SDK in the shipping-oracle checkout. (pnpm can't install a package from a git subdirectory, and the repos aren't siblings; `file:` is the pragmatic local-dev choice.)

**Acceptance criteria:**
- The SDK's `dist/` is built first: in `shipping-oracle/sdk/typescript`, run `pnpm install && pnpm build` (the `file:` dep resolves `main: ./dist/index.js`, so `dist/` must exist).
- `package.json` declares `"shipping-oracle-sdk": "file:<relative-path-to>/shipping-oracle/sdk/typescript"`. With the current local layout the relative path from the e-commerce repo is `file:../../../tx3-lang/shipping-oracle/sdk/typescript` — **confirm the actual path on the machine** before committing (don't hardcode blindly).
- `pnpm install` resolves it; a trivial smoke check (`new OracleClient('http://x')`) type-checks and runs.

**Constraints & gotchas:**
- The `file:` path is tied to the local machine layout → it is **not portable to CI / other clones**. The keeper e2e (Task 6) therefore runs locally; if CI needs to run it later, switch to a published package or a vendored copy. Note this limitation in the keeper docs (Task 7).
- If the SDK changes, rebuild its `dist/` and re-run `pnpm install` in the e-commerce repo.

**Commit:** `chore: add shipping-oracle-sdk as a local file: dependency`.

---

## Task 2: Persist `carrier` + `tracking_number` for oracle lookup

**Goal:** the keeper can resolve `(carrier, tracking_number)` for each escrow.

**Acceptance criteria:**
- A Supabase migration (`supabase/migrations/<YYYYMMDDNN>_escrow_tracking.sql`, following the existing naming convention) adds **nullable** `carrier text` and `tracking_number text` columns to `escrows`.
- The `Escrow` type in `@types/database.d.ts` is updated with the two optional fields.
- A way to set them exists: extend the shipment-registration path (e.g. the merchant "mark order shipped" flow / a small `--carrier`/`--tracking` arg on the relevant script) to persist them on the escrow row. For the demo, the e2e fixture sets them directly (Task 6).
- Null/absent `tracking_number` is valid and means "no oracle tracking" (keeper skips → manual flow).

**Constraints:** nullable columns; no backfill required. Don't touch the on-chain datum (tracking is off-chain only).

**Commit:** `feat(escrow): persist carrier + tracking_number for oracle settlement`.

---

## Task 3: Oracle client factory

**Goal:** `src/lib/oracle/client.ts` exporting a function that returns a configured `OracleClient`.

**Acceptance criteria:**
- Reads `ORACLE_BASE_URL` (required) and `ORACLE_PUBLIC_KEY` (optional pin) from env, mirroring the `getNetworkConfig()` env pattern (throw `MISSING_ENV: ...` if base URL absent).
- Returns `new OracleClient(baseUrl, { expectedPublicKeyHex })`.
- Accepts an optional injected client/`fetchFn` so tests can stub it (the keeper in Task 5 takes the client as a parameter defaulting to this factory).

**Commit:** `feat(oracle): env-configured OracleClient factory`.

---

## Task 4: Settlement decision logic (pure, unit-tested)

**Goal:** `decideEscrowAction(escrow, oracleStatus, nowMs): 'mark_shipped' | 'release' | 'none'` in `src/lib/oracle/settlement.ts` — the brain, with no chain/DB side effects.

**Acceptance criteria (TDD — write `settlement.test.ts` first):** the matrix, encoding decisions 2/3/5 of the design spec (`shipping-oracle/spec/002-milestone-3.md`):
- `IN_TRANSIT` + escrow `status='pending'` → `'mark_shipped'`.
- `DELIVERED` + escrow `status='shipped'` + `nowMs >= grace_period_end` → `'release'`.
- `DELIVERED` + `status='shipped'` + `nowMs < grace_period_end` → `'none'` (wait for grace).
- `DELIVERED` + `status='pending'` → `'mark_shipped'` (saw delivery before in-transit; mark first, release on a later pass).
- `PRE_TRANSIT` / `NOT_DELIVERED` / `UNKNOWN`, or `status ∈ {released,refunded}` → `'none'`.
- Refund is **never** returned (buyer-initiated, decision 5).

**Constraints:** pure function, fully unit-tested, no imports of DB/chain modules. `grace_period_end` may be null when `pending` — handle safely.

**Commit:** `feat(oracle): pure escrow settlement decision function`.

---

## Task 5: The keeper runner (`scripts/settle-escrows.ts`)

**Goal:** a poll-once CLI that settles all eligible escrows, following the existing `scripts/escrow-*.ts` + `scripts/lib/transition.ts` conventions.

**Acceptance criteria:**
- Reads escrows with `status ∈ {pending, shipped}` AND a non-null `tracking_number` (escrows without tracking are skipped and logged — the no-tracking fallback).
- For each: `oracleClient.fetchAttestation(carrier, tracking_number)`, then `verifyAttestation` (the SDK's `prepareCommitment`/`verifyAttestation` — a bad signature aborts that escrow with a logged error, never settles).
- Runs `decideEscrowAction`; then:
  - `'mark_shipped'` → `submitMarkShipped(orderId)` then update the escrow row exactly as `scripts/escrow-mark-shipped.ts` does (`status='shipped'`, `shipped_tx_hash`, new `utxo_*`, `datum_cbor`, `grace_period_end`).
  - `'release'` → `submitReleaseEscrow(orderId)` then update as `scripts/escrow-release.ts` (`status='released'`, `release_tx_hash`).
  - `'none'` → no-op.
- **Optimistic/idempotent:** chain submit before DB write (Decision A9); re-running never double-acts (gated on current `status` + time + oracle status).
- A `--dry-run` flag logs decisions without submitting.
- Accepts an injected `OracleClient` (defaults to the Task 3 factory) so e2e can stub it.
- `package.json` script alias `"settle-escrows": "tsx scripts/settle-escrows.ts"`.

**Constraints & gotchas:**
- `submitMarkShipped` fails on-chain if `NOW() >= ship_deadline` — so the keeper must detect `IN_TRANSIT` before the ship deadline; log clearly if a mark fails for this reason (that escrow becomes refund-eligible for the buyer).
- Refund is out of the keeper's scope; it MAY log refund-eligible escrows (`pending` + past `ship_deadline`) for visibility, but never submits.
- One escrow's failure must not abort the whole run (catch per-escrow, continue).

**Commit:** `feat(oracle): settle-escrows keeper (IN_TRANSIT→mark_shipped, DELIVERED→release)`.

---

## Task 6: Keeper-driven e2e tests on local dolos

**Goal:** prove the end-to-end behavior (Milestone 3 evidence B2), reusing the existing dolos fixtures.

**Acceptance criteria:**
- `tests/e2e/_fixtures/oracle.ts`: builds a **signed** `OracleAttestation` for a given `(carrier, tracking, status)` using a deterministic test oracle key, and a stub `OracleClient` (or `fetchFn`) that returns it — so `verifyAttestation` passes and the keeper trusts it. The keeper run pins `ORACLE_PUBLIC_KEY` to the test key.
- `escrow_oracle_delivery.e2e.ts`: seed lock fixture **with `carrier`+`tracking_number` set** → run keeper with stub oracle returning `IN_TRANSIT` → assert escrow `status='shipped'`; `advanceTime(61)` → run keeper with stub returning `DELIVERED` → assert `status='released'` + `release_tx_hash` set + on-chain UTxO consumed to merchant.
- `escrow_oracle_refund_blocked.e2e.ts`: lock (+tracking) → keeper `IN_TRANSIT` → `mark_shipped` → attempt buyer refund (existing `escrow-refund` path) → assert it **fails** (escrow no longer `pending`).
- `escrow_oracle_no_tracking.e2e.ts`: lock **without** tracking → run keeper → assert it does nothing (status stays `pending`).
- Guarded by `isE2eConfigured()`; uses `ESCROW_SHIP_DEADLINE_SECONDS=60` / `ESCROW_GRACE_PERIOD_SECONDS=60`.
- The existing `escrow_refund_timeout.e2e.ts` (buyer-initiated timeout refund) is referenced as the B2 timeout evidence — not re-implemented.

**Constraints:** no live oracle/network — stub the oracle via the injected client. Capture the pass/fail output as the B2 report.

**Commit:** `test(e2e): keeper-driven oracle settlement (delivery / refund-blocked / no-tracking)`.

---

## Task 7: Documentation (Milestone 3 deliverable D)

**Goal:** a public integration guide tying the whole milestone together.

**Acceptance criteria (in the shipping-oracle repo, `docs/integration-escrow.md`):**
- End-to-end story: run the oracle → buyer locks escrow → merchant registers tracking → keeper settles on `IN_TRANSIT`/`DELIVERED` → release; or timeout → buyer refund.
- The **trust model** section (off-chain enforcement; the keeper, not the contract, verifies the oracle — decision 1 trade-off).
- The `IN_TRANSIT`→shipped / `DELIVERED`→release mapping (decision 2) and the buyer-initiated refund rationale (decision 5).
- How to run the keeper (`pnpm settle-escrows`, env vars) and the e2e tests.
- Links: the TS + Rust SDKs, the escrow template (e-commerce `aiken/`), and the e-commerce keeper/example.
- Add a link from the e-commerce `README.md` to this guide.

**Commit:** `docs: end-to-end oracle-driven escrow integration guide`.

---

## Self-Review (against the design spec `shipping-oracle/spec/002-milestone-3.md`)

- Phase C keeper (`IN_TRANSIT`→mark_shipped, `DELIVERED`→release, refund buyer-initiated) → Tasks 3–5. ✓
- Reuse deployed escrow + existing submit functions, no on-chain change → Tasks 4–5 call `submitMarkShipped`/`submitReleaseEscrow`. ✓
- `carrier`/`tracking_number` persistence gap → Task 2 (flagged by exploration). ✓
- B2 evidence (delivery / timeout / no-tracking) on local dolos → Task 6 (+ reuse of `escrow_refund_timeout.e2e.ts`). ✓
- SDK consumed (Plan 1 hand-off) → Task 1. ✓
- D docs + trust model + mapping + refund limitation → Task 7. ✓
- No code-transcription blocks (plan-style preference); hard contracts kept as acceptance criteria. ✓
- Task 1 dependency mechanism: decided — local `file:` dependency (npm/git deferred). ✓
