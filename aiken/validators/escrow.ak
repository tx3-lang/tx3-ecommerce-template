use cardano/transaction.{OutputReference, Transaction}

/// Escrow validator — scaffold only.
/// All handlers currently reject every transaction.
/// Real state-machine logic (Pending → Shipped → Released/Refunded)
/// will be added in subsequent tasks.
validator escrow {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _input: OutputReference,
    _ctx: Transaction,
  ) {
    False
  }

  else(_) {
    fail
  }
}
