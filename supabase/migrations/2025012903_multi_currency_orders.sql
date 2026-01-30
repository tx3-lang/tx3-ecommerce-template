-- Migration: Add multi-currency support to orders tables
-- Adds token support to orders and order_items, renames lovelace fields to generic amount fields

-- Step 1: Add token fields to orders table
ALTER TABLE orders 
ADD COLUMN policy_id text,
ADD COLUMN asset_name text;

-- Step 2: Rename total_lovelace to total_amount (more generic)
ALTER TABLE orders 
RENAME COLUMN total_lovelace TO total_amount;

-- Step 3: Add token fields to order_items table
ALTER TABLE order_items 
ADD COLUMN policy_id text,
ADD COLUMN asset_name text;

-- Step 4: Rename price_lovelace to price in order_items
ALTER TABLE order_items 
RENAME COLUMN price_lovelace TO price;

-- Step 5: Add comments to document the new currency structure
COMMENT ON COLUMN orders.total_amount IS 'Total amount in the smallest unit of the currency (lovelace for ADA, token units for tokens)';
COMMENT ON COLUMN orders.policy_id IS 'Token policy ID for the order. NULL for ADA payments';
COMMENT ON COLUMN orders.asset_name IS 'Token asset name for the order. NULL for ADA payments';
COMMENT ON COLUMN order_items.price IS 'Price per unit in the smallest unit of the currency (lovelace for ADA, token units for tokens)';
COMMENT ON COLUMN order_items.policy_id IS 'Token policy ID for this item. NULL for ADA payments';
COMMENT ON COLUMN order_items.asset_name IS 'Token asset name for this item. NULL for ADA payments';

-- Step 6: Add performance indexes for currency queries
CREATE INDEX idx_orders_token ON orders(policy_id, asset_name) WHERE policy_id IS NOT NULL;
CREATE INDEX idx_orders_ada ON orders(created_at) WHERE policy_id IS NULL AND asset_name IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_order_items_token ON order_items(policy_id, asset_name) WHERE policy_id IS NOT NULL;

-- Step 7: Add constraints to ensure currency fields consistency
ALTER TABLE orders 
ADD CONSTRAINT check_orders_token_fields_consistency 
CHECK (
  (policy_id IS NULL AND asset_name IS NULL) OR 
  (policy_id IS NOT NULL AND asset_name IS NOT NULL)
);

ALTER TABLE order_items 
ADD CONSTRAINT check_order_items_token_fields_consistency 
CHECK (
  (policy_id IS NULL AND asset_name IS NULL) OR 
  (policy_id IS NOT NULL AND asset_name IS NOT NULL)
);

-- Step 8: Migrate existing orders data (existing orders are ADA payments)
UPDATE orders 
SET policy_id = NULL, 
    asset_name = NULL 
WHERE policy_id IS NOT NULL OR asset_name IS NOT NULL;

UPDATE order_items 
SET policy_id = NULL, 
    asset_name = NULL 
WHERE policy_id IS NOT NULL OR asset_name IS NOT NULL;