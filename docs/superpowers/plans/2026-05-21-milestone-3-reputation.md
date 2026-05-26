# Milestone 3 / Feature C — On-chain Reputation Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mint two unique, soulbound (off-chain) NFTs to recognise milestone interactions in the store: `BUYER_FIRST_PURCHASE` for buyers and `SELLER_FIRST_DELIVERY` for the merchant. Produces 2 verifiable preview tx hashes for milestone evidence C2 and consolidates milestone-wide documentation for output D.

**Architecture:** One Aiken minting policy parameterised by `merchant_pkh`, with a single `Mint` redeemer requiring merchant signature + quantity-exactly-1. The off-chain CLI script enforces eligibility (first-of-kind for the recipient) by querying DB. Asset names encode `(kind_id, recipient_pkh)` to guarantee uniqueness; CIP-25 metadata (label 721) provides wallet/explorer rendering. Issued badges are persisted in a new `issued_badges` table with a UNIQUE constraint on `(kind, recipient_pkh)`.

**Tech Stack:** Aiken (Plutus V3 minting policy), TypeScript, `tx3-sdk`, Supabase, IPFS (static image hosting), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-20-milestone-3-reputation-design.md`
**Cross-cutting decisions:** `docs/superpowers/specs/2026-05-20-milestone-3-overview.md`
**Depends on:** plan A (chain plumbing) and plan B (Aiken project + `aiken/plutus.json` produced for escrow; escrow `Released` is the trigger for badge eligibility).

**Convention notes:**
- No code blocks in this plan by user preference. Each step states its goal; technical details (validator rules, asset_name format, CIP-25 metadata shape) live in the spec.
- Every TypeScript task closes with `pnpm lint && pnpm check && pnpm test`. Aiken tasks close with `aiken check`.
- Migration filename placeholder `2026MMDD` is replaced at implementation time with the current YYYYMMDD.

---

### Task 1: Aiken minting policy — types and validator scaffold

**Goal:** Add the badges minting policy alongside the existing escrow validator. Reuse the Aiken project, CI workflow, and `plutus.json` build flow set up in plan B.

**Files:**
- Create: `aiken/validators/badges.ak`
- Create: `aiken/lib/badge_types.ak`

**Spec reference:** Reputation design §"Minting policy" §"Parameters" and §"Redeemer".

- [ ] **Step 1: Write `aiken/lib/badge_types.ak`** — Goal: define `BadgeRedeemer { Mint }`. (No Burn in milestone-mode.)
- [ ] **Step 2: Write the validator scaffold in `aiken/validators/badges.ak`** — Goal: declares `validator badges(merchant_pkh: VerificationKeyHash) { mint(redeemer: BadgeRedeemer, policy_id: PolicyId, self: Transaction) { ... } }` with a body that always rejects. Compiles cleanly.
- [ ] **Step 3: Run `aiken check`** — Expected: PASS (only scaffold; no tests yet). Both escrow and badges validators compile together.
- [ ] **Step 4: Commit** — `feat(aiken): scaffold badges minting policy`.

---

### Task 2: Minting policy rules and tests

**Goal:** Implement and verify the two on-chain invariants: merchant-signed + every minted asset under this policy has quantity exactly 1.

**Files:**
- Modify: `aiken/validators/badges.ak`

**Spec reference:** Reputation design §"Rules", §"Validator edge cases".

- [ ] **Step 1: Write failing Aiken tests** — One `test` block per spec row: `mint_success`, `mint_wrong_signer`, `mint_quantity_above_one`, `mint_quantity_zero`, `mint_negative_burn`, `mint_multiple_assets_one_invalid`, `mint_with_other_policy_in_tx`. Each test constructs the transaction context inline using stdlib helpers.
- [ ] **Step 2: Run `aiken check`** — Expected: FAIL (validator still rejects).
- [ ] **Step 3: Implement the mint branch** — Goal: checks `list.has(self.extra_signatories, merchant_pkh)`; iterates over `self.mint` entries for this policy_id and asserts each quantity == 1; ignores assets under other policy_ids.
- [ ] **Step 4: Run `aiken check`** — Expected: ALL PASS (badges + escrow tests).
- [ ] **Step 5: Rebuild `plutus.json`** — Run: `aiken build`. The regenerated `aiken/plutus.json` now contains both validators. Commit it alongside the code changes.
- [ ] **Step 6: Commit** — `feat(aiken): implement and test badges minting policy`.

---

### Task 3: `issued_badges` migration

**Goal:** Add the DB table that records each badge issued, with UNIQUE protection against double-mint.

**Files:**
- Create: `supabase/migrations/2026MMDD_issued_badges.sql`

**Spec reference:** Reputation design §"`issued_badges` schema".

- [ ] **Step 1: Inspect existing migrations** — Reuse RLS and trigger patterns from plan A's `order_events` and plan B's `escrows` migrations.
- [ ] **Step 2: Write the migration** — Goal: matches spec schema (all columns, CHECK on kind, UNIQUE `(kind, recipient_pkh)`, indexes on recipient and order). RLS: SELECT public (badges are public reputation), INSERT only via service role.
- [ ] **Step 3: Apply locally** — Run: `pnpm supabase db reset --local`. Expected: clean apply.
- [ ] **Step 4: Verify schema with `\d issued_badges`** — Confirm columns and constraints.
- [ ] **Step 5: Commit** — `feat(db): add issued_badges table for reputation badges`.

---

### Task 4: Type declarations and repo helpers

**Goal:** Typed access from TS to `issued_badges`.

**Files:**
- Modify: `@types/database.d.ts`
- Create: `src/server-fns/issued-badges.ts`
- Create: `src/server-fns/__tests__/issued-badges.test.ts`

**Spec reference:** Reputation design §"Modified files" (`@types/database.d.ts` row).

- [ ] **Step 1: Write failing tests for the repo helpers**
  - Test: `insertIssuedBadge` inserts the row and returns it.
  - Test: a second insert with the same `(kind, recipient_pkh)` raises a typed `BADGE_ALREADY_ISSUED` error containing the original `mint_tx_hash`.
  - Test: `listBadgesByRecipient(address)` returns rows ordered by `minted_at`.
  - Test: `listBadgesByOrder(orderId)` returns rows linked via `triggering_order_id`.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Add `IssuedBadge` to `@types/database.d.ts`** — Matches the spec.
- [ ] **Step 4: Implement `src/server-fns/issued-badges.ts`** — Goal: the four helpers above using the service-role Supabase client.
- [ ] **Step 5: Run the tests** — Expected: PASS.
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(db): add issued_badges repo helpers and types`.

