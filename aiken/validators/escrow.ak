use aiken/collection/list
use aiken/interval
use cardano/address.{Address, Script}
use cardano/assets.{from_lovelace}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction, placeholder,
}
use escrow_types.{EscrowDatum, EscrowRedeemer, MarkShipped, PosixTime, Refund, Release}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Grace period added to shipped_at to compute the earliest release timestamp.
/// 14 days expressed in milliseconds.
pub const grace_period_constant: PosixTime = 1_209_600_000

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

validator escrow {
  spend(
    datum: Option<Data>,
    redeemer: Data,
    own_ref: OutputReference,
    ctx: Transaction,
  ) {
    expect Some(raw_datum) = datum
    expect escrow_datum: EscrowDatum = raw_datum
    expect escrow_redeemer: EscrowRedeemer = redeemer
    when escrow_redeemer is {
      MarkShipped { shipped_at } ->
        check_mark_shipped(escrow_datum, shipped_at, own_ref, ctx)
      Release -> False
      Refund -> False
    }
  }

  else(_) {
    fail
  }
}

// ---------------------------------------------------------------------------
// MarkShipped logic
// ---------------------------------------------------------------------------

fn check_mark_shipped(
  datum: EscrowDatum,
  shipped_at: PosixTime,
  own_ref: OutputReference,
  ctx: Transaction,
) -> Bool {
  // 1. Must be in Pending state (grace_period_end == None)
  let is_pending =
    when datum.grace_period_end is {
      None -> True
      Some(_) -> False
    }

  // 2. Merchant must have signed
  let merchant_signed =
    list.has(ctx.extra_signatories, datum.merchant)

  // 3. shipped_at must be within the transaction validity range
  let time_valid = interval.contains(ctx.validity_range, shipped_at)

  // 4. Find the script input being spent to get its address and value
  expect Some(own_input) =
    ctx.inputs
      |> list.find(fn(input) { input.output_reference == own_ref })

  let script_address = own_input.output.address
  let locked_value = own_input.output.value

  // 5. Expected output datum (only grace_period_end changes)
  let expected_datum =
    EscrowDatum {
      buyer: datum.buyer,
      merchant: datum.merchant,
      order_id: datum.order_id,
      paid_at: datum.paid_at,
      ship_deadline: datum.ship_deadline,
      grace_period_end: Some(shipped_at + grace_period_constant),
    }

  // 6. shipped_at must be before the ship_deadline
  let before_deadline = shipped_at < datum.ship_deadline

  // 7. Exactly one output re-locks at the same address with the same value and the correct datum
  let script_outputs =
    list.filter(ctx.outputs, fn(o) { o.address == script_address })

  let valid_output =
    when script_outputs is {
      [o] ->
        o.value == locked_value && o.datum == InlineDatum(expected_datum)
      _ -> False
    }

  is_pending && merchant_signed && time_valid && before_deadline && valid_output
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Shared test fixtures
const buyer_vkh: ByteArray =
  #"aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd"

const merchant_vkh: ByteArray =
  #"11223344112233441122334411223344112233441122334411223344"

const order_id: ByteArray =
  #"deadbeefdeadbeefdeadbeefdeadbeef"

const script_hash: ByteArray =
  #"cafecafecafecafecafecafecafecafecafecafecafecafecafecafe"

const paid_at_ms: Int = 1_700_000_000_000

const ship_deadline_ms: Int = 1_700_604_800_000

const shipped_at_ms: Int = 1_700_100_000_000

const valid_from_ms: Int = 1_700_099_000_000

const valid_to_ms: Int = 1_700_101_000_000

fn pending_datum() -> EscrowDatum {
  EscrowDatum {
    buyer: buyer_vkh,
    merchant: merchant_vkh,
    order_id,
    paid_at: paid_at_ms,
    ship_deadline: ship_deadline_ms,
    grace_period_end: None,
  }
}

fn shipped_datum() -> EscrowDatum {
  EscrowDatum {
    buyer: buyer_vkh,
    merchant: merchant_vkh,
    order_id,
    paid_at: paid_at_ms,
    ship_deadline: ship_deadline_ms,
    grace_period_end: Some(shipped_at_ms + grace_period_constant),
  }
}

fn script_address() -> Address {
  Address {
    payment_credential: Script(script_hash),
    stake_credential: None,
  }
}

fn locked_value() {
  from_lovelace(5_000_000)
}

fn own_output_ref() -> OutputReference {
  OutputReference { transaction_id: #"abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234", output_index: 0 }
}

fn make_script_input(datum_val: EscrowDatum) -> Input {
  Input {
    output_reference: own_output_ref(),
    output: Output {
      address: script_address(),
      value: locked_value(),
      datum: InlineDatum(datum_val),
      reference_script: None,
    },
  }
}

fn make_expected_output(datum_val: EscrowDatum) -> Output {
  Output {
    address: script_address(),
    value: locked_value(),
    datum: InlineDatum(datum_val),
    reference_script: None,
  }
}

fn make_validity_range(from: Int, to: Int) {
  interval.between(from, to)
}

/// mark_shipped_success: Pending UTxO + MarkShipped{t} + merchant sig + re-locked output → valid.
test mark_shipped_success() {
  let input = make_script_input(pending_datum())
  let output = make_expected_output(shipped_datum())
  let tx =
    Transaction {
      ..placeholder,
      inputs: [input],
      outputs: [output],
      extra_signatories: [merchant_vkh],
      validity_range: make_validity_range(valid_from_ms, valid_to_ms),
    }

  check_mark_shipped(pending_datum(), shipped_at_ms, own_output_ref(), tx)
}

/// mark_shipped_wrong_signer: Buyer signs MarkShipped → invalid.
test mark_shipped_wrong_signer() {
  let input = make_script_input(pending_datum())
  let output = make_expected_output(shipped_datum())
  let tx =
    Transaction {
      ..placeholder,
      inputs: [input],
      outputs: [output],
      // buyer signs, NOT merchant
      extra_signatories: [buyer_vkh],
      validity_range: make_validity_range(valid_from_ms, valid_to_ms),
    }

  !check_mark_shipped(pending_datum(), shipped_at_ms, own_output_ref(), tx)
}

/// mark_shipped_shipped_at_outside_range: shipped_at outside [valid_from, valid_to] → invalid.
test mark_shipped_shipped_at_outside_range() {
  let input = make_script_input(pending_datum())
  // shipped_at is well outside the validity range
  let outside_shipped_at = valid_to_ms + 100_000
  let out_datum =
    EscrowDatum {
      ..pending_datum(),
      grace_period_end: Some(outside_shipped_at + grace_period_constant),
    }
  let output = make_expected_output(out_datum)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [input],
      outputs: [output],
      extra_signatories: [merchant_vkh],
      validity_range: make_validity_range(valid_from_ms, valid_to_ms),
    }

  !check_mark_shipped(pending_datum(), outside_shipped_at, own_output_ref(), tx)
}

/// mark_shipped_datum_mutated: Any datum field other than grace_period_end differs → invalid.
test mark_shipped_datum_mutated() {
  let input = make_script_input(pending_datum())
  // Output datum has buyer field changed — should be rejected
  let mutated_datum =
    EscrowDatum {
      buyer: merchant_vkh,
      // swapped!
      merchant: merchant_vkh,
      order_id,
      paid_at: paid_at_ms,
      ship_deadline: ship_deadline_ms,
      grace_period_end: Some(shipped_at_ms + grace_period_constant),
    }
  let output = make_expected_output(mutated_datum)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [input],
      outputs: [output],
      extra_signatories: [merchant_vkh],
      validity_range: make_validity_range(valid_from_ms, valid_to_ms),
    }

  !check_mark_shipped(pending_datum(), shipped_at_ms, own_output_ref(), tx)
}

