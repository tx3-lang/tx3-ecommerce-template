-- Seed data for products table
-- Converting mock products to database records
-- Prices are in lovelace (1 ADA = 1,000,000 lovelace)

INSERT INTO products (name, description, price_lovelace, stock, is_active, is_featured) VALUES
(
  'Premium Wireless Headphones',
  'Experience crystal-clear audio with active noise cancellation and 30-hour battery life.',
  85500000,
  15,
  true,
  true
),
(
  'Smart Fitness Watch',
  'Track your health and fitness goals with this advanced smartwatch featuring heart rate monitoring.',
  120000000,
  25,
  true,
  false
),
(
  'Organic Coffee Beans',
  'Premium organic coffee beans sourced from sustainable farms. Rich, aromatic flavor profile.',
  45750000,
  25,
  true,
  true
),
(
  'Ergonomic Office Chair',
  'Comfortable ergonomic office chair with lumbar support and adjustable height for all-day comfort.',
  250000000,
  12,
  true,
  false
),
(
  'Yoga Mat Premium',
  'Non-slip premium yoga mat with extra cushioning. Perfect for all yoga and exercise routines.',
  35000000,
  30,
  true,
  false
),
(
  'Wireless Charging Pad',
  'Fast wireless charging pad compatible with all Qi-enabled devices. Sleek and minimalist design.',
  28500000,
  18,
  true,
  true
);

-- Insert reliable placeholder images with consistent service
-- Using picsum.photos which is designed specifically for placeholder images and is highly reliable
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
  END,
  CASE name
    WHEN 'Premium Wireless Headphones' THEN 'Premium wireless headphones with active noise cancellation and premium comfort for professional audio experience'
    WHEN 'Smart Fitness Watch' THEN 'Advanced fitness watch with heart rate monitoring, activity tracking, and health metrics display'
    WHEN 'Organic Coffee Beans' THEN 'Premium organic coffee beans sourced from sustainable farms with rich aromatic flavor profile'
    WHEN 'Ergonomic Office Chair' THEN 'Comfortable ergonomic office chair with adjustable lumbar support, armrests, and breathable mesh back'
    WHEN 'Yoga Mat Premium' THEN 'Non-slip premium yoga mat with extra cushioning, alignment guides, and carrying strap for portability'
    WHEN 'Wireless Charging Pad' THEN 'Fast wireless charging pad compatible with all Qi-enabled devices featuring LED indicator and sleek minimalist design'
  END,
  0
FROM products
ORDER BY created_at;