---

### Task 5: Badges catalog module

**Goal:** Single source of truth for the two badge kinds: id, name, description, IPFS image CID, recipient role, and eligibility predicate.

**Files:**
- Create: `src/lib/cardano/badges-catalog.ts`
- Create: `src/lib/cardano/__tests__/badges-catalog.test.ts`
- Create: `public/badges/buyer-first-purchase.png`
- Create: `public/badges/seller-first-delivery.png`

**Spec reference:** Reputation design §"Components" (`badges-catalog.ts` row), §"CIP-25 metadata".

- [ ] **Step 1: Design and place badge images** — Goal: two PNGs roughly 512x512. Save under `public/badges/` and upload the same files to IPFS (via web3.storage, nft.storage, or any pinning service). Note the CIDs for use in the catalog.
- [ ] **Step 2: Write failing tests for the catalog**
  - Test: each entry has a unique `kind_id` (2 bytes).
  - Test: each entry has a well-formed IPFS CID string (`ipfs://Qm...` or `ipfs://baf...`).
  - Test: `getCatalogEntry('buyer_first_purchase')` returns the buyer entry with `recipient_role='buyer'`.
  - Test: `getCatalogEntry('seller_first_delivery')` returns the seller entry with `recipient_role='merchant'`.
  - Test: `eligibility` predicate for `BUYER_FIRST_PURCHASE` returns true when the buyer has exactly 1 escrow released (the current order) and false otherwise. Use a mock dbClient.
  - Test: `eligibility` predicate for `SELLER_FIRST_DELIVERY` returns true when there is exactly 1 escrow released store-wide and false otherwise.
