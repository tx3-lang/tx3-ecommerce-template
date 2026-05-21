# Milestone 3 / Feature C — On-chain Reputation Badges (Design Spec)

> Date: 2026-05-20
> Status: design draft, pending user review.
> Cross-cutting decisions: see `2026-05-20-milestone-3-overview.md`.
> Depends on feature A (chain plumbing) and feature B (escrow released as trigger).

## Goal

Issue non-fungible "badge" tokens to buyers and sellers as immutable on-chain proof of milestones in their interaction with the store. Each badge is a unique NFT with CIP-25 metadata; one badge per `(kind, recipient)` enforced by asset naming + off-chain checks.

Maps to grant outputs:
- **C1** — reputation metrics from buyer and seller interactions, demonstrated through issuance of at least 2 test badge tokens.
- **C2** — link to on-chain transactions for the 2 test badge tokens.

## Approach

A single Plutus minting policy in Aiken, parameterised by the merchant's pkh, controls all badge issuance. The policy enforces only two invariants on-chain: (a) the merchant signs every mint, and (b) every asset minted under the policy has quantity exactly 1 (no burns, no fungible mints). All other rules — eligibility, uniqueness per recipient, soulbound semantics — are enforced off-chain in a CLI script.

For the milestone we ship a minimum-viable catalog of two badges:
- `BUYER_FIRST_PURCHASE` — minted to the buyer after the first escrow they hold as buyer is released.
- `SELLER_FIRST_DELIVERY` — minted to the merchant after the first escrow in the store is released.

Both are minted manually via `pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind <buyer-first-purchase|seller-first-delivery>` after the corresponding escrow release.

### Why this shape

- **Single minting policy** parameterised by merchant pkh → one policy_id per store, indexable end-to-end.
- **Asset_name encodes `(kind, recipient_pkh)`** → uniqueness guaranteed by the naming convention; an indexer can extract kind + recipient without reading metadata.
- **CIP-25 metadata under label 721** → automatic rendering in Eternl, Lace, Yoroi, and major explorers.
- **No on-chain "soulbound" enforcement** → simpler validator; the constraint is communicated through metadata + UI and trusted off-chain. A future iteration can add stake-credential locking if needed.
- **CLI-driven minting** → consistent with the milestone-mode pattern of A and B; no admin UI to maintain.

## Minting policy

### Parameters (compile-time)

```aiken
validator badges(merchant_pkh: VerificationKeyHash) {
  mint(redeemer: BadgeRedeemer, policy_id: PolicyId, self: Transaction) { ... }
}
```

The policy_id is fully determined by `merchant_pkh` — each merchant deploy has a distinct policy_id.

### Redeemer

```aiken
type BadgeRedeemer { Mint }
```

(No `Burn` in milestone-mode. Adding it later means extending the type and the validator rules.)

### Rules

1. The transaction must be signed by `merchant_pkh`.
2. Every asset minted under this policy_id has quantity exactly 1. Quantities 0, > 1, or negative (burns) all fail.

### What the validator does NOT enforce

- Who the recipient is — the tx builder routes the output.
- The asset_name — the CLI script derives `kind_id ++ recipient_pkh`.
- Eligibility (e.g., "is this really the buyer's first purchase?") — the CLI script checks the DB before submitting.
- Soulbound — the holder can technically transfer the token. Communicated as social convention, not on-chain rule.

### Asset name convention

30 bytes total:

```
<kind_id: 2 bytes> ++ <recipient_pkh: 28 bytes>
```

Kind IDs:
- `0x0001` → `BUYER_FIRST_PURCHASE`
- `0x0002` → `SELLER_FIRST_DELIVERY`

This guarantees uniqueness per `(kind, recipient)`: re-minting the same kind for the same recipient would attempt to mint another asset with the same asset_name, which the off-chain UNIQUE check rejects (and which would in any case produce a second NFT indistinguishable from the first, defeating the badge semantics).

### CIP-25 metadata (label 721)

