-- Products table with pricing in lovelace (1 ADA = 1,000,000 lovelace)
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_lovelace bigint NOT NULL,
  stock integer DEFAULT 0,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Product images (multiple images per product)
CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Order status enum for type safety
CREATE TYPE order_status AS ENUM (
  'pending',
  'payment_failed', 
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled'
);

-- Orders table with wallet address and payment tracking
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  total_lovelace bigint NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  cardano_tx_hash text,
  payment_error text,
  is_timeout boolean DEFAULT false,
  retry_count integer DEFAULT 0,
  can_cancel boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Order items with price snapshot
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  price_lovelace bigint NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_products_active ON products(created_at) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_products_featured ON products(created_at) WHERE is_featured = true AND is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_orders_wallet ON orders(wallet_address);
CREATE INDEX idx_orders_status ON orders(status);

-- Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Public access for products
CREATE POLICY "Products are viewable by everyone" ON products FOR SELECT 
USING (is_active = true AND deleted_at IS NULL);

-- Wallet-based access for orders
CREATE POLICY "Users can manage own orders" ON orders FOR ALL 
USING (wallet_address = current_setting('app.current_wallet', true));

-- Updated timestamp triggers for automatic timestamp management
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Set the updated_at column to current timestamp
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to products table for automatic updated_at management
CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON products 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to orders table for automatic updated_at management
CREATE TRIGGER update_orders_updated_at 
    BEFORE UPDATE ON orders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
