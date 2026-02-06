-- Migration: Normalize token references in orders and order_items to use token_id
-- This migration updates orders and order_items to use foreign keys instead of redundant policy_id/asset_name fields

-- Step 1: Add token_id foreign key to orders table (nullable)
-- NULL indicates ADA payments, non-NULL indicates token payments
ALTER TABLE orders 
ADD COLUMN token_id UUID REFERENCES supported_tokens(id) ON DELETE SET NULL;

-- Step 2: Add token_id foreign key to order_items table (nullable)
ALTER TABLE order_items 
ADD COLUMN token_id UUID REFERENCES supported_tokens(id) ON DELETE SET NULL;

-- Step 3: Migrate existing token data to use token_id
-- Update orders with existing token references
UPDATE orders o
SET token_id = st.id
FROM supported_tokens st
WHERE o.policy_id = st.policy_id 
  AND o.asset_name = st.asset_name
  AND o.policy_id IS NOT NULL 
  AND o.asset_name IS NOT NULL;

-- Update order_items with existing token references
UPDATE order_items oi
SET token_id = st.id
FROM supported_tokens st
WHERE oi.policy_id = st.policy_id 
  AND oi.asset_name = st.asset_name
  AND oi.policy_id IS NOT NULL 
  AND oi.asset_name IS NOT NULL;

-- Step 4: Add constraints to ensure token_id consistency
ALTER TABLE orders 
ADD CONSTRAINT check_orders_token_id_consistency 
CHECK (
  (token_id IS NULL) OR 
  (token_id IS NOT NULL)
);

ALTER TABLE order_items 
ADD CONSTRAINT check_order_items_token_id_consistency 
CHECK (
  (token_id IS NULL) OR 
  (token_id IS NOT NULL)
);

-- Step 5: Update comments to document the new token_id structure
COMMENT ON COLUMN orders.token_id IS 'Foreign key to supported_tokens. NULL for ADA payments, non-NULL for token payments';
COMMENT ON COLUMN order_items.token_id IS 'Foreign key to supported_tokens. NULL for ADA payments, non-NULL for token payments';

-- Step 6: Add new performance indexes for token_id queries
CREATE INDEX idx_orders_token_id ON orders(token_id) WHERE token_id IS NOT NULL;
CREATE INDEX idx_orders_ada_token_id ON orders(created_at) WHERE token_id IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_order_items_token_id ON order_items(token_id) WHERE token_id IS NOT NULL;

-- Step 7: Drop old redundant indexes (will be replaced with token_id indexes)
DROP INDEX IF EXISTS idx_orders_token;
DROP INDEX IF EXISTS idx_order_items_token;