```json
{
  "721": {
    "<policy_id_hex>": {
      "<asset_name_hex>": {
        "name": "First Purchase",
        "image": "ipfs://Qm.../buyer-first-purchase.png",
        "description": "Awarded for completing the first order in this store.",
        "mediaType": "image/png",
        "kind": "BUYER_FIRST_PURCHASE",
        "order_id": "<uuid>",
        "merchant": "<bech32>",
        "issued_at": "<iso8601>"
      }
    }
  }
}
```

Image hosting: static PNGs uploaded to IPFS; CIDs hardcoded in `src/lib/cardano/badges-catalog.ts` and committed before the demo.

## Components

### New files

| Path | Responsibility |
|---|---|
| `aiken/validators/badges.ak` | Minting policy with the two rules above. |
| `aiken/lib/badge_types.ak` | `BadgeRedeemer { Mint }`. |
| `src/lib/cardano/badges-catalog.ts` | Static catalog: `BUYER_FIRST_PURCHASE`, `SELLER_FIRST_DELIVERY`. Each entry has `id` (2 bytes), `name`, `description`, `ipfs_image_cid`, `recipient_role`, `eligibility(orderId, dbClient) → boolean`. |
| `src/lib/cardano/badges.ts` | `submitMintBadge(kind, recipientPkh, orderId) → { assetName, txHash }`. Builds CIP-25 metadata, derives asset_name, drives tx3-sdk through resolve → sign → submit → waitForConfirmed. |
| `src/lib/cardano/badges-policy.ts` | Loads `plutus.json`; exposes `policy_id` derived from `merchant_pkh`. |
| `supabase/migrations/2026MMDD_badges.sql` | `issued_badges` table (schema below). |
| `scripts/mint-badge.ts` | CLI: `--order-id <uuid> --kind <buyer-first-purchase\|seller-first-delivery>`. Validates eligibility, calls `submitMintBadge`, persists row. |
| `src/components/badges/BadgeList.tsx` | Renders badges for a wallet using CIP-25 metadata. |
| `src/routes/wallet.$address.tsx` | Public profile route showing the badges held by a wallet address. Used in the video walkthrough. |
| `public/badges/buyer-first-purchase.png` | Badge image (also on IPFS). |
| `public/badges/seller-first-delivery.png` | Badge image. |

### Modified files

| Path | Change |
|---|---|
| `tx3/main.tx3` | Add `mint_badge(recipient_pkh, kind_id, metadata)`. Inputs: merchant UTxO for fees + min-ADA. Mint: quantity 1 under the badges policy with the derived asset_name. Output: NFT + min-ADA to `recipient_pkh`. Metadata under label 721. |
| `tx3/trix.toml` | Reference the badges policy from `plutus.json` (already referenced for escrow; add the second validator). |
| `src/routes/order-confirmation.$orderId.tsx` | If badges were issued for this order, show them with image + tx hash link. |
| `@types/database.d.ts` | Add `IssuedBadge` interface. |

### `issued_badges` schema

```sql
CREATE TABLE issued_badges (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 TEXT NOT NULL CHECK (kind IN ('buyer_first_purchase','seller_first_delivery')),
  recipient_pkh        TEXT NOT NULL,
  recipient_address    TEXT NOT NULL,
  triggering_order_id  UUID NOT NULL REFERENCES orders(id),
  policy_id            TEXT NOT NULL,
  asset_name_hex       TEXT NOT NULL,
  mint_tx_hash         TEXT NOT NULL,
  metadata             JSONB NOT NULL,
  minted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, recipient_pkh)
);

CREATE INDEX issued_badges_recipient_idx ON issued_badges(recipient_pkh);
CREATE INDEX issued_badges_order_idx ON issued_badges(triggering_order_id);
```

The UNIQUE constraint is the off-chain line of defence against double-mint. The asset_name convention is the on-chain line of defence — same `(kind, recipient_pkh)` always produces the same asset_name.

