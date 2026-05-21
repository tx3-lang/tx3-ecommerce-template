# Milestone 3 / Feature A — On-chain Traceability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist key order-lifecycle events to Cardano as metadata-only transactions, with a buyer-facing timeline UI. Produces verifiable preview tx hashes for milestone evidence A2.

**Architecture:** Backend signer (`Ed25519Signer` from `tx3-sdk`) + u5c provider against dolos (local) or preview (evidence). Buyer payment confirmation triggers a synchronous `paid` event submission via server-fn. Merchant-driven events (shipped, completed, cancelled) are submitted by CLI scripts. Order events are persisted in a new `order_events` table joined to `orders`.

**Tech Stack:** TypeScript, TanStack Start, Supabase (PostgreSQL), `tx3-sdk` (resolve / sign / submit / waitForConfirmed), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-20-milestone-3-traceability-design.md`
**Cross-cutting decisions:** `docs/superpowers/specs/2026-05-20-milestone-3-overview.md`

**Convention notes:**
- No code blocks in this plan by user preference. Each step states its goal; technical details (types, schemas, payload shape) live in the spec.
- Every task closes with `pnpm lint && pnpm check && pnpm test`. All three must pass before commit.
- Migration filename placeholder `2026MMDD` is replaced at implementation time with the current YYYYMMDD.

---

### Task 1: Phase 0 — Network config module

**Goal:** Provide a single source of truth for runtime chain configuration (TRP endpoint, profile, metadata label, merchant address). Loaded once at process start; throws loudly when required env vars are missing.

**Files:**
- Create: `src/lib/cardano/network.ts`
- Create: `src/lib/cardano/__tests__/network.test.ts`

**Spec reference:** Overview §5 (env vars), Traceability design §"Components".

- [ ] **Step 1: Write failing tests for network config loader**
  - Test: returns config when all required env vars are set.
  - Test: throws `MISSING_ENV` with the var name when any required var is missing.
  - Test: selects profile (`local` | `preview`) from `TX3_PROFILE` exactly.
  - Test: defaults `METADATA_LABEL` to `1337` when unset.
- [ ] **Step 2: Run the tests** — Run: `pnpm test src/lib/cardano/__tests__/network.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `network.ts`** — Goal: export `getNetworkConfig()` returning `{ trpEndpoint, profile, metadataLabel, merchantAddress }`. Read from `process.env` with validation. Memoise the result.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Run: `pnpm lint && pnpm check && pnpm test`. Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(cardano): add network config loader`.

---

### Task 2: Phase 0 — u5c provider wrapper

**Goal:** Wrap the u5c client used by `tx3-sdk` so the rest of the codebase calls into a thin, mockable interface for UTxO reads and tx submission. Same interface for dolos local and preview.

**Files:**
- Create: `src/lib/cardano/u5c-client.ts`
- Create: `src/lib/cardano/__tests__/u5c-client.test.ts`

**Spec reference:** Traceability design §"Components".

- [ ] **Step 1: Write failing tests with a mocked transport**
  - Test: `getMerchantUtxos()` returns the list returned by the underlying client.
  - Test: `submitTx(cbor)` forwards the CBOR and returns the tx hash.
  - Test: transport errors are wrapped in a typed `ChainUnavailable` error with the original cause attached.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `u5c-client.ts`** — Goal: factory `createU5cClient(networkConfig)` returns the two methods above. Use the `tx3-sdk` TRP client internally; do not invent a new transport.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Smoke test against dolos** — Run: `pnpm tsx -e "import { createU5cClient } from './src/lib/cardano/u5c-client'; createU5cClient(...).getMerchantUtxos().then(console.log)"` against the local dolos (requires `.env.local` populated). Document the smoke test in a one-line comment in the test file. (This is a manual verification gate; do not commit smoke-test code.)
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(cardano): add u5c provider wrapper`.

---

### Task 3: Phase 0 — Backend signer module

**Goal:** Provide a memoised `Ed25519Signer` for the merchant, loaded from `MERCHANT_SIGNING_KEY` + `MERCHANT_ADDRESS`. Used by server-fns and CLI scripts.

**Files:**
- Create: `src/lib/cardano/signer.ts`
- Create: `src/lib/cardano/__tests__/signer.test.ts`

**Spec reference:** Overview §1 (merchant signing), §4 (SDK choice).