- [ ] **Step 3: Run the tests** — Expected: FAIL.
- [ ] **Step 4: Implement the catalog** — Goal: a typed const exported as a record keyed by `kind` (`'buyer_first_purchase' | 'seller_first_delivery'`). Each entry includes the fields tested above. Use the IPFS CIDs from Step 1.
- [ ] **Step 5: Run the tests** — Expected: PASS.
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(cardano): add badges catalog and assets`.

---

### Task 6: Badges policy loader

**Goal:** Load the compiled minting policy from `aiken/plutus.json` and expose the policy_id derived from `merchant_pkh`.

**Files:**
- Create: `src/lib/cardano/badges-policy.ts`
- Create: `src/lib/cardano/__tests__/badges-policy.test.ts`

**Spec reference:** Reputation design §"Components" (`badges-policy.ts` row), §"Minting policy" §"Parameters".

- [ ] **Step 1: Write failing tests**
  - Test: `getPolicyId()` returns a 28-byte hex string derived deterministically from a fixture `merchant_pkh`.
  - Test: changing the fixture `merchant_pkh` changes the policy_id.
  - Test: `getBadgesScriptCbor()` returns the script bytes from `plutus.json`.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `badges-policy.ts`** — Goal: read `aiken/plutus.json`, apply the `merchant_pkh` parameter to the validator (using `tx3-sdk` or `@emurgo/cardano-serialization-lib-nodejs`), derive the policy_id (script hash). Memoise.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(cardano): add badges policy loader`.

---

### Task 7: Asset name derivation helper

**Goal:** Pure function that converts `(kind, recipient_pkh)` → asset_name hex per the spec's convention (30 bytes: 2-byte kind_id + 28-byte recipient_pkh).

**Files:**
- Create: `src/lib/cardano/badges-asset-name.ts`
- Create: `src/lib/cardano/__tests__/badges-asset-name.test.ts`

**Spec reference:** Reputation design §"Asset name convention".

- [ ] **Step 1: Write failing tests**
  - Test: result is always 60 hex chars (30 bytes).
  - Test: the first 4 hex chars match the catalog `kind_id` (e.g., `0001` for buyer, `0002` for seller).
  - Test: the remaining 56 hex chars equal the recipient_pkh.
  - Test: different `(kind, recipient_pkh)` pairs produce different asset_names.
  - Test: invalid recipient_pkh (wrong length) is rejected with a clear error.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `deriveAssetName(kind, recipientPkh)`** — Goal: pure function, no IO, deterministic.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(cardano): add asset name derivation for badges`.

---

### Task 8: tx3 `mint_badge` transaction

**Goal:** Define the tx3 transaction that mints a single badge NFT to a recipient with CIP-25 metadata attached.

**Files:**
- Modify: `tx3/main.tx3`
- Modify: `tx3/trix.toml` (already references `plutus.json` for escrow; ensure both validators are visible)
- Regenerated: `src/lib/tx3/protocol.ts`

**Spec reference:** Reputation design §"Modified files" (`tx3/main.tx3` row).

- [ ] **Step 1: Add `mint_badge(recipient_pkh, kind_id, metadata)` to `tx3/main.tx3`** — Goal: takes `recipient_pkh: Bytes`, `kind_id: Bytes` (2 bytes), `metadata: Bytes` (CIP-25 payload as serialised metadata). Input: a merchant UTxO covering fees + min-ADA. Mint: 1 unit of `(badges_policy, kind_id ++ recipient_pkh)`. Output: the NFT + min-ADA to the recipient address. Metadata under label 721. Confirm tx3 syntax for parameterised script policies via the latest tx3 docs.
- [ ] **Step 2: Verify the badges party is declared** — `party Badges as MintingPolicy(...)` referencing the validator. Add if missing.
- [ ] **Step 3: Regenerate the ts-client** — Run: `pnpm trix bindgen`. Commit the regenerated `protocol.ts`.
- [ ] **Step 4: Lint + typecheck** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(tx3): add mint_badge transaction`.

---

### Task 9: Badges orchestrator (`badges.ts`)

**Goal:** TS function that builds the CIP-25 payload, derives the asset_name, drives `tx3-sdk` resolve→sign→submit→waitForConfirmed, and persists the result.

**Files:**
- Create: `src/lib/cardano/badges.ts`
- Create: `src/lib/cardano/__tests__/badges.test.ts`

**Spec reference:** Reputation design §"Components" (`badges.ts` row), §"Data flow" §"Steps".