### Environment variables

No new env vars. The same `CARDANO_MERCHANT_SKEY` and `MERCHANT_ADDRESS` from A and B cover all needs.

## Data flow

### Single scenario: mint a badge after an eligible event

Trigger: after an escrow released (spec B), the operator decides whether to mint:
- Buyer gets `BUYER_FIRST_PURCHASE` if this is the first released escrow with them as buyer.
- Merchant gets `SELLER_FIRST_DELIVERY` if this is the first released escrow in the store.

**Steps:**

1. Operator runs `pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind buyer-first-purchase`.

2. The script:
   - Loads the order + escrow. Aborts if not `released`.
   - Resolves `recipient_pkh` and `recipient_address` from the catalog entry's `recipient_role`.
   - Calls `catalog[kind].eligibility(orderId, dbClient)`:
     - `BUYER_FIRST_PURCHASE`: `SELECT count(*) FROM escrows WHERE status='released' AND buyer_pkh = <recipient_pkh>` must equal 1 (the row for this order).
     - `SELLER_FIRST_DELIVERY`: `SELECT count(*) FROM escrows WHERE status='released'` must equal 1.
   - `SELECT ... FOR UPDATE` on `issued_badges` for `(kind, recipient_pkh)`. If a row exists, abort `BADGE_ALREADY_ISSUED`.
   - Derives `asset_name_hex = kind_id_2bytes ++ recipient_pkh_28bytes`.
   - Builds CIP-25 payload from catalog + dynamic fields.
   - Calls `submitMintBadge(kind, recipient_pkh, orderId)`:
     - tx3 resolves `mint_badge(recipient_pkh, kind_id, metadata)`.
     - Input: merchant UTxO for fees + min-ADA.
     - Mint: quantity 1 of `(policy_id, asset_name)`.
     - Output: NFT + min-ADA to `recipient_address`.
     - Metadata under label 721.
     - Redeemer: `Mint`. Signed by backend signer (merchant). `waitForConfirmed`.

3. After confirmation, in one SQL transaction: `INSERT INTO issued_badges (...)`.

4. Script prints `mint_tx_hash` + CardanoScan link.

### UI surfacing

- `order-confirmation.$orderId.tsx` queries `issued_badges WHERE triggering_order_id = <uuid>` and renders any rows in a "Badges issued" section.
- `wallet.$address.tsx` queries `issued_badges WHERE recipient_address = <bech32>` and renders all badges held by that wallet.

### Differences between the two badges

| Field | `BUYER_FIRST_PURCHASE` | `SELLER_FIRST_DELIVERY` |
|---|---|---|
| `kind_id` | `0x0001` | `0x0002` |
| `recipient_role` | buyer | merchant |
| `recipient_pkh` | `escrow.buyer_pkh` | derived from `MERCHANT_ADDRESS` |
| `recipient_address` | `orders.wallet_address` | `MERCHANT_ADDRESS` |
| `eligibility` | count of released escrows where this pkh is buyer == 1 | total count of released escrows == 1 |
| `name` (CIP-25) | "First Purchase" | "First Delivery" |
| `image` | `ipfs://Qm.../buyer-first-purchase.png` | `ipfs://Qm.../seller-first-delivery.png` |

## Error handling