- [ ] **Step 1: Write failing tests**
  - Test: returns a signer instance when env is populated.
  - Test: throws on missing `MERCHANT_SIGNING_KEY` with a clear message.
  - Test: throws on malformed hex key.
  - Test: signer instance is reused across calls (identity check).
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `signer.ts`** — Goal: export `getMerchantSigner()` returning the cached `Ed25519Signer.fromHex(merchantAddress, signingKeyHex)` from `tx3-sdk`. The function reads env via `getNetworkConfig()` from Task 1.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(cardano): add backend signer module`.

---

### Task 4: Phase 1 — `order_events` migration

**Goal:** Add the table that stores one row per logical order event, with idempotency and RLS aligned with the existing project conventions.

**Files:**
- Create: `supabase/migrations/2026MMDD_order_events.sql`

**Spec reference:** Traceability design §"`order_events` schema".

- [ ] **Step 1: Inspect existing migrations** — Read the most recent migrations under `supabase/migrations/` to copy naming, RLS, and trigger patterns (especially `2026020502_orders_rls_restrict_updates.sql` and `2026020503_wallet_context_setting.sql`).
- [ ] **Step 2: Write the migration** — Goal: matches the schema in the spec exactly (columns, types, CHECK, UNIQUE, indexes, RLS as documented in spec). The `event_type` CHECK and `UNIQUE (order_id, event_type)` must be present.
- [ ] **Step 3: Apply the migration locally** — Run: `pnpm supabase db reset --local` (or equivalent project command). Expected: clean apply, no errors.
- [ ] **Step 4: Verify schema with `\d order_events`** — Confirm columns, indexes, and constraints match the spec.
- [ ] **Step 5: Commit** — `feat(db): add order_events table for on-chain traceability`.

---

### Task 5: Phase 1 — Type declarations and repo helpers

**Goal:** Expose typed access to `order_events` in TypeScript and embed events in `Order` for eager-loaded queries.

**Files:**
- Modify: `@types/database.d.ts`
- Modify: `src/hooks/use-orders.ts` (eager-load events in the existing query)
- Create: `src/server-fns/order-events.ts` (server-side CRUD helpers)
- Create: `src/server-fns/__tests__/order-events.test.ts`

**Spec reference:** Traceability design §"Modified files", §"Components".

- [ ] **Step 1: Write failing tests for the repo helpers (mocked Supabase client)**
  - Test: `insertOrderEvent` inserts the row with the expected shape and returns it.
  - Test: a second insert with the same `(order_id, event_type)` raises a unique-violation that the helper surfaces as a typed `DUPLICATE_EVENT` error.
  - Test: `listOrderEvents(orderId)` returns events ordered by `submitted_at`.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Add `OrderEvent` to `@types/database.d.ts`** — Goal: matches the spec's interface (id, order_id, event_type, tx_hash, payload, submitted_at, confirmed_at).
- [ ] **Step 4: Extend `Order` in `@types/database.d.ts`** — Goal: add `events?: OrderEvent[]`. Do not break existing consumers (the field is optional).
- [ ] **Step 5: Implement `src/server-fns/order-events.ts`** — Goal: export `insertOrderEvent`, `listOrderEvents`, `markEventConfirmed`. Uses the service-role Supabase client following the project's existing pattern from `src/server-fns/orders.ts`.
- [ ] **Step 6: Modify `src/hooks/use-orders.ts`** — Goal: eager-load `order_events` in the Supabase query so the order-confirmation page receives events without a second roundtrip.
- [ ] **Step 7: Run the tests** — Expected: PASS.
- [ ] **Step 8: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 9: Commit** — `feat(db): add order_events repo helpers and types`.

---

### Task 6: Phase 2 — tx3 `record_order_event` transaction

**Goal:** Define a tx3 transaction that produces a metadata-only self-payment for the merchant, used by every event in the traceability flow.

**Files:**
- Modify: `tx3/main.tx3`
- Modify: `tx3/trix.toml` (add `local` and `preview` profiles)
- Regenerated: `src/lib/tx3/protocol.ts` (auto-generated by `trix`)

**Spec reference:** Traceability design §"Modified files" (`tx3/main.tx3`), Overview §5 (profiles).

- [ ] **Step 1: Read the current `tx3/main.tx3`** — Understand the existing party + tx conventions (`pay_with_ada`, `pay_with_tokens`).
- [ ] **Step 2: Add `record_order_event` tx in `tx3/main.tx3`** — Goal: takes `metadata_payload: Bytes` as argument; constructs a self-payment from merchant party to merchant party of min-ADA with the metadata attached under the metadata label from env. Refer to the spec for the metadata shape.
- [ ] **Step 3: Add `[profiles.local]` and `[profiles.preview]` blocks to `tx3/trix.toml`** — Goal: each points at the corresponding TRP endpoint per Overview §5. Confirm the schema by reading any existing tx3-sdk example in `/Users/mduthey/Documents/Work/txpipe/tx3/sdks/web-sdk/examples/` if needed.
- [ ] **Step 4: Regenerate the ts-client** — Run: `pnpm trix bindgen` (or the project's documented command). Expected: `src/lib/tx3/protocol.ts` updated with the new tx function. Commit the regenerated file.
- [ ] **Step 5: Lint + typecheck** — Run: `pnpm lint && pnpm check`. Expected: PASS.
- [ ] **Step 6: Commit** — `feat(tx3): add record_order_event tx and per-profile config`.

---

### Task 7: Phase 3 — Traceability orchestrator module (paid)

**Goal:** Submit a `paid` event tx from the server-fn side and persist the `order_events` row. Single-event implementation in this task; the other events follow the same shape in Task 8.

**Files:**
- Create: `src/lib/cardano/traceability.ts`
- Create: `src/lib/cardano/__tests__/traceability.test.ts`

**Spec reference:** Traceability design §"Components" (`traceability.ts`), §"Data flow" §"Happy path: paid".

- [ ] **Step 1: Write failing tests for `submitPaidTrace`**
  - Test: builds a payload matching the spec (`v`, `event="paid"`, `order_id`, `merchant`, `ts`, `data={}`).
  - Test: calls the tx3 client's `resolve → sign → submit → waitForConfirmed` chain.
  - Test: returns `{ txHash, confirmed: true }` when `waitForConfirmed` resolves with status confirmed.
  - Test: returns `{ txHash, confirmed: false }` when `waitForConfirmed` times out (no exception).
  - Test: propagates `ChainUnavailable` from the u5c wrapper unchanged.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `submitPaidTrace(orderId)`** — Goal: orchestrates `Tx3Client` (from `tx3-sdk`) with the merchant signer and the `record_order_event` tx, builds the payload via a helper `buildEventPayload(event, orderId)` and returns the result type from the tests.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(cardano): add traceability orchestrator with submitPaidTrace`.