- [ ] **Step 1: Write failing tests for `submitMintBadge(kind, recipientPkh, recipientAddress, orderId)`**
  - Test: builds CIP-25 metadata matching the spec shape (`name`, `image` from IPFS CID, `description`, `kind`, `order_id`, `merchant`, `issued_at`) under the policy_id and asset_name_hex.
  - Test: routes the NFT output to `recipientAddress` (not just `recipient_pkh`).
  - Test: signs with the backend signer.
  - Test: returns `{ assetName, txHash, metadata }` when `waitForConfirmed` resolves.
  - Test: surfaces u5c errors unchanged.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `submitMintBadge`** — Goal: composes catalog lookup + asset_name derivation + payload build + tx3 invocation. Single function, no side effects on DB (the calling script persists).
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(cardano): add badges orchestrator submitMintBadge`.

---

### Task 10: CLI script `mint-badge.ts`

**Goal:** `pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind <buyer-first-purchase|seller-first-delivery>` validates eligibility, derives recipient, calls the orchestrator, persists the row, and prints the tx hash.

**Files:**
- Create: `scripts/mint-badge.ts`
- Create: `scripts/__tests__/mint-badge.test.ts`

**Spec reference:** Reputation design §"Data flow" §"Steps", §"Error handling".

- [ ] **Step 1: Write failing tests**
  - Test: arg parsing rejects missing `--order-id` or invalid `--kind`.
  - Test: loads the order + escrow; aborts with `ORDER_NOT_ELIGIBLE` if escrow status ≠ `released`.
  - Test: resolves `recipient_pkh` and `recipient_address` per the catalog's `recipient_role` (buyer → from escrow + order; merchant → from env).
  - Test: calls `catalog[kind].eligibility(orderId, dbClient)`; aborts with `ELIGIBILITY_NOT_MET` when false (e.g., not the buyer's first purchase).
  - Test: acquires a row lock or uses an existence check on `issued_badges (kind, recipient_pkh)`; aborts with `BADGE_ALREADY_ISSUED` when present and prints the existing `mint_tx_hash`.
  - Test: on success, calls `submitMintBadge` and inserts an `issued_badges` row in one SQL transaction.
  - Test: on submission failure, rolls back; no row inserted.
  - Test: prints tx hash + explorer URL.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `scripts/mint-badge.ts`** — Goal: same pattern as the escrow scripts (CLI parsing, service-role client, orchestrator call, atomic DB update). Reuse shared CLI utilities from plan A/B if available.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Smoke test against dolos** — Lock + mark-shipped + release on a fixture order; then mint each badge; verify rows and chain state.
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(scripts): add mint-badge CLI`.

---

### Task 11: `BadgeList` component

**Goal:** Reusable UI component that renders a list of `IssuedBadge` rows with image, name, and explorer link.

**Files:**
- Create: `src/components/badges/BadgeList.tsx`
- Create: `src/components/badges/__tests__/BadgeList.test.tsx`

**Spec reference:** Reputation design §"Components" (`BadgeList.tsx` row), §"UI surfacing".

- [ ] **Step 1: Write failing tests**
  - Test: renders one card per badge passed in props.
  - Test: each card shows the badge name, image (IPFS URL converted to HTTP gateway for browser rendering), and a link to the mint tx on the explorer matching the network profile.
  - Test: empty list renders an explicit empty state ("No badges yet").
  - Test: orders badges by `minted_at` descending.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement `BadgeList.tsx`** — Goal: pure presentational; resolves IPFS URLs via a single HTTP gateway constant (e.g., `https://ipfs.io/ipfs/`). Follows project styling.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 6: Commit** — `feat(badges): add BadgeList component`.

---

### Task 12: Wallet profile route `wallet.$address.tsx`

**Goal:** Public route that shows all badges held by a given wallet address. Used in the milestone video to demonstrate the end-state visually.

**Files:**
- Create: `src/routes/wallet.$address.tsx`
- Create: `src/routes/__tests__/wallet.$address.test.tsx` (or co-located route test if the project convention differs)

**Spec reference:** Reputation design §"Components" (`wallet.$address.tsx` row).

- [ ] **Step 1: Write failing tests**
  - Test: route fetches `issued_badges WHERE recipient_address = <bech32>` via the existing data-fetching pattern (TanStack Query or server-fn).
  - Test: renders the address (truncated) as a heading and `<BadgeList>` with the fetched rows.
  - Test: 404 or empty-state UI when no badges exist for the address.
- [ ] **Step 2: Run the tests** — Expected: FAIL.
- [ ] **Step 3: Implement the route** — Goal: follow the project's existing dynamic-route pattern (see `order-confirmation.$orderId.tsx` for a reference). Use `listBadgesByRecipient` from Task 4.
- [ ] **Step 4: Run the tests** — Expected: PASS.
- [ ] **Step 5: Manual UI verification** — Run `pnpm dev`, navigate to `/wallet/<buyer-test-address>`, confirm rendering works against the local DB.
- [ ] **Step 6: Lint + typecheck + test** — Expected: ALL PASS.
- [ ] **Step 7: Commit** — `feat(routes): add wallet profile page with badges`.