| Failure | Detection | Response |
|---|---|---|
| Order doesn't exist or escrow not released | Pre-check in script | `ORDER_NOT_ELIGIBLE`. Print escrow status, exit non-zero. |
| Badge already issued for `(kind, recipient_pkh)` | UNIQUE in `issued_badges` | `BADGE_ALREADY_ISSUED`. Print existing `mint_tx_hash`, exit non-zero. |
| Eligibility check fails | Catalog `eligibility` returns false | `ELIGIBILITY_NOT_MET`. Print actual count and reason. |
| Merchant signer out of UTxOs | u5c | `MERCHANT_FUNDS_INSUFFICIENT`. Operator funds and retries. |
| Validator rejects (signature missing or quantity ≠ 1) | u5c submission error | `SCRIPT_VALIDATION_FAILED`. Full CBOR logged. Usually a builder bug, not runtime. |
| Malformed `recipient_pkh` | Script address derivation fails | `INVALID_RECIPIENT`. Abort before chain. |
| Invalid IPFS CID in catalog | Wallet/explorer fails to render image | Unit test ensures the catalog references reachable CIDs. Health-check IPFS before the demo. |
| Race: two operators mint same `(kind, recipient)` simultaneously | Two scripts pass the existence check before either inserts | `SELECT ... FOR UPDATE` over `issued_badges` serialises. Insert a placeholder row before submit and complete it post-confirmation. In milestone-mode with a single operator, this race is theoretical. |
| `waitForConfirmed` times out | tx in mempool, no block yet | Print warning + hash. Row inserted with the known tx_hash. If the tx never confirms, a future `reconcile-badges` script can detect the inconsistency (out of scope for milestone). |
| Burn attempt (negative quantity) | Validator rule "quantity == 1" rejects | tx rejected by node. No burn use case in milestone scope. |

## Validator edge cases (covered by Aiken tests)

1. Tx unsigned by merchant → fail.
2. Mint with quantity > 1 → fail.
3. Mint with quantity == 0 → fail.
4. Burn (quantity < 0) → fail.
5. Multiple assets minted under this policy in the same tx, one with quantity ≠ 1 → fail (the offending asset breaks the rule).

## Soulbound semantics (documented, not enforced)

The validator does not prevent the holder from transferring the NFT. This is documented in:

- The catalog `description`: "This badge is intended as a non-transferable reputation token. Transferring it forfeits its reputation meaning."
- `docs/advanced-onchain.md` (output D): explicit section on the trust model.
- In milestone-mode no transfer monitoring exists. A future indexer could mark any badge appearing at an address other than the mint destination as "compromised".

## Idempotency

- `UNIQUE(kind, recipient_pkh)` on `issued_badges` prevents repeat issuance.
- The asset_name convention enforces the same uniqueness on-chain.
- Re-running the script with the same args prints the existing `mint_tx_hash` and exits non-zero — useful when the operator forgets whether they already minted.

## Testing strategy

### Aiken unit tests (`aiken check`)

| Test | Asserts |
|---|---|
| `mint_success` | Merchant signs + 1 asset minted with quantity = 1 → valid. |
| `mint_wrong_signer` | Tx not signed by merchant → invalid. |
| `mint_quantity_above_one` | Quantity = 2 → invalid. |
| `mint_quantity_zero` | Quantity = 0 → invalid. |
| `mint_negative_burn` | Quantity = -1 → invalid. |
| `mint_multiple_assets_one_invalid` | Two assets under the policy, one with quantity = 2 → invalid. |
| `mint_with_other_policy_in_tx` | Tx mints under this policy + an unrelated policy → valid (only this policy is evaluated). |

CI: `.github/workflows/aiken-check.yml` runs on any PR touching `aiken/`.

### TS unit tests (Vitest)

- `badges.test.ts` — mocks u5c + signer + DB; asserts `submitMintBadge` builds the right redeemer, derives the expected asset_name, attaches well-formed CIP-25 metadata, and persists the `issued_badges` row.
- `badges-catalog.test.ts` — for each catalog entry: unique `kind_id`, valid `ipfs_image_cid` format, eligibility works against a mock dataset.
- `badges-policy.test.ts` — deterministic policy_id derivation from a fixture merchant_pkh.
- `asset-name-derivation.test.ts` — `kind_id ++ recipient_pkh` always 30 bytes; distinct inputs produce distinct asset_names.

### E2E against dolos

Reuses the escrow → release flow as precondition.