---

### Task 8: Phase 3 — Add shipped, completed, cancelled to traceability orchestrator

**Goal:** Round out the orchestrator with the three merchant-driven events, sharing the build/sign/submit pipeline from Task 7.

**Files:**
- Modify: `src/lib/cardano/traceability.ts`
- Modify: `src/lib/cardano/__tests__/traceability.test.ts`

**Spec reference:** Traceability design §"Traced events" table, §"Metadata payload".

- [ ] **Step 1: Write failing tests for the three new functions**
  - Test (`submitShippedTrace`): payload `event="shipped"` and `data={tracking_number?}` when provided.
  - Test (`submitCompletedTrace`): payload `event="completed"` and `data={}`.
  - Test (`submitCancelledTrace`): payload `event="cancelled"` and `data={reason}` (reason required by the function signature).
  - Test: all three reuse the same pipeline as `submitPaidTrace` (same mocks fire in the same order).
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement the three functions** — Goal: extract a shared internal helper from `submitPaidTrace` if not already shared; each function only differs in the payload it passes to the helper.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(cardano): add shipped, completed, cancelled traceability events`.

---

### Task 9: Phase 4 — Wire `submitPaidTrace` into the payment confirmation server-fn

**Goal:** When the buyer's payment confirms and the order flips to `paid`, submit the on-chain `paid` event in the same SQL transaction and persist the row.

**Files:**
- Modify: `src/server-fns/payments.ts` (or `src/server-fns/orders.ts` — confirm at implementation time which one owns the paid transition)
- Modify: existing payment-flow tests under `src/server-fns/__tests__/` (read first)
- Add: tests for the new traceability side-effect

**Spec reference:** Traceability design §"Data flow" §"Happy path: paid", §"Modified files" (`src/server-fns/orders.ts`).

- [ ] **Step 1: Read the existing payment confirmation flow** — Locate where `orders.status` transitions to `paid` and `cardano_tx_hash` is written. Note any existing tests covering this path.
- [ ] **Step 2: Write failing tests for the new side-effect**
  - Test: on successful payment confirmation, `submitPaidTrace` is invoked once with the orderId.
  - Test: a corresponding `order_events` row is inserted with `event_type='paid'`, `tx_hash`, payload, and `confirmed_at` set on confirmed result.
  - Test: if `submitPaidTrace` throws (e.g., chain unavailable), the SQL transaction rolls back and the order does not transition to `paid`.
- [ ] **Step 3: Run the tests** — Expected: FAIL.
- [ ] **Step 4: Modify the server-fn** — Goal: inside the same SQL transaction that flips status to `paid`, call `submitPaidTrace(orderId)` and insert the `order_events` row using the helper from Task 5.
- [ ] **Step 5: Run the tests** — Expected: PASS (new and existing).
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(server-fns): emit paid traceability event on payment confirmation`.