---

### Task 13: Surface badges on the order-confirmation page

**Goal:** Show any badges issued for the current order on the existing order-confirmation page.

**Files:**
- Modify: `src/routes/order-confirmation.$orderId.tsx`

**Spec reference:** Reputation design §"Modified files" (`order-confirmation.$orderId.tsx` row).

- [ ] **Step 1: Read the current route and confirm where to inject the section** — Below the timeline (plan A) and the escrow state card (plan B).
- [ ] **Step 2: Add the fetch** — Use `listBadgesByOrder(orderId)` from Task 4.
- [ ] **Step 3: Render with `<BadgeList>` inside a labeled section** — Goal: only render the section when at least one badge exists for the order. Use the project's section/card conventions.
- [ ] **Step 4: Manual UI verification** — Run `pnpm dev`; verify the section appears after minting and is absent before.
- [ ] **Step 5: Lint + typecheck + test** — Expected: ALL PASS. (Component tests already cover `BadgeList`; no new component-level tests added here.)
- [ ] **Step 6: Commit** — `feat(order): show issued badges on order confirmation`.

---

### Task 14: E2E test suite against dolos

**Goal:** Verify the badge minting flow end-to-end against dolos. Reuses the escrow → release fixture from plan B.

**Files:**
- Create: `tests/e2e/badge_buyer_first_purchase.e2e.ts`
- Create: `tests/e2e/badge_seller_first_delivery.e2e.ts`
- Create: `tests/e2e/badge_already_issued.e2e.ts`
- Create: `tests/e2e/badge_not_eligible.e2e.ts`
- Create: `tests/e2e/badge_validator_rejects_quantity_2.e2e.ts`
- Create: `tests/e2e/badge_in_wallet_query.e2e.ts`

**Spec reference:** Reputation design §"Testing strategy" §"E2E against dolos".

- [ ] **Step 1: Reuse the dolos fixture from plan B** — Asserts: lock + mark-shipped + release succeeds before each badge test.
- [ ] **Step 2: Write `badge_buyer_first_purchase.e2e.ts`** — Asserts: mint-badge buyer-first-purchase yields a confirmed tx and an NFT at the buyer's address with the expected asset_name.
- [ ] **Step 3: Write `badge_seller_first_delivery.e2e.ts`** — Asserts: mint-badge seller-first-delivery yields an NFT at the merchant address.
- [ ] **Step 4: Write `badge_already_issued.e2e.ts`** — Asserts: re-running mint with same args aborts with `BADGE_ALREADY_ISSUED` and does not create a second NFT.
- [ ] **Step 5: Write `badge_not_eligible.e2e.ts`** — Asserts: setup with 2 released escrows for the same buyer; second mint attempt for `buyer-first-purchase` aborts with `ELIGIBILITY_NOT_MET`.
- [ ] **Step 6: Write `badge_validator_rejects_quantity_2.e2e.ts`** — Asserts: manually crafting a mint with quantity = 2 (bypassing the script, using tx3-sdk directly) is rejected by the node with a script-validation error.
- [ ] **Step 7: Write `badge_in_wallet_query.e2e.ts`** — Asserts: after a successful mint, the NFT is queryable in the recipient's UTxOs with CIP-25 metadata parseable to the same payload the script wrote.
- [ ] **Step 8: Run all e2e tests** — Run: `pnpm test:e2e`. Expected: ALL PASS.
- [ ] **Step 9: Commit** — `test(badges): add full e2e suite against dolos`.

---

### Task 15: Preview evidence run

**Goal:** Mint both badges on preview after a real escrow release; capture 2 mint tx hashes for C2.

**Files:**
- Modify: `docs/advanced-onchain.md`

**Spec reference:** Reputation design §"Preview evidence run", §"Milestone coverage".

- [ ] **Step 1: Ensure `.env.preview` is configured** — Same env as plans A and B; demo escrow timeouts (300s each).
- [ ] **Step 2: Run a full escrow lifecycle on preview** — Lock + mark-shipped + release per plan B's Task 19 procedure. (If plan B's evidence run already produced a released order, reuse it.)
- [ ] **Step 3: Mint the buyer badge** — Run `pnpm tsx scripts/mint-badge.ts --order-id <uuid> --kind buyer-first-purchase`. Capture tx hash 1.
- [ ] **Step 4: Mint the seller badge** — Run with `--kind seller-first-delivery`. Capture tx hash 2.
- [ ] **Step 5: Verify each mint on `preview.cexplorer.io`** — Open both txs; confirm the mint panel shows the asset and the CIP-25 metadata renders with the image.
- [ ] **Step 6: Verify in-app rendering** — Open `/wallet/<buyer_address>` and `/wallet/<merchant_address>` against `.env.preview`; confirm the badges render.
- [ ] **Step 7: Append to `docs/advanced-onchain.md`** — Add a "Feature C — Reputation" section with the 2 mint tx hashes as markdown links to the explorer.
- [ ] **Step 8: Commit** — `docs: capture milestone 3 reputation badge evidence`.

