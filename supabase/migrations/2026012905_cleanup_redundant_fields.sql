-- Migration: Remove redundant policy_id and asset_name fields from orders and order_items
-- This migration cleans up redundant fields after token_id normalization

-- Step 1: Remove old constraints that used policy_id and asset_name
ALTER TABLE orders DROP CONSTRAINT IF EXISTS check_orders_token_fields_consistency;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS check_order_items_token_fields_consistency;

-- Step 2: Remove redundant fields from orders table
ALTER TABLE orders 
DROP COLUMN IF EXISTS policy_id,
DROP COLUMN IF EXISTS asset_name;

-- Step 3: Remove redundant fields from order_items table  
ALTER TABLE order_items 
DROP COLUMN IF EXISTS policy_id,
DROP COLUMN IF EXISTS asset_name;

-- Step 4: Update comments to reflect simplified structure
COMMENT ON COLUMN orders.total_amount IS 'Total amount in the smallest unit of the currency (lovelace for ADA, token units for tokens)';
COMMENT ON COLUMN order_items.price IS 'Price per unit in the smallest unit of the currency (lovelace for ADA, token units for tokens)';

-- Step 5: Add final verification comment
COMMENT ON TABLE orders IS 'Orders table with normalized token references via token_id foreign key';
COMMENT ON TABLE order_items IS 'Order items table with normalized token references via token_id foreign key';