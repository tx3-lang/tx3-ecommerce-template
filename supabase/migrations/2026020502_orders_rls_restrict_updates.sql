-- Migration: Restrict orders RLS to read-only for clients
-- Server-side service role bypasses RLS for inserts/updates

DROP POLICY IF EXISTS "Users can manage own orders" ON orders;

CREATE POLICY "Users can view own orders" ON orders FOR SELECT
USING (wallet_address = current_setting('app.current_wallet', true));
