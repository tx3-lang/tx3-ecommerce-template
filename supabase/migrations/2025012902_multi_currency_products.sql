-- Migration: Add multi-currency support to products table
-- This migration updates products to use FK relationship with supported_tokens

-- Step 1: Add token_id foreign key to products table (nullable)
-- NULL indicates ADA payments, non-NULL indicates token payments
ALTER TABLE products 
ADD COLUMN token_id UUID REFERENCES supported_tokens(id) ON DELETE SET NULL;

-- Step 2: Rename price_lovelace to price (more generic)
ALTER TABLE products 
RENAME COLUMN price_lovelace TO price;

-- Step 3: Add comments to document the new pricing structure
COMMENT ON COLUMN products.price IS 'Price in the smallest unit of the currency (lovelace for ADA, token units for tokens)';
COMMENT ON COLUMN products.token_id IS 'Foreign key to supported_tokens. NULL for ADA payments, non-NULL for token payments';

-- Step 4: Add performance indexes for token queries
CREATE INDEX idx_products_token ON products(token_id) WHERE token_id IS NOT NULL;
CREATE INDEX idx_products_ada ON products(created_at) WHERE token_id IS NULL AND is_active = true AND deleted_at IS NULL;