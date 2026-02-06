-- Migration: Move supported_tokens table to separate migration file
-- This migration was separated from multi_currency_products for better organization

-- Step 1: Create supported_tokens table for token metadata
-- This table stores decimal specifications and display information for tokens
-- If display_name is NULL, the system will use the hex-decoded token name

CREATE TABLE supported_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  display_name TEXT,  -- Optional display name, NULL will use hex-decoded name
  decimals INTEGER NOT NULL DEFAULT 0 CHECK (decimals >= 0 AND decimals <= 15),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(policy_id, asset_name)
);

-- Add comments for documentation
COMMENT ON TABLE supported_tokens IS 'Stores metadata for supported tokens including decimal places and display names';
COMMENT ON COLUMN supported_tokens.policy_id IS 'Cardano policy ID (56-character hex string)';
COMMENT ON COLUMN supported_tokens.asset_name IS 'Token asset name in hex format';
COMMENT ON COLUMN supported_tokens.display_name IS 'Optional human-readable name. NULL uses hex-decoded asset_name';
COMMENT ON COLUMN supported_tokens.decimals IS 'Number of decimal places for this token (0-15)';

-- Performance indexes
CREATE INDEX idx_supported_tokens_lookup ON supported_tokens(policy_id, asset_name) WHERE is_active = true;
CREATE INDEX idx_supported_tokens_active ON supported_tokens(is_active);

-- Add updated_at trigger
CREATE TRIGGER update_supported_tokens_updated_at 
    BEFORE UPDATE ON supported_tokens 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();