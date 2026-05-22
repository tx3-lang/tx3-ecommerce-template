-- Migration: Add escrows table for on-chain escrow state tracking

CREATE TABLE escrows (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID        NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  script_address       TEXT        NOT NULL,
  utxo_tx_hash         TEXT        NOT NULL,
  utxo_output_index    INTEGER     NOT NULL,
  status               TEXT        NOT NULL CHECK (status IN ('pending','shipped','released','refunded')),
  buyer_pkh            TEXT        NOT NULL,
  merchant_pkh         TEXT        NOT NULL,
  paid_at              TIMESTAMPTZ NOT NULL,
  ship_deadline        TIMESTAMPTZ NOT NULL,
  grace_period_end     TIMESTAMPTZ NULL,
  datum_cbor           TEXT        NOT NULL,
  shipped_tx_hash      TEXT        NULL,
  release_tx_hash      TEXT        NULL,
  refund_tx_hash       TEXT        NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX escrows_status_idx       ON escrows (status);
CREATE INDEX escrows_ship_deadline_idx ON escrows (ship_deadline) WHERE status = 'pending';

-- updated_at trigger (same pattern as shipping_info)
CREATE TRIGGER update_escrows_updated_at
  BEFORE UPDATE ON escrows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE escrows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own escrows" ON escrows FOR SELECT
USING (
  order_id IN (
    SELECT id FROM orders
    WHERE wallet_address = current_setting('app.current_wallet', true)
  )
);

-- Grant SELECT to client roles; service role already has full access.
GRANT SELECT ON escrows TO anon, authenticated;