---

### Task 10: Phase 5 — CLI script `mark-order-shipped`

**Goal:** A CLI invoked as `pnpm tsx scripts/mark-order-shipped.ts --order-id <uuid> [--tracking <code>]` that validates the transition, calls `submitShippedTrace`, persists the event, and updates the order status — atomically.

**Files:**
- Create: `scripts/mark-order-shipped.ts`
- Create: `scripts/__tests__/mark-order-shipped.test.ts`
- Modify: `package.json` (add a `scripts` entry if helpful, e.g., `mark-shipped`)

**Spec reference:** Traceability design §"Data flow" §"Happy path: shipped".

- [ ] **Step 1: Write failing tests with mocked DB and orchestrator**
  - Test: parses `--order-id` and optional `--tracking`; rejects missing required flag.
  - Test: acquires a row lock (`SELECT ... FOR UPDATE`) and asserts current status is `paid`; aborts otherwise with `INVALID_TRANSITION`.
  - Test: on success, inserts `order_events` row and updates `orders.status='shipped'` in one SQL transaction.
  - Test: on `submitShippedTrace` failure, rolls back the SQL transaction; status unchanged.
  - Test: prints the tx hash + an explorer URL to stdout on success.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `scripts/mark-order-shipped.ts`** — Goal: use a CLI arg parser already in the repo if any (otherwise stdlib parsing is fine); use the service-role Supabase client; use `submitShippedTrace` from Task 8.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Smoke test against dolos** — Seed a paid order in local DB; run the script; verify the row in `order_events` and the explorer-side metadata via dolos query. Document the smoke test as a brief README at `scripts/README.md` (operator instructions, not implementation details).
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(scripts): add mark-order-shipped CLI`.

---

### Task 11: Phase 5 — CLI scripts `mark-order-completed` and `cancel-order`

**Goal:** Mirror Task 10 for the two remaining merchant-driven events.

**Files:**
- Create: `scripts/mark-order-completed.ts`
- Create: `scripts/cancel-order.ts`
- Create: `scripts/__tests__/mark-order-completed.test.ts`
- Create: `scripts/__tests__/cancel-order.test.ts`

**Spec reference:** Traceability design §"Data flow" §"Happy path: shipped (and analogous: completed, cancelled)".

- [ ] **Step 1: Write failing tests for `mark-order-completed`** — Same shape as Task 10's tests, with `event_type='completed'`, transitions allowed from `shipped` (or `paid` if the spec admits it — confirm in spec then in test).
- [ ] **Step 2: Write failing tests for `cancel-order`** — Same shape, with `event_type='cancelled'`, a required `--reason <text>` flag, and transitions allowed from any pre-completed state.
- [ ] **Step 3: Run the tests** — Expected: FAIL.
- [ ] **Step 4: Implement both scripts** — Goal: extract a shared helper (e.g., `scripts/lib/transition.ts`) to avoid copying the lock-validate-submit-persist pattern three times.
- [ ] **Step 5: Run the tests** — Expected: PASS.
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(scripts): add mark-order-completed and cancel-order CLIs`.

---

### Task 12: Phase 5 — CLI script `reconcile-events`

**Goal:** Walk `order_events` rows with `confirmed_at IS NULL` and re-invoke `waitForConfirmed` to fill them. Manual run, no scheduling.

**Files:**
- Create: `scripts/reconcile-events.ts`
- Create: `scripts/__tests__/reconcile-events.test.ts`

**Spec reference:** Traceability design §"Reconciliation of pending confirmations".

