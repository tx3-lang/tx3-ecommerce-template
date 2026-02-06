-- Seed data for products table
-- Updated to use token_id instead of policy_id/asset_name
-- Prices are in the smallest unit of the currency (lovelace for ADA, token units for tokens)
-- ADA products have NULL token_id
-- Token products have non-NULL token_id (foreign key to supported_tokens)

-- Insert token metadata first (required for foreign key constraints)
INSERT INTO supported_tokens (
  policy_id,
  asset_name,
  display_name,
  decimals,
  is_active
) VALUES
  ('0030630e5173e8be7f0a004cda6f6958f19f88a5179cfe6af87efdf7', '425549444c45525f524557415244', null, 0, true); -- REAL PREVIEW TOKEN for testing

-- Insert ADA products (token_id = NULL)
INSERT INTO products (name, description, price, stock, is_active, is_featured, token_id) VALUES
(
  'Premium Wireless Headphones',
  'Experience crystal-clear audio with active noise cancellation and 30-hour battery life.',
  85500000, -- 85.5 ADA
  15,
  true,
  true,
  NULL
),
(
  'Smart Fitness Watch',
  'Track your health and fitness goals with this advanced smartwatch featuring heart rate monitoring.',
  120000000, -- 120 ADA
  25,
  true,
  false,
  NULL
),
(
  'Organic Coffee Beans',
  'Premium organic coffee beans sourced from sustainable farms. Rich, aromatic flavor profile.',
  45750000, -- 45.75 ADA
  25,
  true,
  true,
  NULL
),
(
  'Ergonomic Office Chair',
  'Comfortable ergonomic office chair with lumbar support and adjustable height for all-day comfort.',
  250000000, -- 250 ADA
  12,
  true,
  false,
  NULL
),
(
  'Yoga Mat Premium',
  'Non-slip premium yoga mat with extra cushioning. Perfect for all yoga and exercise routines.',
  35000000, -- 35 ADA
  30,
  true,
  false,
  NULL
),
(
  'Wireless Charging Pad',
  'Fast wireless charging pad compatible with all Qi-enabled devices. Sleek and minimalist design.',
  28500000, -- 28.5 ADA
  18,
  true,
  true,
  NULL
);

-- Insert products priced in tokens
INSERT INTO products (
  name,
  description,
  price,
  stock,
  is_active,
  is_featured,
  token_id
) VALUES 
  ('Digital Art NFT', 'Unique digital artwork from Space collection. One-of-a-kind piece.', 1, 1, true, true, (SELECT id FROM supported_tokens WHERE asset_name = '425549444c45525f524557415244' LIMIT 1));


-- Insert reliable placeholder images with consistent service
-- Using unsplash which is designed specifically for placeholder images and is highly reliable
INSERT INTO product_images (product_id, image_url, alt_text, display_order) 
SELECT 
  id,
  CASE name
    WHEN 'Premium Wireless Headphones' THEN 'https://images.unsplash.com/photo-1765279339828-bb765f3631c8?w=800&h=800&fit=crop&crop=entropy'
    WHEN 'Smart Fitness Watch' THEN 'https://images.unsplash.com/photo-1629339837617-7069ce9e7f6b?w=800&h=800&fit=crop&crop=entropy'
    WHEN 'Organic Coffee Beans' THEN 'https://images.unsplash.com/photo-1574081106041-f16966db53d6?w=800&h=800&fit=crop&crop=entropy'
    WHEN 'Ergonomic Office Chair' THEN 'https://images.unsplash.com/photo-1688578735352-9a6f2ac3b70a?w=800&h=800&fit=crop&crop=entropy'
    WHEN 'Yoga Mat Premium' THEN 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=800&h=800&fit=crop&crop=entropy'
    WHEN 'Wireless Charging Pad' THEN 'https://images.unsplash.com/photo-1617975316514-69cd7e16c2a4?w=800&h=800&fit=crop&crop=entropy'
    WHEN 'Digital Art NFT' THEN 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&h=800&fit=crop&crop=entropy'
  END,
  CASE name
    WHEN 'Premium Wireless Headphones' THEN 'Premium wireless headphones with active noise cancellation and premium comfort for professional audio experience'
    WHEN 'Smart Fitness Watch' THEN 'Advanced fitness watch with heart rate monitoring, activity tracking, and health metrics display'
    WHEN 'Organic Coffee Beans' THEN 'Premium organic coffee beans sourced from sustainable farms with rich aromatic flavor profile'
    WHEN 'Ergonomic Office Chair' THEN 'Comfortable ergonomic office chair with adjustable lumbar support, armrests, and breathable mesh back'
    WHEN 'Yoga Mat Premium' THEN 'Non-slip premium yoga mat with extra cushioning, alignment guides, and carrying strap for portability'
    WHEN 'Wireless Charging Pad' THEN 'Fast wireless charging pad compatible with all Qi-enabled devices featuring LED indicator and sleek minimalist design'
    WHEN 'Digital Art NFT' THEN 'Unique digital artwork from space collection with vibrant cosmic colors and abstract patterns'
  END,
  0
FROM products
ORDER BY created_at;