/// mark_shipped_already_shipped: Input already in Shipped state → invalid.
test mark_shipped_already_shipped() {
  // Input datum is already Shipped (grace_period_end = Some)
  let already_shipped = shipped_datum()
  let input = make_script_input(already_shipped)
  // Even if the output looks correct, the input state check should fail
  let output = make_expected_output(already_shipped)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [input],
      outputs: [output],
      extra_signatories: [merchant_vkh],
      validity_range: make_validity_range(valid_from_ms, valid_to_ms),
    }

  !check_mark_shipped(already_shipped, shipped_at_ms, own_output_ref(), tx)
}

/// mark_shipped_after_deadline: shipped_at >= ship_deadline → invalid.
test mark_shipped_after_deadline() {
  // shipped_at equals ship_deadline — merchant can no longer mark shipped
  let late_shipped_at = ship_deadline_ms
  let late_validity_from = ship_deadline_ms - 1_000_000
  let late_validity_to = ship_deadline_ms + 1_000_000
  let late_out_datum =
    EscrowDatum {
      ..pending_datum(),
      grace_period_end: Some(late_shipped_at + grace_period_constant),
    }
  let input = make_script_input(pending_datum())
  let output = make_expected_output(late_out_datum)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [input],
      outputs: [output],
      extra_signatories: [merchant_vkh],
      validity_range: make_validity_range(late_validity_from, late_validity_to),
    }

  !check_mark_shipped(pending_datum(), late_shipped_at, own_output_ref(), tx)
}