- [ ] **Step 1: Write failing tests**
  - Test: selects rows with `confirmed_at IS NULL`, calls `waitForConfirmed` for each tx hash.
  - Test: on confirmed, updates `confirmed_at = NOW()`.
  - Test: on still-pending, leaves the row unchanged and continues to the next.
  - Test: prints a summary at the end (count confirmed, count still pending).
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `scripts/reconcile-events.ts`** — Goal: per the spec, this is a thin loop using the u5c client + tx3-sdk to recheck status. Use the same memoised clients.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(scripts): add reconcile-events CLI`.

---

### Task 13: Phase 6 — Buyer-facing trace timeline component

**Goal:** Render `order_events` as a vertical timeline on the order-confirmation page, with each event labeled and linking out to the preview explorer.

**Files:**
- Create: `src/components/order/OrderTraceTimeline.tsx`
- Create: `src/components/order/__tests__/OrderTraceTimeline.test.tsx`
- Modify: `src/routes/order-confirmation.$orderId.tsx`

**Spec reference:** Traceability design §"Modified files" (`order-confirmation.$orderId.tsx`).

- [ ] **Step 1: Write failing tests for `OrderTraceTimeline`**
  - Test: renders one item per event in the order's `events` array.
  - Test: shows the event type, timestamp, and an explorer link based on the network profile (preview → `preview.cexplorer.io`, local → no link or a placeholder).
  - Test: handles empty events array gracefully (renders nothing or an empty-state hint).
  - Test: orders events by `submitted_at` ascending.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `OrderTraceTimeline.tsx`** — Goal: pure presentational component, reads from props, follows the project's existing styling conventions (Tailwind, shadcn primitives).
- [ ] **Step 4: Wire it into `order-confirmation.$orderId.tsx`** — Goal: place it under the existing order summary; pass `order.events` from the eager-loaded query (Task 5).
- [ ] **Step 5: Run the tests** — Expected: PASS.
- [ ] **Step 6: Manual UI verification** — Run: `pnpm dev` against `.env.local`, complete a checkout that triggers a `paid` event (the chain plumbing must be working), confirm the timeline shows the event with a working link.
- [ ] **Step 7: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 8: Commit** — `feat(order): add on-chain trace timeline to order confirmation`.

---

### Task 14: Phase 7 — Preview evidence run

**Goal:** Execute the full happy-path lifecycle against preview and capture the three tx hashes for milestone evidence (A2).

**Files:**
- Modify: `docs/advanced-onchain.md` (create on first feature run; later features append to it)

**Spec reference:** Traceability design §"Preview evidence run", §"Implementation phases".

- [ ] **Step 1: Populate `.env.preview` with real preview credentials** — Endpoint, merchant signing key, merchant address. (Operator action; not committed.)
- [ ] **Step 2: Run a buyer checkout against preview** — Use a real CIP-30 wallet on preview. Confirm the `paid` event tx hash appears in `order_events`. Capture the hash.
- [ ] **Step 3: Run `mark-order-shipped` against preview** — Capture the hash.
- [ ] **Step 4: Run `mark-order-completed` against preview** — Capture the hash.
- [ ] **Step 5: Open each tx on `preview.cexplorer.io`** — Verify the metadata is visible under label 1337 and matches the spec payload shape.
- [ ] **Step 6: Append the three hashes to `docs/advanced-onchain.md`** — Goal: a "Feature A — Traceability" section with the three hashes, each as a markdown link to the explorer. Document the order: `paid` → `shipped` → `completed`.
- [ ] **Step 7: Commit the docs update** — `docs: capture milestone 3 traceability evidence`.

---

## Self-review

**Spec coverage check:**
- A1 (transactions record key events) → Tasks 7, 8, 9, 10, 11 implement and trigger event submission; Task 14 produces the evidence.
- A2 (video walkthrough showcasing on-chain txs) → Tasks 13 (timeline) and 14 (preview evidence + explorer links) cover the visual story.
- Cross-cutting decision §1 (backend signer) → Task 3.
- Cross-cutting decision §3 (u5c provider) → Task 2.
- Cross-cutting decision §4 (tx3-sdk for full lifecycle) → Tasks 6, 7, 8.
- Cross-cutting decision §5 (env vars) → Tasks 1, 14.
- Cross-cutting decision §8 (milestone-mode CLI scripts) → Tasks 10, 11, 12.

**Placeholder scan:** No "TBD" / "implement later" — every step states its goal. The `2026MMDD` in migration filenames is a date-stamp convention, replaced at implementation time (Task 4 step 2 calls this out explicitly).

**Consistency:** Function names used across tasks (`getNetworkConfig`, `createU5cClient`, `getMerchantSigner`, `submitPaidTrace`, `submitShippedTrace`, `submitCompletedTrace`, `submitCancelledTrace`, `insertOrderEvent`, `listOrderEvents`) appear with the same spelling everywhere.

**Out of scope (per milestone-mode trim):** admin panel, wallet-gated merchant auth, scheduled reconciler. These are listed in the spec's "Open questions / future improvements" section.
