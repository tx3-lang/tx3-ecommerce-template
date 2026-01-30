-- Add example token products for testing
-- These products use different token configurations to test decimal precision

-- Product priced in DogeCoin (2 decimal places)
INSERT INTO products (
  name, 
  description, 
  price, 
  policy_id, 
  asset_name, 
  stock, 
  is_active, 
  is_featured
) VALUES (
  'Crypto Trading Bot License',
  'Advanced automated trading bot with AI-powered strategies for cryptocurrency markets.',
  250, -- 2.50 DogeCoin (stored as 250 smallest units since it has 2 decimals)
  '1a2b3c4d5e6f7890123456789012345678901234567890123456789012345678',
  '446f6765436f696e', -- DogeCoin in hex
  5,
  true,
  true
);

-- Product priced in NFTfromSpace (0 decimal places)
INSERT INTO products (
  name, 
  description, 
  price, 
  policy_id, 
  asset_name, 
  stock, 
  is_active, 
  is_featured
) VALUES (
  'Digital Art NFT',
  'Unique digital artwork from the Space collection. One-of-a-kind piece.',
  1, -- 1 NFTfromSpace (stored as 1 since it has 0 decimals)
  '9f8e7d6c5b4a3210fedcba9876543210fedcba9876543210fedcba9876543210',
  '4e465466726f6d5370616365', -- NFTfromSpace in hex
  1,
  true,
  true
);

-- Product priced in UtilityToken (6 decimal places)
INSERT INTO products (
  name, 
  description, 
  price, 
  policy_id, 
  asset_name, 
  stock, 
  is_active, 
  is_featured
) VALUES (
  'Premium Subscription',
  'Monthly premium subscription with access to all features and priority support.',
  5000000, -- 5.000000 UtilityToken (stored as 5,000,000 smallest units since it has 6 decimals)
  'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  '5574696c697479546f6b656e', -- UtilityToken in hex
  100,
  true,
  false
);

-- Add images for the new token products
INSERT INTO product_images (product_id, image_url, alt_text, display_order) 
SELECT 
  id,
  CASE name
    WHEN 'Crypto Trading Bot License' THEN 'https://images.unsplash.com/photo-1622630998477-20aa696ecb05?w=800&h=800&fit=crop&crop=entropy'
    WHEN 'Digital Art NFT' THEN 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&h=800&fit=crop&crop=entropy'
    WHEN 'Premium Subscription' THEN 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=800&h=800&fit=crop&crop=entropy'
  END,
  CASE name
    WHEN 'Crypto Trading Bot License' THEN 'Advanced cryptocurrency trading bot interface with AI-powered algorithms and real-time market analysis charts'
    WHEN 'Digital Art NFT' THEN 'Unique digital artwork from space collection with vibrant cosmic colors and abstract patterns'
    WHEN 'Premium Subscription' THEN 'Premium subscription service interface with enhanced features and priority customer support options'
  END,
  0
FROM products
WHERE policy_id IS NOT NULL
ORDER BY created_at;