| Test | Asserts |
|---|---|
| `badge_buyer_first_purchase.e2e.ts` | Lock → mark-shipped → release → mint-badge buyer-first-purchase. NFT at buyer_address with expected asset_name. |
| `badge_seller_first_delivery.e2e.ts` | Same flow with `--kind seller-first-delivery`. NFT at merchant address. |
| `badge_already_issued.e2e.ts` | Re-running mint with same args aborts with `BADGE_ALREADY_ISSUED`; no second NFT. |
| `badge_not_eligible.e2e.ts` | Buyer has 2 released escrows. Second mint attempt aborts with `ELIGIBILITY_NOT_MET`. |
| `badge_validator_rejects_quantity_2.e2e.ts` | Manually crafted tx with quantity=2 rejected by node. |
| `badge_in_wallet_query.e2e.ts` | After mint, the NFT is queryable in the buyer's UTxOs with parseable CIP-25 metadata. |

### Preview evidence run (C2)

`.env.preview` reuses the same `CARDANO_MERCHANT_SKEY` as A and B. Demo escrow timeouts (`300s` each) make a full end-to-end demo possible in under 15 minutes.

**Demo script:**

1. Lock escrow (10 ADA). Capture tx hash. (Also covers "paid" event for A/B.)
2. Mark shipped. Wait 6 min.
3. Release. Capture tx hash. (Completed event for A.)
4. `pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind buyer-first-purchase`. Capture **tx hash 1**.
5. `pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind seller-first-delivery`. Capture **tx hash 2**.
6. Open `preview.cexplorer.io/tx/<tx_hash_1>`. Show the mint panel with the asset, policy_id, and rendered CIP-25 metadata.
7. Repeat for tx_hash_2.
8. Open `/wallet/<buyer_address>` in the app. Show the "First Purchase" badge.
9. Open `/wallet/<merchant_address>`. Show the "First Delivery" badge.

The two mint tx hashes go into `docs/advanced-onchain.md` (output D) under section C.

## Milestone coverage

- **C1** ("at least 2 test badge tokens issued"): steps 4 and 5 — one buyer badge + one seller badge.
- **C2** ("link to on-chain transactions"): the two captured tx hashes.

## Open questions / future improvements

- **Threshold badges** — `TRUSTED_BUYER` after N purchases, `TRUSTED_SELLER` after N deliveries. Add by extending the catalog with new `kind_id`s and eligibility queries. No validator change required.
- **On-chain soulbound** — lock the user-token in a script address tied to the recipient, requiring recipient signature to spend. Future iteration.
- **Burn redeemer** — currently no way to retire a badge. Add a `Burn` redeemer requiring the recipient signature.
- **Reputation aggregator UI** — a leaderboard page summing badges across wallets. Could surface the merchant's full badge history.
- **Reconcile-badges script** — to handle the rare case where `waitForConfirmed` times out and the tx eventually fails. Out of scope for milestone.
- **IPFS pinning service** — milestone assumes the badge images are pinned by the developer. Production should use a paid pinning service or a self-hosted gateway.

## Implementation phases (preview — actual plan goes through writing-plans)

1. **Phase 0 — Aiken minting policy:** validator + 7 unit tests. Compile and commit `plutus.json` with the badges policy alongside the escrow policy.
2. **Phase 1 — DB:** `issued_badges` migration + types + repo helpers.
3. **Phase 2 — catalog + policy module:** `badges-catalog.ts`, `badges-policy.ts`, unit tests. Upload badge images to IPFS, commit CIDs.
4. **Phase 3 — tx3 transaction:** `mint_badge` definition, regenerate ts-client.
5. **Phase 4 — `badges.ts` orchestrator:** `submitMintBadge` + unit tests.
6. **Phase 5 — CLI script:** `mint-badge.ts` with the full pre-check flow.
7. **Phase 6 — UI:** `BadgeList` component, `wallet.$address.tsx` route, order-confirmation integration.
8. **Phase 7 — e2e against dolos:** the 6 e2e tests passing.
9. **Phase 8 — preview evidence:** mint two badges on preview, capture tx hashes, append to `docs/advanced-onchain.md`.
