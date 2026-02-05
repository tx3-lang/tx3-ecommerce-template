-- Migration: Add shipping_info table and link orders to shipping details

CREATE TABLE shipping_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  address text NOT NULL,
  city text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE shipping_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own shipping info" ON shipping_info FOR ALL
USING (wallet_address = current_setting('app.current_wallet', true));

CREATE INDEX idx_shipping_info_wallet ON shipping_info(wallet_address);

CREATE TRIGGER update_shipping_info_updated_at
  BEFORE UPDATE ON shipping_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE orders
  ADD COLUMN shipping_id uuid REFERENCES shipping_info(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_shipping_id ON orders(shipping_id) WHERE shipping_id IS NOT NULL;

COMMENT ON TABLE shipping_info IS 'Shipping details tied to a wallet address for reuse across orders';
COMMENT ON COLUMN shipping_info.wallet_address IS 'Wallet address that owns the shipping info';
COMMENT ON COLUMN orders.shipping_id IS 'Reference to shipping_info for this order';
