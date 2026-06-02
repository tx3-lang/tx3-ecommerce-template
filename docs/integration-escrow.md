# Oracle-Driven Escrow Settlement — Integration Guide

This guide covers the full Milestone 3 oracle integration: how the shipping-oracle HTTP API
connects to the on-chain escrow contract, how the off-chain keeper settles orders, and how
to run it yourself.

This repo (the [tx3 e-commerce template](https://github.com/tx3-lang/tx3-ecommerce-template))
is the live integration example: it contains the escrow contract, the off-chain keeper, the
settlement scripts, and the e2e tests. The shipping oracle HTTP API and the fetch/verify SDKs
live in the [shipping-oracle repo](https://github.com/tx3-lang/shipping-oracle). All paths and
`pnpm` commands below are relative to **this** repo unless noted otherwise.

---

## End-to-End Flow

```
1. Buyer locks ADA/tokens in the escrow        → escrow status: Pending
2. Merchant registers shipment tracking         → orders.carrier + tracking_number written
3. Keeper polls oracle (settle-escrows):
   - Oracle: IN_TRANSIT  → keeper submits mark_shipped  → status: Shipped
                                                           (refund now blocked on-chain;
                                                            grace window starts)
   - Oracle: DELIVERED   → keeper submits release        → status: Released
     (only after now >= grace_period_end)                  (funds reach merchant)
4. If keeper never sees dispatch (oracle stays
   PRE_TRANSIT / NOT_DELIVERED / UNKNOWN past
   ship_deadline) → buyer initiates a refund from
   their wallet                                 → status: Refunded
```

### Step 1 — Buyer locks funds

The buyer locks ADA (or tokens) at the escrow script address via the `lock_escrow_ada` /
`lock_escrow_tokens` tx3 transactions (`tx3/main.tx3`). The datum encodes
`{ buyer_pkh, merchant_pkh, paid_at, ship_deadline, grace_period_end: None }`.
`ship_deadline` and the grace window are computed from the env constants
`ESCROW_SHIP_DEADLINE_SECONDS` and `ESCROW_GRACE_PERIOD_SECONDS`.

### Step 2 — Merchant registers tracking

```bash
pnpm register-tracking --order-id <uuid> --carrier <name> --tracking <number>
```

This writes `orders.carrier` + `orders.tracking_number` in the database.
It does NOT change `orders.status` or write any on-chain tx — it is a pure database
operation. The keeper reads these fields by joining `escrows → orders` on `order_id`.

### Step 3 — Keeper settles

```bash
# Dry run — log decisions without submitting any transaction
pnpm settle-escrows --dry-run

# Live run (typically invoked as a cron job)
pnpm settle-escrows
```

The keeper (`scripts/settle-escrows.ts`) scans all escrows in `{pending, shipped}` status
that have a registered tracking number, queries the oracle for each, and delegates:

| Oracle status   | Escrow status | Action          | Notes                                              |
|-----------------|---------------|-----------------|---------------------------------------------------|
| `IN_TRANSIT`    | `pending`     | `mark_shipped`  | Submits on-chain tx; blocks buyer refund           |
| `DELIVERED`     | `shipped`     | `release`       | Only if `now >= grace_period_end`; funds to merchant |
| `DELIVERED`     | `pending`     | `mark_shipped`  | Catches up if keeper missed the IN_TRANSIT window  |
| `PRE_TRANSIT`   | any           | none            | Waiting for carrier pickup                        |
| `NOT_DELIVERED` | any           | none            | Delivery failed; no keeper action                 |
| `UNKNOWN`       | any           | none            | Oracle has no data yet                            |
| any             | `released`    | none            | Terminal — already settled                        |
| any             | `refunded`    | none            | Terminal — already refunded                       |

The exact decision logic lives in `src/lib/oracle/settlement.ts` (`decideEscrowAction`)
and is unit-tested by 47 tests in `src/lib/oracle/settlement.test.ts`. The keeper loop itself
is unit-tested in `scripts/__tests__/settle-escrows.test.ts`.

### Step 4 — Buyer-initiated timeout refund

If the oracle never confirms dispatch and `ship_deadline` passes, the buyer runs:

```bash
pnpm escrow-refund --order-id <uuid>
```

(`scripts/escrow-refund.ts`). The on-chain validator only allows `Refund` while the escrow
is still `Pending` AND `now >= ship_deadline`, so the window is enforced at the contract
level. The keeper never submits a refund; see [Buyer-Initiated Refund](#buyer-initiated-refund-design-decision) below.

---

## Trust Model

Settlement is enforced **off-chain** by the keeper (the merchant backend), not by the
contract validator.

**What the keeper verifies.** Before calling `mark_shipped` or `release`, the keeper calls
the oracle, receives a signed attestation, and verifies the Ed25519 signature using the
TypeScript SDK's `verifyAttestation` / `prepareCommitment` functions
([`sdk/typescript/`](https://github.com/tx3-lang/shipping-oracle/tree/main/sdk/typescript)
in the shipping-oracle repo). Only if verification passes does it submit the escrow tx.

**What the contract verifies.** The escrow `spend` validator (`aiken/validators/escrow.ak`)
enforces timing and state rules:

- `mark_shipped`: requires `shipped_at < ship_deadline`, merchant signature, datum transition.
- `release`: requires `now >= grace_period_end`, merchant signature.
- `refund`: requires `now >= ship_deadline`, buyer signature, status still Pending.

The contract does **not** cryptographically verify the oracle's Ed25519 signature. Trust
is in the keeper: if the merchant backend is honest and the keeper is running correctly,
funds settle correctly. The contract enforces the *timing constraints* and *authorization*
(who can sign each redeemer), which limits what a compromised keeper can do
(e.g. a rogue keeper cannot release early — the on-chain grace period still blocks it).

**Why off-chain, not fully on-chain?** An on-chain oracle approach would embed the
attestation verification inside the validator using the withdrawal-redeemer trick
(the oracle's public key commitment in the datum; the redeemer carries the signed
attestation; the spending validator co-requires a withdrawal from an always-true script
that checks the signature). This is a clean design and is the planned follow-up. It is
blocked only by a `pallas-validate` bug that makes withdrawal redeemers unavailable to
spending validators on local dolos — not by any fundamental issue.

**Off-chain also handles no-tracking orders.** Orders fulfilled via local pickup or
in-person delivery have no carrier + tracking number. The keeper detects this
(`settle-escrows.ts`) and skips them gracefully, falling back to the manual flow
(`scripts/escrow-mark-shipped.ts` / `scripts/escrow-release.ts`). A strict on-chain
oracle requirement would lock those escrow funds forever if no attestation existed.

---

## Status → Transition Mapping

### `IN_TRANSIT` → `mark_shipped`

The keeper submits `mark_shipped` (Pending → Shipped) as soon as the oracle reports
`IN_TRANSIT`, **without waiting for delivery**. Rationale:

- The on-chain `mark_shipped` validator requires `shipped_at < ship_deadline`.
  If the keeper waits until `DELIVERED` and the package was dispatched before
  `ship_deadline` but `DELIVERED` is only confirmed after it, the tx would be
  rejected and the merchant could not settle.
- More importantly: without `mark_shipped`, the escrow stays `Pending` and the buyer
  can call `Refund` once `ship_deadline` passes — even though the merchant actually
  shipped. The `IN_TRANSIT` signal is the earliest reliable proof of dispatch; acting
  on it immediately is the safe choice.
- Poll cadence must be tighter than the ship window (typically cron every few minutes
  if `ESCROW_SHIP_DEADLINE_SECONDS` is hours).

### `DELIVERED` → `release`

The keeper submits `release` (Shipped → Released) once:

1. The oracle reports `DELIVERED`, AND
2. `now >= grace_period_end` (`grace_period_end = shipped_at + grace`).

The grace period is enforced on-chain; the keeper simply waits. `grace_period_end` is
written into the datum by the `mark_shipped` tx, so the contract has it.

### `PRE_TRANSIT` / `NOT_DELIVERED` / `UNKNOWN`

No keeper action. These states are either transient (`PRE_TRANSIT` before carrier
pickup) or error states the keeper cannot resolve automatically.

---

## Buyer-Initiated Refund — Design Decision

The keeper automates `release` only. It **never** submits a `Refund` transaction.

**Why not automate refund?** The on-chain `Refund` redeemer requires the buyer's signature
(`must_be_signed_by(ctx, datum.buyer_pkh)`). The keeper runs as the merchant backend and
holds the merchant's signing key — it has no access to the buyer's key. There is no
permissionless-refund path in the current contract.

**The limitation.** If `ship_deadline` passes and the oracle never confirmed dispatch,
the buyer must manually submit the refund from their wallet
(`pnpm escrow-refund --order-id <uuid>`). The contract enforces the window on-chain
(refund only allowed when Pending + `now >= ship_deadline`), so the timeout guarantee
is still hard. The buyer is never at risk of losing funds due to keeper inaction — the
refund path is always open to them after the deadline.

**Making it fully automatic** would require a contract change: a "permissionless refund"
validator variant where anyone (or a keeper key) can trigger the refund, with funds
still returning exclusively to the buyer. This is an on-chain change and is out of scope
for this milestone.

---

## Required Environment Variables

### Keeper (settle-escrows)

| Variable | Required | Description |
|---|---|---|
| `ORACLE_BASE_URL` | yes | Base URL of the oracle HTTP API |
| `ORACLE_PUBLIC_KEY` | no | Ed25519 public key hex; when set, attestation verification is pinned to this key |
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SECRET_KEY` | yes | Service-role key (DB read/write for escrows + orders) |
| `TX3_TRP_ENDPOINT` | yes | tx3 TRP node endpoint for chain resolution |
| `TX3_PROFILE` | yes | tx3 profile name (e.g. `local`, `preview`) |
| `MERCHANT_ADDRESS` | yes | Bech32 merchant address (signer for mark_shipped / release) |
| `MERCHANT_SKEY` | yes | Ed25519 merchant signing key hex |
| `ESCROW_SHIP_DEADLINE_SECONDS` | yes | Ship window length in seconds |
| `ESCROW_GRACE_PERIOD_SECONDS` | yes | Grace period after shipment in seconds |

### Buyer refund script

Same chain env (`TX3_TRP_ENDPOINT`, `TX3_PROFILE`) plus the buyer's signing key
(`TEST_BUYER_SKEY`, `TEST_BUYER_ADDRESS`).

---

## Idempotency

Each keeper run is safe to re-run. The decision is gated on the **current** escrow status
in the DB + the current time + the current oracle status. The chain transaction is submitted
before the DB write, so a crash between them is recoverable (the reconciler script
`scripts/reconcile-escrow.ts` can re-sync the DB from on-chain state).

---

## Running the E2E Tests

The keeper-driven suites live in `tests/e2e/` and require a live local dolos node and all
keeper env vars. They are guarded by `isE2eConfigured()` and skip automatically unless the
environment is fully set.

### Required env for e2e

```bash
VITE_SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
TX3_TRP_ENDPOINT=...
TX3_PROFILE=local
MERCHANT_ADDRESS=...
MERCHANT_SKEY=...
TEST_BUYER_SKEY=...
TEST_BUYER_ADDRESS=...
ESCROW_SHIP_DEADLINE_SECONDS=60
ESCROW_GRACE_PERIOD_SECONDS=60
# plus a real locked escrow UTxO:
E2E_LOCK_TX_HASH=...
```

### Running

```bash
pnpm test:e2e
```

### Keeper-driven suites

| File | What it tests |
|---|---|
| `escrow_oracle_delivery.e2e.ts` | Oracle DELIVERED → keeper submits release; funds reach merchant |
| `escrow_oracle_refund_blocked.e2e.ts` | After mark_shipped, buyer refund is rejected on-chain |
| `escrow_oracle_no_tracking.e2e.ts` | Order with no tracking: keeper skips it gracefully |
| `oracle_fixture.e2e.ts` | Dolos-independent: verifies test attestations pass `verifyAttestation` (SDK self-check) |

The buyer-initiated timeout refund is covered by the existing `escrow_refund_timeout.e2e.ts`.

---

## Code Map

| What | Where |
|---|---|
| Oracle HTTP client factory | `src/lib/oracle/client.ts` (this repo) |
| Settlement decision logic | `src/lib/oracle/settlement.ts` (this repo) — `decideEscrowAction(escrow, oracleStatus, nowMs)` |
| Keeper runner | `scripts/settle-escrows.ts` (this repo) |
| Register tracking CLI | `scripts/register-tracking.ts` (this repo) |
| Escrow validator | `aiken/validators/escrow.ak` (this repo) |
| Escrow types | `aiken/lib/escrow_types.ak` (this repo) |
| tx3 transactions | `tx3/main.tx3` (this repo) — `mark_shipped`, `release_escrow`, `refund_escrow` |
| TypeScript SDK | [`sdk/typescript/`](https://github.com/tx3-lang/shipping-oracle/tree/main/sdk/typescript) (shipping-oracle repo) — `verifyAttestation`, `prepareCommitment` |
| Rust SDK | [`sdk/rust/`](https://github.com/tx3-lang/shipping-oracle/tree/main/sdk/rust) (shipping-oracle repo) |
