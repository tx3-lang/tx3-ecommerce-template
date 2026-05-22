// escrow_types.ak
// Shared datum and redeemer types for the on-chain escrow validator.
// Consumed by validators/escrow.ak and any off-chain tooling that needs
// to construct or inspect escrow UTxOs.

use aiken/crypto.{VerificationKeyHash}

/// POSIX time in milliseconds since the Unix epoch.
/// Equivalent to the Int type; defined as an alias for readability.
pub type PosixTime =
  Int

/// Escrow datum carried in every locked UTxO.
///
/// State machine encoding via `grace_period_end`:
///   - `None`    → Pending  (locked, awaiting shipment confirmation)
///   - `Some(t)` → Shipped  (merchant confirmed; release allowed once slot ≥ t)
pub type EscrowDatum {
  /// Buyer's payment verification key hash.
  buyer: VerificationKeyHash,
  /// Merchant's payment verification key hash.
  merchant: VerificationKeyHash,
  /// Off-chain order identifier (DB UUID, 16 bytes).
  order_id: ByteArray,
  /// POSIX timestamp of the lock transaction (captured at lock time).
  paid_at: PosixTime,
  /// Deadline by which the merchant must ship (paid_at + ship_window).
  ship_deadline: PosixTime,
  /// None in Pending state; Some(t) in Shipped state where
  /// t = shipped_at + grace_period (earliest slot the buyer may release funds).
  grace_period_end: Option<PosixTime>,
}

/// Escrow redeemer — the action submitted when spending the locked UTxO.
pub type EscrowRedeemer {
  /// Merchant confirms shipment.  Sets grace_period_end = shipped_at + grace_period.
  MarkShipped { shipped_at: PosixTime }
  /// Buyer (or anyone after grace period) releases funds to the merchant.
  Release
  /// Buyer claims a refund (e.g. ship_deadline passed without shipment).
  Refund
}

// ---------------------------------------------------------------------------
// Tests — basic construction and field-access sanity checks
// ---------------------------------------------------------------------------

/// Construct a Pending datum (grace_period_end = None) and verify fields.
test pending_datum_fields() {
  let datum =
    EscrowDatum {
      buyer: #"aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
      merchant: #"11223344112233441122334411223344112233441122334411223344",
      order_id: #"deadbeefdeadbeefdeadbeefdeadbeef",
      paid_at: 1_700_000_000_000,
      ship_deadline: 1_700_604_800_000,
      grace_period_end: None,
    }
  datum.paid_at == 1_700_000_000_000 && datum.grace_period_end == None && datum.order_id == #"deadbeefdeadbeefdeadbeefdeadbeef" && datum.ship_deadline == 1_700_604_800_000
}

/// Construct a Shipped datum (grace_period_end = Some(t)) and verify fields.
test shipped_datum_fields() {
  let t = 1_700_086_400_000
  let datum =
    EscrowDatum {
      buyer: #"aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
      merchant: #"11223344112233441122334411223344112233441122334411223344",
      order_id: #"deadbeefdeadbeefdeadbeefdeadbeef",
      paid_at: 1_700_000_000_000,
      ship_deadline: 1_700_604_800_000,
      grace_period_end: Some(t),
    }
  datum.grace_period_end == Some(t)
}

/// Redeemer constructors round-trip correctly.
test redeemer_variants() {
  let mark_shipped = MarkShipped { shipped_at: 1_700_050_000_000 }
  let release = Release
  let refund = Refund

  when mark_shipped is {
    MarkShipped { shipped_at } -> {
      let variants_differ = Release != Refund
      let release_not_mark_shipped =
        release != MarkShipped { shipped_at: 0 }
      shipped_at == 1_700_050_000_000 && variants_differ && release_not_mark_shipped
    }
    _ -> False
  }
}