---

### Task 16: Output D — consolidate milestone documentation

**Goal:** Final pass on `docs/advanced-onchain.md` and the user guide so the public repo + docs satisfy outputs D1 and D2 of the grant.

**Files:**
- Modify: `docs/advanced-onchain.md`
- Modify: `docs/USER_GUIDE.md` (add a section linking to advanced-onchain)
- Modify: `README.md` (top-level pointer to advanced features doc)

**Spec reference:** Overview §"Roadmap" (D row), §"Acceptance evidence".

- [ ] **Step 1: Audit `docs/advanced-onchain.md`** — Goal: confirm all three feature sections (A, B, C) are present with their tx hashes from Tasks A14, B19, C15. Confirm explorer links open correctly.
- [ ] **Step 2: Add a top-level introduction to `docs/advanced-onchain.md`** — Sections to write:
  - Overview of milestone 3 features and their relationship.
  - The trust model (off-chain soulbound, off-chain admin auth in milestone-mode).
  - Environment setup for reviewers (which env vars, which network, where to get test ADA, which dolos / TRP endpoints).
  - Step-by-step "how to deploy" — Aiken build, migration apply, tx3 bindgen, env vars, run the demo scripts.
  - Step-by-step "how to use" — happy-path lifecycle from buyer checkout through badge minting.
  - Limitations and out-of-scope items (the lists from each spec's "Open questions").
- [ ] **Step 3: Add a link from `docs/USER_GUIDE.md`** — Goal: a short pointer at the top: "For on-chain advanced features (traceability, escrow, reputation), see `advanced-onchain.md`."
- [ ] **Step 4: Add a link from `README.md`** — Goal: section "Advanced on-chain features" with the same pointer.
- [ ] **Step 5: Self-review the docs for completeness against the grant's output D** — Confirm every grant requirement is covered (deploy steps, usage steps, evidence links).
- [ ] **Step 6: Commit** — `docs: consolidate milestone 3 advanced on-chain features documentation`.

---

## Self-review

**Spec coverage check:**
- C1 (reputation metrics + ≥2 badge tokens issued) → Tasks 10 (CLI) and 15 (preview run minting both badges).
- C2 (link to on-chain transactions for 2 test badge tokens) → Task 15.
- Validator architecture (single Mint redeemer with merchant sig + quantity == 1) → Task 2.
- Catalog of 2 badges (BUYER_FIRST_PURCHASE, SELLER_FIRST_DELIVERY) → Task 5.
- Asset name uniqueness → Task 7.
- CIP-25 metadata → Task 9.
- DB persistence + double-mint protection → Tasks 3, 4, 10.
- Buyer-facing surface (per-order + wallet profile) → Tasks 11, 12, 13.
- Output D (documentation) → Task 16.

**Placeholder scan:** No "TBD" / "implement later". `2026MMDD` migration filename is the only placeholder, called out in Task 3.

**Consistency:** Function names used across tasks (`getCatalogEntry`, `getPolicyId`, `getBadgesScriptCbor`, `deriveAssetName`, `submitMintBadge`, `insertIssuedBadge`, `listBadgesByRecipient`, `listBadgesByOrder`) appear with the same spelling everywhere. Kind values (`buyer_first_purchase`, `seller_first_delivery`) appear identically in the DB CHECK, the catalog, the CLI flag, and the tests.

**Cross-plan dependency:** Tasks 1-2 extend the Aiken project introduced by plan B's Tasks 1-5; reuses the existing `aiken/aiken.toml` and CI workflow. Task 10 (mint-badge) reads the escrow state set by plan B's release scripts. Task 13 modifies the order-confirmation route already modified by plans A and B; order of changes matters at integration time.

**Out of scope (per milestone-mode trim):** threshold badges, on-chain soulbound enforcement, Burn redeemer, reconcile-badges script, reputation leaderboard UI, paid IPFS pinning service. Documented under "Open questions / future improvements" in the spec.
