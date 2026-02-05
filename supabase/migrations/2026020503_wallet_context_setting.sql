-- Migration: Provide a helper to set app.current_wallet for RLS

CREATE OR REPLACE FUNCTION public.set_current_wallet(wallet_address text)
RETURNS void
LANGUAGE sql
AS $$
	SELECT set_config('app.current_wallet', wallet_address, false);
$$;

GRANT EXECUTE ON FUNCTION public.set_current_wallet(text) TO anon, authenticated;
