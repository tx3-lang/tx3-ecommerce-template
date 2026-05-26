# Milestone 3 / Feature B — On-chain Escrow Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock buyer payments in a Plutus script address controlled by an Aiken validator. Funds release to the merchant only after an on-chain Shipped transition + grace period; the buyer can refund if the merchant fails to ship within `ship_deadline`. Produces verifiable preview tx hashes for milestone evidence B2.

**Architecture:** A value-agnostic Aiken validator with three redeemers (`MarkShipped`, `Release`, `Refund`) drives a Pending → Shipped → Released/Refunded state machine on a single UTxO per order. The buyer's checkout flow changes from "pay merchant" to "lock to script address". Merchant transitions and buyer refunds are driven by CLI scripts signing with `tx3-sdk`.

**Tech Stack:** Aiken (Plutus V3), TypeScript, `tx3-sdk`, Supabase (PostgreSQL), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-20-milestone-3-escrow-design.md`
**Cross-cutting decisions:** `docs/superpowers/specs/2026-05-20-milestone-3-overview.md`
**Depends on:** plan A (chain plumbing in `src/lib/cardano/{network,u5c-client,signer}.ts` must exist and pass tests).

**Convention notes:**
- No code blocks in this plan by user preference. Each step states its goal; technical details (datum, redeemer, schemas, payload shape) live in the spec.
- Every TypeScript task closes with `pnpm lint && pnpm check && pnpm test`. Aiken tasks close with `aiken check`.
- Migration filename placeholder `2026MMDD` is replaced at implementation time with the current YYYYMMDD.

---

### Task 1: Aiken project bootstrap

**Goal:** Stand up the `aiken/` workspace, CI integration, and an empty validator scaffold so subsequent tasks have a build pipeline to verify against.

**Files:**
- Create: `aiken/aiken.toml`
- Create: `aiken/validators/escrow.ak` (empty validator skeleton)
- Create: `aiken/lib/escrow_types.ak` (empty module placeholder)
- Create: `.github/workflows/aiken-check.yml`
- Modify: `.gitignore` (ignore `aiken/build/` if present)

**Spec reference:** Escrow design §"Components" (Aiken files), §"Testing strategy" §"CI integration".

- [ ] **Step 1: Read the latest Aiken docs for project layout** — Confirm the conventions (`aiken.toml`, `validators/`, `lib/`, `plutus.json` output location) before writing files.
- [ ] **Step 2: Write `aiken/aiken.toml`** — Goal: project name `e-commerce-validators`, version `0.1.0`, network `preview` for the runtime config, with `aiken-lang/stdlib` as a dependency at the latest stable version.
- [ ] **Step 3: Write the empty `escrow.ak` scaffold** — Goal: declares the validator with the expected signature but a body that always rejects. Compiles cleanly under `aiken check`.
- [ ] **Step 4: Write the CI workflow `aiken-check.yml`** — Goal: triggers on PRs touching `aiken/**`; installs Aiken; runs `aiken check`. Follow the existing `.github/workflows/lint.yml` for environment + action conventions.
- [ ] **Step 5: Run `aiken check`** — Expected: PASS (only the scaffold compiles; no real tests yet).
- [ ] **Step 6: Commit** — `feat(aiken): bootstrap escrow validator project + CI`.

---

### Task 2: Escrow types in Aiken

**Goal:** Define `EscrowDatum` and `EscrowRedeemer` exactly as the spec describes so all validator code references the same types.

**Files:**
- Modify: `aiken/lib/escrow_types.ak`
- Create: `aiken/lib/escrow_types_test.ak` (or inline tests in `escrow_types.ak`)

**Spec reference:** Escrow design §"Validator" §"Datum" and §"Redeemers".

- [ ] **Step 1: Write the type definitions** — Goal: `EscrowDatum { buyer, merchant, order_id, paid_at, ship_deadline, grace_period_end: Option<PosixTime> }` and `EscrowRedeemer { MarkShipped { shipped_at }, Release, Refund }` per the spec.
- [ ] **Step 2: Write inline Aiken tests for type round-trips** — Goal: a Pending datum (`grace_period_end = None`) and a Shipped datum (`grace_period_end = Some(t)`) round-trip through Plutus Data encoding without loss. Optional but useful as a sanity check.
- [ ] **Step 3: Run `aiken check`** — Expected: PASS.
- [ ] **Step 4: Commit** — `feat(aiken): add EscrowDatum and EscrowRedeemer types`.

---

### Task 3: Validator — `MarkShipped` redeemer with tests

**Goal:** Implement and verify the Pending → Shipped transition rules.

**Files:**
- Modify: `aiken/validators/escrow.ak`

**Spec reference:** Escrow design §"Rules" (MarkShipped row), §"Validator edge cases".

- [ ] **Step 1: Write failing tests in `escrow.ak`** — One Aiken `test` block per row in the spec's MarkShipped section, covering: `mark_shipped_success`, `mark_shipped_wrong_signer`, `mark_shipped_shipped_at_outside_range`, `mark_shipped_datum_mutated`, `mark_shipped_already_shipped`. Each test constructs the transaction context inline using stdlib helpers.
- [ ] **Step 2: Run `aiken check`** — Expected: FAIL (validator still rejects everything).
- [ ] **Step 3: Implement the MarkShipped branch of the validator** — Goal: checks merchant signature, `grace_period_end == None` on input datum, `shipped_at` within tx validity range, and output datum matches input datum with only `grace_period_end` mutated to `Some(shipped_at + grace_period_constant)`. The `grace_period_constant` is read from a compile-time parameter of the validator (or hardcoded for now — see Step 4).
- [ ] **Step 4: Decide grace_period parameterisation** — Two options to consider: (a) compile-time validator parameter so the script address differs per env; (b) hardcoded constant requiring rebuild per env. Pick (a) only if the tx3-sdk and spec env vars cleanly support it; otherwise (b) plus document the implication in the spec's "Open questions". Default for milestone: (b), hardcoded as a `pub const` in the validator file with the production default (14 days). Preview demo uses the same value because grace_period_constant is enforced on-chain in slots, and we'll shorten the off-chain trigger windows instead.
- [ ] **Step 5: Run `aiken check`** — Expected: PASS for MarkShipped tests.
- [ ] **Step 6: Commit** — `feat(aiken): implement and test MarkShipped redeemer`.

---

### Task 4: Validator — `Release` redeemer with tests

**Goal:** Implement and verify the Shipped → Released transition.

**Files:**
- Modify: `aiken/validators/escrow.ak`

**Spec reference:** Escrow design §"Rules" (Release row), §"Validator edge cases".

- [ ] **Step 1: Write failing tests** — `release_success`, `release_before_grace_period`, `release_pending_state`, `release_wrong_signer`.
- [ ] **Step 2: Run `aiken check`** — Expected: FAIL.
- [ ] **Step 3: Implement the Release branch** — Goal: requires `grace_period_end == Some(t)` and `tx.valid_from >= t` and merchant signature. No output constraint (tx builder handles value routing).
- [ ] **Step 4: Run `aiken check`** — Expected: PASS for Release tests (plus MarkShipped still passes).
- [ ] **Step 5: Commit** — `feat(aiken): implement and test Release redeemer`.

---

### Task 5: Validator — `Refund` redeemer with tests

**Goal:** Implement and verify the Pending → Refunded transition.

**Files:**
- Modify: `aiken/validators/escrow.ak`

**Spec reference:** Escrow design §"Rules" (Refund row), §"Validator edge cases".

- [ ] **Step 1: Write failing tests** — `refund_success`, `refund_before_deadline`, `refund_shipped_state`, `refund_wrong_signer`.
- [ ] **Step 2: Run `aiken check`** — Expected: FAIL.
- [ ] **Step 3: Implement the Refund branch** — Goal: requires `grace_period_end == None` (input must be Pending), `tx.valid_from >= ship_deadline`, and buyer signature.
- [ ] **Step 4: Run `aiken check`** — Expected: ALL 13 tests pass.
- [ ] **Step 5: Build and commit `plutus.json`** — Run: `aiken build`. The generated `aiken/plutus.json` must be committed so downstream (tx3, ts) can load the validator without rebuilding Aiken.
- [ ] **Step 6: Commit** — `feat(aiken): implement and test Refund redeemer + build plutus.json`.

---

### Task 6: `escrows` migration

**Goal:** Add the DB table that tracks one escrow lifecycle per order.

**Files:**
- Create: `supabase/migrations/2026MMDD_escrows.sql`

**Spec reference:** Escrow design §"`escrows` schema".

- [ ] **Step 1: Inspect existing migrations** — Note `2026020504_shipping_info.sql` and the most recent ones for naming/RLS patterns.
- [ ] **Step 2: Write the migration** — Goal: matches the spec schema (all columns, CHECK on status, UNIQUE on order_id, indexes, RLS for select by wallet_address of the joined order).
- [ ] **Step 3: Apply locally** — Run: `pnpm supabase db reset --local` (or project equivalent). Expected: clean apply.
- [ ] **Step 4: Verify schema with `\d escrows`** — Confirm columns and indexes.
- [ ] **Step 5: Commit** — `feat(db): add escrows table for on-chain escrow state`.

---

### Task 7: Type declarations and repo helpers for `escrows`

**Goal:** Typed access from TS to the `escrows` table; embed `escrow` in `Order` for eager loads.

**Files:**
- Modify: `@types/database.d.ts`
- Modify: `src/hooks/use-orders.ts`
- Create: `src/server-fns/escrows.ts`
- Create: `src/server-fns/__tests__/escrows.test.ts`

**Spec reference:** Escrow design §"Modified files", §"Components" (`escrows` row in modified files).

- [ ] **Step 1: Write failing tests for the repo helpers**
  - Test: `insertEscrow` inserts the row, returns it.
  - Test: a second insert with the same `order_id` raises a typed `DUPLICATE_ESCROW` (one-to-one with orders).
  - Test: `getEscrowByOrderId(orderId)` returns the row when present; null when absent.
  - Test: `updateEscrowState(orderId, transition)` applies the documented field set for each transition (pending → shipped sets `shipped_tx_hash`, `grace_period_end`, new `utxo_tx_hash`, new `utxo_output_index`, new `datum_cbor`; shipped → released sets `release_tx_hash`; pending → refunded sets `refund_tx_hash`).
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Add `Escrow` to `@types/database.d.ts` and `escrow?: Escrow` to `Order`** — Goal: matches the spec.
- [ ] **Step 4: Implement `src/server-fns/escrows.ts`** — Goal: the three helpers above using the service-role Supabase client, following the project's existing pattern.
- [ ] **Step 5: Modify `src/hooks/use-orders.ts`** — Eager-load `escrows` row alongside `order_events`.
- [ ] **Step 6: Run the tests** — Expected: PASS.
- [ ] **Step 7: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 8: Commit** — `feat(db): add escrows repo helpers and types`.

---

### Task 8: tx3 escrow transactions

**Goal:** Define the five tx3 transactions that span the escrow lifecycle (`lock_escrow_ada`, `lock_escrow_tokens`, `mark_shipped`, `release_escrow`, `refund_escrow`) plus introduce the `Escrow` script party referencing the Aiken validator.

**Files:**
- Modify: `tx3/main.tx3`
- Modify: `tx3/trix.toml` (point at `aiken/plutus.json`)
- Regenerated: `src/lib/tx3/protocol.ts`

**Spec reference:** Escrow design §"Modified files" (tx3 section), §"Validator" (referenced from tx3).

- [ ] **Step 1: Add `party Escrow as Script(...)` to `tx3/main.tx3`** — Goal: references the escrow validator from `aiken/plutus.json` via the convention supported by tx3 (read the latest tx3 docs / web-sdk examples for the exact syntax; do not invent).
- [ ] **Step 2: Remove the old `pay_with_ada` and `pay_with_tokens` from `tx3/main.tx3`** — Goal: all orders now lock to escrow, per the milestone-mode scope decision.
- [ ] **Step 3: Add `lock_escrow_ada(quantity, buyer_pkh, merchant_pkh, order_id, ship_deadline, grace_period)`** — Goal: buyer-paid lock producing an output to the script address with the datum described in the spec.
- [ ] **Step 4: Add `lock_escrow_tokens(...)`** — Same shape with native-token bundles + min-ADA.
- [ ] **Step 5: Add `mark_shipped(escrow_utxo, shipped_at)`** — Spends the Pending UTxO with the MarkShipped redeemer and re-locks at the script address with the updated datum.
- [ ] **Step 6: Add `release_escrow(escrow_utxo)`** — Spends the Shipped UTxO with the Release redeemer; output routes full value to the merchant.
- [ ] **Step 7: Add `refund_escrow(escrow_utxo)`** — Spends the Pending UTxO with the Refund redeemer; output routes full value to the buyer.
- [ ] **Step 8: Update `tx3/trix.toml`** — Reference `aiken/plutus.json` so tx3 can resolve the script hash.
- [ ] **Step 9: Regenerate the ts-client** — Run: `pnpm trix bindgen`. Commit the regenerated `src/lib/tx3/protocol.ts`.
- [ ] **Step 10: Lint + typecheck** — Expected: PASS.
- [ ] **Step 11: Commit** — `feat(tx3): add escrow transactions and remove direct payment txs`.

---

### Task 9: Escrow policy loader (`escrow-policy.ts`)

**Goal:** Small module that loads `aiken/plutus.json` and exposes the script address (derived from the script hash) and the timeout constants from env.

**Files:**
- Create: `src/lib/cardano/escrow-policy.ts`
- Create: `src/lib/cardano/__tests__/escrow-policy.test.ts`

**Spec reference:** Escrow design §"Components" (escrow-policy.ts row), §"Environment variables".

- [ ] **Step 1: Write failing tests**
  - Test: `getScriptAddress()` returns a bech32 address with the correct network prefix derived from a fixture `plutus.json`.
  - Test: `getShipDeadlineSeconds()` reads from env with the documented default.
  - Test: `getGracePeriodSeconds()` reads from env with the documented default.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `escrow-policy.ts`** — Goal: thin wrapper. Read `plutus.json`, derive the script hash + address (using the address utilities from `tx3-sdk` or `@emurgo/cardano-serialization-lib-nodejs` if needed), read env via `getNetworkConfig()` extension or direct env reads with validation.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(cardano): add escrow policy loader`.

---

### Task 10: Escrow orchestrator (`escrow.ts`) — lock

**Goal:** TS orchestrator function for the buyer's lock transaction. This is the only escrow function that uses a CIP-30 buyer signer instead of the backend signer.

**Files:**
- Create: `src/lib/cardano/escrow.ts`
- Create: `src/lib/cardano/__tests__/escrow.test.ts`

**Spec reference:** Escrow design §"Components" (`escrow.ts` row), §"Data flow" §"Scenario 1 — Buyer pays".

- [ ] **Step 1: Write failing tests for `submitLockEscrow`**
  - Test: builds the lock tx with the documented datum (`buyer`, `merchant`, `order_id`, `paid_at`, `ship_deadline`, `grace_period_end = None`).
  - Test: routes the value (ADA or token bundle + min-ADA) to the script address from `escrow-policy.ts`.
  - Test: returns `{ lockTxHash, lockOutputIndex, datumCbor }` once `waitForConfirmed` resolves.
  - Test: surfaces `ChainUnavailable` from the u5c wrapper unchanged.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `submitLockEscrow(orderId, value, buyerSigner)`** — Goal: orchestrates `Tx3Client` with the provided buyer signer (a CIP-30 signer from the browser), calls `lock_escrow_ada` or `lock_escrow_tokens` based on the value shape, returns the documented result.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(cardano): add escrow orchestrator — lock path`.

---

### Task 11: Escrow orchestrator — MarkShipped, Release, Refund

**Goal:** The three merchant- or buyer-driven state transitions, sharing a common build/sign/submit pipeline.

**Files:**
- Modify: `src/lib/cardano/escrow.ts`
- Modify: `src/lib/cardano/__tests__/escrow.test.ts`

**Spec reference:** Escrow design §"Data flow" §"Scenarios 2-4".

- [ ] **Step 1: Write failing tests for the three functions**
  - Test (`submitMarkShipped(orderId)`): reads current escrow row, builds the `mark_shipped` tx with the correct redeemer + datum mutation, signs with backend signer, returns `{ txHash, newUtxoRef, newDatumCbor }`.
  - Test (`submitReleaseEscrow(orderId)`): builds the `release_escrow` tx with `validity_range.from = NOW()`, signs with backend signer, returns `{ txHash }`.
  - Test (`submitRefundEscrow(orderId, buyerSigner)`): builds the `refund_escrow` tx with `validity_range.from = NOW()`, signs with the provided buyer signer, returns `{ txHash }`.
  - Test (each): the three pipelines share a private helper for `Tx3Client` setup + waitForConfirmed handling.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement the three functions** — Goal: extract the shared pipeline; each function differs only in which tx3 transaction it invokes, which signer it uses, and how it shapes the result.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(cardano): add escrow state-transition orchestrators`.

---

### Task 12: Checkout integration — replace direct payment with lock

**Goal:** Buyer checkout now locks funds into the escrow script address. The payment confirmation server-fn writes the `escrows` row and inserts the `paid` event in `order_events` (no separate trace tx, per the spec).

**Files:**
- Modify: `src/lib/cardano-payment.ts`
- Modify: `src/components/checkout/PaymentStep.tsx`
- Modify: `src/server-fns/payments.ts`
- Modify: existing checkout tests (read first; update as needed)
- Add: tests for the new server-fn behaviour

**Spec reference:** Escrow design §"Data flow" §"Scenario 1", §"Modified files" rows for cardano-payment.ts, PaymentStep.tsx, payments.ts, traceability.ts.

- [ ] **Step 1: Read the current `cardano-payment.ts` and `PaymentStep.tsx`** — Map the existing call sites that invoke `pay_with_ada` / `pay_with_tokens`. Confirm what state and props they pass.
- [ ] **Step 2: Write failing tests for the new behaviour**
  - Test (`cardano-payment.ts`): for an ADA order, the build path now calls `submitLockEscrow` with the ADA-shaped value; for a token order, with the token-bundle value.
  - Test (`payments.ts` server-fn): after the lock tx is provided by the client, the server-fn inserts an `escrows` row with `status='pending'`, sets the order's `cardano_tx_hash`, and inserts an `order_events` row with `event_type='paid'`, `tx_hash = lockTxHash`, and `confirmed_at = NOW()`. No separate `submitPaidTrace` call.
  - Test (PaymentStep copy): renders the escrow-explanation copy described in the spec.
- [ ] **Step 3: Run the tests** — Expected: FAIL.
- [ ] **Step 4: Modify `src/lib/cardano-payment.ts`** — Goal: replace the direct-payment calls with `submitLockEscrow`. Maintain backward-compatible function names where possible (the consumer in PaymentStep keeps its interface).
- [ ] **Step 5: Modify `src/components/checkout/PaymentStep.tsx`** — Goal: update copy to explain escrow per the spec. Keep all existing UI structure.
- [ ] **Step 6: Modify `src/server-fns/payments.ts`** — Goal: accept `{ orderId, lockTxHash, lockOutputIndex, datumCbor }` from the client, run the inserts described in the test in one SQL transaction. Remove or skip the previous `submitPaidTrace` call from plan A's Task 9 because escrow lock now is the paid event.
- [ ] **Step 7: Run the tests** — Expected: PASS.
- [ ] **Step 8: Smoke test against dolos** — Run `pnpm dev` against `.env.local`, complete a checkout, confirm the `escrows` row + `order_events` row exist and the buyer's wallet shows the locked-funds tx.
- [ ] **Step 9: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 10: Commit** — `feat(checkout): lock funds into escrow on payment`.

---

### Task 13: Update traceability orchestrator to skip the separate paid trace when escrow exists

**Goal:** Avoid emitting a redundant `paid` trace tx when an order has an escrow row — the lock tx already records the payment.

**Files:**
- Modify: `src/lib/cardano/traceability.ts`
- Modify: `src/lib/cardano/__tests__/traceability.test.ts`

**Spec reference:** Escrow design §"Modified files" (`src/lib/cardano/traceability.ts` row).

- [ ] **Step 1: Write failing tests**
  - Test: `submitPaidTrace(orderId)` returns the lock tx hash without submitting anything new when an `escrows` row exists for the order.
  - Test: `submitPaidTrace(orderId)` falls back to the previous metadata-only path when no `escrows` row exists. (This branch keeps plan A's behaviour for any future non-escrow flow.)
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Modify `submitPaidTrace`** — Goal: lookup the escrow row; if present, return `{ txHash: escrow.utxo_tx_hash, confirmed: true }`; otherwise behave as before.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `refactor(cardano): skip paid trace tx when escrow exists`.

---

### Task 14: CLI script `escrow-mark-shipped`

**Goal:** `pnpm tsx scripts/escrow-mark-shipped.ts --order-id <uuid> [--tracking <code>]` validates state, calls `submitMarkShipped`, updates DB atomically.

**Files:**
- Create: `scripts/escrow-mark-shipped.ts`
- Create: `scripts/__tests__/escrow-mark-shipped.test.ts`

**Spec reference:** Escrow design §"Data flow" §"Scenario 2", §"Error handling".

- [ ] **Step 1: Write failing tests**
  - Test: arg parsing — rejects missing `--order-id`.
  - Test: acquires `SELECT ... FOR UPDATE` on `escrows`; asserts `status='pending'` and `NOW() < ship_deadline`.
  - Test: on success, updates `escrows` (status, new utxo refs, grace_period_end, shipped_tx_hash, datum_cbor) + `orders.status='shipped'` + inserts `order_events` row with `event_type='shipped'` in one SQL transaction.
  - Test: on submission failure, rolls back; state unchanged.
  - Test: aborts with `SHIP_DEADLINE_EXCEEDED` when past the deadline.
  - Test: prints tx hash + explorer URL on success.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement the script** — Goal: same pattern as plan A's `mark-order-shipped`, but invokes `submitMarkShipped` from escrow orchestrator and updates the `escrows` row alongside the order + event.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Smoke test against dolos** — Use the existing e2e fixture to lock then mark-shipped; verify the new UTxO at the script address and DB state.
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(scripts): add escrow-mark-shipped CLI`.

---

### Task 15: CLI scripts `escrow-release` and `escrow-refund`

**Goal:** The remaining state transitions, each driven by its own CLI.

**Files:**
- Create: `scripts/escrow-release.ts`
- Create: `scripts/escrow-refund.ts`
- Create: `scripts/__tests__/escrow-release.test.ts`
- Create: `scripts/__tests__/escrow-refund.test.ts`

**Spec reference:** Escrow design §"Data flow" §"Scenarios 3 and 4".

- [ ] **Step 1: Write failing tests for `escrow-release`**
  - Test: asserts `status='shipped'` and `NOW() >= grace_period_end`; otherwise aborts with `GRACE_PERIOD_NOT_ELAPSED` or `INVALID_STATE`.
  - Test: on success, updates `escrows.status='released'`, `release_tx_hash`, `orders.status='completed'`, inserts `order_events` with `event_type='completed'`.
- [ ] **Step 2: Write failing tests for `escrow-refund`**
  - Test: asserts `status='pending'` and `NOW() >= ship_deadline`; otherwise aborts.
  - Test: requires `--buyer-key <hex>` flag (test buyer key for milestone-mode).
  - Test: on success, updates `escrows.status='refunded'`, `refund_tx_hash`, `orders.status='cancelled'`, inserts `order_events` with `event_type='cancelled'` and `data.reason='ship_deadline_exceeded'`.
- [ ] **Step 3: Run the tests** — Expected: FAIL.
- [ ] **Step 4: Implement both scripts** — Goal: extract a shared transition helper (e.g., `scripts/lib/escrow-transition.ts`) if it makes the code clearer; each script differs in the orchestrator call and the resulting DB updates.
- [ ] **Step 5: Run the tests** — Expected: PASS.
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(scripts): add escrow-release and escrow-refund CLIs`.

---

### Task 16: CLI script `reconcile-escrow`

**Goal:** Walk `escrows` rows whose `utxo_tx_hash` no longer matches the script-address state on chain and resync (status, utxo refs, possibly missing event rows).

**Files:**
- Create: `scripts/reconcile-escrow.ts`
- Create: `scripts/__tests__/reconcile-escrow.test.ts`

**Spec reference:** Escrow design §"Error handling" (script-crash-between-submit-and-commit row), §"Data flow" §"UTxO ↔ DB synchronisation".

- [ ] **Step 1: Write failing tests**
  - Test: detects rows where the recorded UTxO is not in the current UTxO set at the script address.
  - Test: for a row where chain shows a Shipped UTxO but DB shows Pending, updates `escrows.status='shipped'`, new utxo refs, `grace_period_end`, `shipped_tx_hash`, and inserts the missing `order_events` row.
  - Test: for a row where chain shows the UTxO consumed (no replacement, no script output), detects this as Released or Refunded by reading the consuming tx and updates accordingly.
  - Test: prints a summary at the end (count by transition).
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `scripts/reconcile-escrow.ts`** — Goal: use the u5c client to fetch UTxOs at the script address (filter by datum's order_id field, or scan all and demultiplex). The exact API depends on u5c's filter capabilities; if filtering by datum is not supported, scan all + filter in TS.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(scripts): add reconcile-escrow CLI`.

---

### Task 17: Buyer UI — escrow state on order confirmation

**Goal:** The order-confirmation page surfaces the escrow's current state (Pending / Shipped / Released / Refunded), countdown to the next deadline, and a link to the lock tx.

**Files:**
- Create: `src/components/order/EscrowStatusCard.tsx`
- Create: `src/components/order/__tests__/EscrowStatusCard.test.tsx`
- Modify: `src/routes/order-confirmation.$orderId.tsx`

**Spec reference:** Escrow design §"Modified files" (`order-confirmation.$orderId.tsx` row).

- [ ] **Step 1: Write failing tests for `EscrowStatusCard`**
  - Test: renders correct label per `escrow.status` value.
  - Test: shows countdown to `ship_deadline` when status is `pending`; shows countdown to `grace_period_end` when `shipped`.
  - Test: shows a link to the lock tx on the explorer matching the network profile.
  - Test: hides the deadline countdown for `released` / `refunded` (terminal states).
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `EscrowStatusCard`** — Goal: pure presentational, follows the project's styling conventions.
- [ ] **Step 4: Wire it into `order-confirmation.$orderId.tsx`** — Goal: render above (or beside) the existing summary and the timeline from plan A's Task 13.
- [ ] **Step 5: Manual UI verification** — Run `pnpm dev` against `.env.local`; create an order with each state and confirm the card renders correctly. (For terminal states this requires the e2e fixture from Task 18.)
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(order): show escrow state on order confirmation`.

---

### Task 18: E2E test suite against dolos

**Goal:** Verify the full escrow lifecycle end-to-end against the local dolos node with short timeouts. Covers the 7 e2e scenarios from the spec.

**Files:**
- Create: `tests/e2e/escrow_happy_release.e2e.ts`
- Create: `tests/e2e/escrow_refund_timeout.e2e.ts`
- Create: `tests/e2e/escrow_refund_after_shipped_fails.e2e.ts`
- Create: `tests/e2e/escrow_release_before_grace_fails.e2e.ts`
- Create: `tests/e2e/escrow_double_mark_shipped_fails.e2e.ts`
- Create: `tests/e2e/escrow_reconcile_after_crash.e2e.ts`
- Create: `tests/e2e/escrow_with_tokens.e2e.ts`
- Create: `tests/e2e/_fixtures/dolos.ts` (shared setup + slot-advance helper)
- Modify: `package.json` (add `test:e2e` script if not present)

**Spec reference:** Escrow design §"Testing strategy" §"E2E against dolos".

- [ ] **Step 1: Implement the dolos fixture** — Goal: starts a dolos instance (or assumes one is running per docs) seeded with `@buyer` and `@merchant` addresses; exposes `advanceSlots(n)` and `cleanup()`. Test setup uses `ESCROW_SHIP_DEADLINE_SECONDS=60`, `ESCROW_GRACE_PERIOD_SECONDS=60`.
- [ ] **Step 2: Write `escrow_happy_release.e2e.ts`** — Asserts: lock → +61s → mark-shipped → +61s → release results in `orders.status='completed'`, `escrows.status='released'`, 3 event rows, all tx hashes resolvable via u5c.
- [ ] **Step 3: Write `escrow_refund_timeout.e2e.ts`** — Asserts: lock → +61s → refund results in `orders.status='cancelled'`, `escrows.status='refunded'`, paid + cancelled event rows.
- [ ] **Step 4: Write `escrow_refund_after_shipped_fails.e2e.ts`** — Asserts: lock → mark-shipped → refund attempt aborts; UTxO stays Shipped.
- [ ] **Step 5: Write `escrow_release_before_grace_fails.e2e.ts`** — Asserts: lock → mark-shipped → release without slot advance aborts with `GRACE_PERIOD_NOT_ELAPSED`.
- [ ] **Step 6: Write `escrow_double_mark_shipped_fails.e2e.ts`** — Asserts: second mark-shipped on the same order aborts on state check.
- [ ] **Step 7: Write `escrow_reconcile_after_crash.e2e.ts`** — Asserts: manual on-chain mark-shipped (via tx3-sdk direct, bypassing the script) leaves DB out of sync; `reconcile-escrow` restores it including the missing event row.
- [ ] **Step 8: Write `escrow_with_tokens.e2e.ts`** — Asserts: happy release with a token bundle delivers tokens + min-ADA to the merchant.
- [ ] **Step 9: Run all 7 e2e tests** — Run: `pnpm test:e2e`. Expected: ALL PASS.
- [ ] **Step 10: Commit** — `test(escrow): add full e2e suite against dolos`.

---

### Task 19: Preview evidence run

**Goal:** Execute Scenarios A (happy release) and B (refund) against preview; capture 6 tx hashes; append to `docs/advanced-onchain.md` for B2.

**Files:**
- Modify: `docs/advanced-onchain.md`

**Spec reference:** Escrow design §"Preview evidence run".

- [ ] **Step 1: Configure `.env.preview` with demo timeouts** — `ESCROW_SHIP_DEADLINE_SECONDS=300`, `ESCROW_GRACE_PERIOD_SECONDS=300`.
- [ ] **Step 2: Run Scenario A** — Lock 10 ADA from a real preview wallet; capture lock tx hash. Wait at least one block, run `escrow-mark-shipped`; capture hash. Wait 5+ minutes, run `escrow-release`; capture hash.
- [ ] **Step 3: Verify funds at merchant address** — Use `preview.cexplorer.io` to confirm the merchant address received the released value.
- [ ] **Step 4: Run Scenario B** — Lock 10 ADA from the same wallet (new order); capture hash. Wait 5+ minutes; run `escrow-refund` with the test buyer key (or the real buyer wallet if implementation allows); capture hash.
- [ ] **Step 5: Verify funds returned to buyer address** — Confirm via explorer.
- [ ] **Step 6: Append to `docs/advanced-onchain.md`** — Add a "Feature B — Escrow" section with the 6 hashes (3 per scenario) as markdown links to `preview.cexplorer.io`. Include the demo timeout values for reproducibility.
- [ ] **Step 7: Commit** — `docs: capture milestone 3 escrow evidence`.

---

## Self-review

**Spec coverage check:**
- B1 (escrow held + released by shipping trigger, 2 tested scenarios) → Tasks 18 (e2e) and 19 (preview evidence) cover both happy release and refund.
- B2 (link to on-chain transactions for 2 release scenarios) → Task 19.
- Validator architecture (Pending → Shipped → Released/Refunded with the 13 edge cases) → Tasks 3-5.
- Multi-currency (ADA + tokens) → Tasks 8 (lock_escrow_tokens), 18 (escrow_with_tokens.e2e.ts).
- Race / crash safety → Tasks 14-15 (SELECT FOR UPDATE) and Task 16 (reconcile-escrow).
- Buyer-facing escrow visibility → Task 17.
- Off-chain integration with traceability (no redundant paid trace) → Task 13.

**Placeholder scan:** No "TBD" / "implement later". `2026MMDD` migration filename convention is the only placeholder, called out in Task 6.

**Consistency:** Function names used across tasks (`submitLockEscrow`, `submitMarkShipped`, `submitReleaseEscrow`, `submitRefundEscrow`, `getScriptAddress`, `getShipDeadlineSeconds`, `getGracePeriodSeconds`, `insertEscrow`, `getEscrowByOrderId`, `updateEscrowState`) appear with the same spelling everywhere. The Aiken types (`EscrowDatum`, `EscrowRedeemer`, `MarkShipped`, `Release`, `Refund`) match the spec exactly.

**Cross-plan dependency:** Task 12 (checkout integration) and Task 13 (traceability skip) modify code introduced by plan A's Tasks 7 and 9. Implementing this plan requires plan A to be merged or at least the relevant tasks completed.

**Out of scope (per milestone-mode trim):** buyer-facing refund UI, on-chain arbitration, partial release, per-order configurable timeouts. Documented under "Open questions / future improvements" in the spec.
