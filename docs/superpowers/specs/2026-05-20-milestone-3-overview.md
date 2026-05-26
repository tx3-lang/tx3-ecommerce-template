# Milestone 3 — Advanced e-Commerce Features (Overview)

> Date: 2026-05-20
> Status: cross-cutting decisions locked; per-feature specs to follow.

This document captures the **shared decisions** that apply to all three features of Milestone 3 (traceability, escrow, reputation) and the order in which the per-feature specs will be written. Each per-feature spec links back here for context.

## Milestone outputs (verbatim from grant)

- **A.** On-chain traceability that records key store order events as immutable transaction data.
- **B.** On-chain escrow contract that holds funds between buyer and seller until released by a shipping-related event.
- **C.** On-chain reputation feature providing badge tokens that reflect buyer and seller interactions.
- **D.** Documentation describing how the advanced on-chain features work.

## Roadmap

The three features will be specced and built **incrementally** (A → B → C), then D is consolidated at the end.

| Order | Feature | Spec file |
|---|---|---|
| 1 | A — Traceability | `2026-05-20-milestone-3-traceability-design.md` |
| 2 | B — Escrow | `2026-05-20-milestone-3-escrow-design.md` (TBD) |
| 3 | C — Reputation | `2026-05-20-milestone-3-reputation-design.md` (TBD) |
| 4 | D — Documentation | consolidation pass on `docs/USER_GUIDE.md` + `docs/advanced-onchain.md` |

**Rationale for A → B → C:**
- A introduces the backend signer + u5c infra used by B and C.
- B requires an Aiken validator (escrow); A doesn't, so A de-risks chain plumbing first.
- C consumes "completed interactions" — naturally B's release event is the cleanest trigger, so C goes last.

## Cross-cutting decisions

These decisions apply to all three features and are not re-discussed in per-feature specs.

### 1. Merchant signing

Backend signer with a server-side wallet (raw Ed25519 signing key in env). The merchant key authorises:
- Submission of traceability event txs (A).
- Submission of escrow release / refund txs that need a merchant witness (B).
- Minting of reputation badges via a minting policy parameterised on the merchant pkh (C).

Frontend buyer flows keep their CIP-30 wallet integration — the backend signer never substitutes the buyer's signature.

### 2. Target network

- **Local dev:** dolos, speaking u5c on `localhost`. Loaded via `.env.local`.
- **Public evidence (preview):** real preview transactions verifiable on CardanoScan / preview explorer. Loaded via `.env.preview`.

Mainnet is out of scope for the milestone.

### 3. Chain provider / submission infra

u5c (UTxORPC) — txpipe's native protocol. Both dolos local and preview-facing u5c endpoints are supported with the same client interface. Endpoint URL is the only thing that changes between environments.

### 4. SDK choice

`tx3-sdk` (web-sdk) for the full transaction lifecycle: `resolve → sign → submit → waitForConfirmed`.
- Frontend (buyer): `Cip30Signer` via `cip30Party(api)`.
- Backend (merchant): `Ed25519Signer.fromHex(merchantAddr, signingKeyHex)`.

### 5. Environment variables

| Var | Required for | Notes |
|---|---|---|
| `TX3_TRP_ENDPOINT` | All | TRP server URL (dolos local or preview TRP). |
| `TX3_PROFILE` | All | `local` or `preview`. Must match a profile defined in `tx3/trix.toml`. |
| `MERCHANT_ADDRESS` | All | Bech32 address derived from the backend signer key. |
| `CARDANO_MERCHANT_SKEY` | All | Ed25519 signing key (hex). Server-side only; never exposed to the client. |
| `METADATA_LABEL` | A | Default `1337`. Custom label for order-event metadata. |
| `ESCROW_SHIP_DEADLINE_SECONDS` | B | Default `2592000` (30d). Preview demo uses `300` (5 min). |
| `ESCROW_GRACE_PERIOD_SECONDS` | B | Default `1209600` (14d). Preview demo uses `300` (5 min). |

Convention: one file per profile.
- `.env.local` — dolos local development.
- `.env.preview` — preview evidence runs.

### 6. Repo layout for new on-chain code

- **tx3 transactions** stay in `tx3/main.tx3` (added per feature). Each feature may add one or more tx definitions.
- **Aiken validators** (introduced in B) live in a new `aiken/` directory at repo root, with its own `aiken.toml`. The compiled validator script is committed and referenced from tx3 + ts code.
- **Backend chain code** lives under `src/lib/cardano/`: `u5c-client.ts`, `signer.ts`, `network.ts`, and per-feature modules (`traceability.ts`, `escrow.ts`, `reputation.ts`).

### 7. Acceptance evidence

All three features must produce **public preview tx hashes** as evidence for the grant. Concretely:
- A: at least the 3-event happy path (paid → shipped → completed) on a real preview order.
- B: at least 2 escrow release scenarios (e.g., happy-path release on shipped + refund on timeout).
- C: at least 2 badge tokens minted (e.g., one for buyer, one for seller).

CardanoScan preview links are collected in `docs/advanced-onchain.md` (output D).

### 8. Scope: milestone-mode

The three features are built to the **minimum scope required to produce milestone evidence**, not to a production-ready UX. Concretely:

- **Buyer-facing UI** (checkout flow, order confirmation timeline) is implemented — it is the visible surface in the video walkthrough.
- **Merchant actions** (mark shipped, release escrow, refund, mint badges) are exposed as **CLI scripts under `scripts/`** that run locally with the merchant env vars. No admin dashboard, no in-app auth flow for merchants.
- **Reconciliation** of unconfirmed txs is a manual script (`pnpm reconcile-events`), not a scheduled job.
- Production-grade extensions (admin dashboard, wallet-based merchant auth, scheduled reconciler, dispute/arbitration UI) are explicitly out of scope and tracked as future improvements at the bottom of each per-feature spec.
