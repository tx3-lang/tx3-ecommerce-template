-- Migration: Add order_events table for on-chain traceability events

CREATE TABLE order_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL CHECK (event_type IN ('paid', 'shipped', 'completed', 'cancelled')),
  tx_hash       TEXT        NOT NULL,
  payload       JSONB       NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ NULL,
  UNIQUE (order_id, event_type)
);

-- Indexes
CREATE INDEX order_events_order_id_idx      ON order_events (order_id);
CREATE INDEX order_events_unconfirmed_idx   ON order_events (confirmed_at) WHERE confirmed_at IS NULL;

-- Row Level Security
-- Events are immutable append-only rows; no updated_at trigger is needed.
-- INSERT / UPDATE are performed exclusively via the service role (bypasses RLS by default).
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own order events" ON order_events FOR SELECT
USING (
  order_id IN (
    SELECT id FROM orders
    WHERE wallet_address = current_setting('app.current_wallet', true)
  )
);

-- Grant SELECT to client roles; service role already has full access.
GRANT SELECT ON order_events TO anon, authenticated;
