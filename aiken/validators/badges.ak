use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use badge_types.{BadgeRedeemer}
use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction, placeholder}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const merchant_vkh: ByteArray =
  #"11223344112233441122334411223344112233441122334411223344"

const other_vkh: ByteArray =
  #"aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd"

const badges_policy_id: ByteArray =
  #"0b0c0d0e0f0b0c0d0e0f0b0c0d0e0f0b0c0d0e0f0b0c0d0e0f0b0c0d"

const other_policy_id: ByteArray =
  #"a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0"

const asset_a: ByteArray = #"0001aabbccddaabbccddaabbccddaabbccdd"

const asset_b: ByteArray = #"0002aabbccddaabbccddaabbccddaabbccdd"

// ---------------------------------------------------------------------------
// Mint logic
// ---------------------------------------------------------------------------

fn check_mint(
  merchant_pkh: VerificationKeyHash,
  policy_id: PolicyId,
  self: Transaction,
) -> Bool {
  let merchant_signed = list.has(self.extra_signatories, merchant_pkh)

  let tokens_for_policy = assets.tokens(self.mint, policy_id)

  let has_tokens = !dict.is_empty(tokens_for_policy)

  let all_qty_one =
    tokens_for_policy
      |> dict.values
      |> list.all(fn(qty) { qty == 1 })

  merchant_signed && has_tokens && all_qty_one
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

validator badges(merchant_pkh: VerificationKeyHash) {
  mint(_redeemer: BadgeRedeemer, policy_id: PolicyId, self: Transaction) {
    check_mint(merchant_pkh, policy_id, self)
  }

  else(_) {
    fail
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// mint_success: Merchant signs + 1 asset with qty 1 → True
test mint_success() {
  let mint_value =
    assets.zero
      |> assets.add(badges_policy_id, asset_a, 1)

  let tx =
    Transaction {
      ..placeholder,
      mint: mint_value,
      extra_signatories: [merchant_vkh],
    }

  check_mint(merchant_vkh, badges_policy_id, tx)
}

/// mint_wrong_signer: Tx signed by other key → False
test mint_wrong_signer() {
  let mint_value =
    assets.zero
      |> assets.add(badges_policy_id, asset_a, 1)

  let tx =
    Transaction {
      ..placeholder,
      mint: mint_value,
      extra_signatories: [other_vkh],
    }

  !check_mint(merchant_vkh, badges_policy_id, tx)
}

/// mint_quantity_above_one: Asset with qty 2 → False
test mint_quantity_above_one() {
  let mint_value =
    assets.zero
      |> assets.add(badges_policy_id, asset_a, 2)

  let tx =
    Transaction {
      ..placeholder,
      mint: mint_value,
      extra_signatories: [merchant_vkh],
    }

  !check_mint(merchant_vkh, badges_policy_id, tx)
}

/// mint_quantity_zero: No mint entries for this policy → False
test mint_quantity_zero() {
  let tx =
    Transaction {
      ..placeholder,
      mint: assets.zero,
      extra_signatories: [merchant_vkh],
    }

  !check_mint(merchant_vkh, badges_policy_id, tx)
}

/// mint_negative_burn: Asset with qty -1 → False
test mint_negative_burn() {
  let mint_value =
    assets.zero
      |> assets.add(badges_policy_id, asset_a, -1)

  let tx =
    Transaction {
      ..placeholder,
      mint: mint_value,
      extra_signatories: [merchant_vkh],
    }

  !check_mint(merchant_vkh, badges_policy_id, tx)
}

/// mint_multiple_assets_one_invalid: Two assets, one qty=1, one qty=2 → False
test mint_multiple_assets_one_invalid() {
  let mint_value =
    assets.zero
      |> assets.add(badges_policy_id, asset_a, 1)
      |> assets.add(badges_policy_id, asset_b, 2)

  let tx =
    Transaction {
      ..placeholder,
      mint: mint_value,
      extra_signatories: [merchant_vkh],
    }

  !check_mint(merchant_vkh, badges_policy_id, tx)
}

/// mint_with_other_policy_in_tx: Mints under this policy (valid) + another policy → True
test mint_with_other_policy_in_tx() {
  let mint_value =
    assets.zero
      |> assets.add(badges_policy_id, asset_a, 1)
      |> assets.add(other_policy_id, asset_a, 5)

  let tx =
    Transaction {
      ..placeholder,
      mint: mint_value,
      extra_signatories: [merchant_vkh],
    }

  check_mint(merchant_vkh, badges_policy_id, tx)
}
