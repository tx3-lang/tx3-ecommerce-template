// badge_types.ak
// Minting-policy redeemer for on-chain reputation badges.
// Consumed by validators/badges.ak and off-chain token-construction tooling.

/// Action to perform when minting (or burning) a badge token.
pub type BadgeRedeemer {
  Mint
}