-- Migration: Add issued_badges table for reputation badges

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

-- Indexes
CREATE INDEX issued_badges_recipient_idx ON issued_badges(recipient_pkh);
CREATE INDEX issued_badges_order_idx ON issued_badges(triggering_order_id);

-- Row Level Security
-- Badges are immutable append-only rows; no updated_at trigger is needed.
-- INSERT is performed exclusively via the service role (bypasses RLS by default).
ALTER TABLE issued_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view issued badges" ON issued_badges FOR SELECT
USING (true);

-- Grant SELECT to client roles; service role already has full access.
GRANT SELECT ON issued_badges TO anon, authenticated;