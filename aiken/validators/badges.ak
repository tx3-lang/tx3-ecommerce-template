use aiken/crypto.{VerificationKeyHash}
use cardano/transaction.{PolicyId, Transaction}
use badge_types.{BadgeRedeemer}

validator badges(merchant_pkh: VerificationKeyHash) {
  mint(redeemer: BadgeRedeemer, policy_id: PolicyId, self: Transaction) {
    False
  }
  else(_) {
    fail
  }
}