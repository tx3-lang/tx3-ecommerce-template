-- Migration: Add carrier and tracking_number columns to orders table for oracle settlement
-- These fields are read by the keeper (Task 5) via: escrows JOIN orders ON escrows.order_id = orders.id

ALTER TABLE orders ADD COLUMN carrier text;
ALTER TABLE orders ADD COLUMN tracking_number text;

COMMENT ON COLUMN orders.carrier IS 'Shipping carrier name (e.g. "fedex", "ups"). NULL means no oracle tracking — keeper skips and falls back to manual flow.';
COMMENT ON COLUMN orders.tracking_number IS 'Carrier-assigned tracking number for oracle settlement lookup. NULL means no oracle tracking — keeper skips and falls back to manual flow.';
