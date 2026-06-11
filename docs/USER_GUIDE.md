# User Guide

## Quick start

1. Install dependencies: `pnpm install`.
2. Start the dev server: `pnpm dev`.
3. Build for production: `pnpm build`.

## Branding and white-label setup

Update the brand metadata and feature flags in [src/config/brand.ts](src/config/brand.ts).

- `seo`: Title, description, Open Graph, and Twitter card values.
- `contact`: Email, phone, WhatsApp, and social links.
- `business`: Legal name, tax ID, and address.
- `features`: Enable or disable major flows.
  - `enableShipping`: Toggle shipping info in checkout.
  - `disableProductsPage`: Hide the product listing page.
  - `disableProductDetailPage`: Hide product detail pages.
  - `disableCartFlow`: Disable the cart (go direct to checkout after selection).

Adjust brand styling and identity variables in [src/styles/brand.css](src/styles/brand.css).

- `--color-brand-primary`, `--color-brand-secondary`, `--color-brand-accent`: Core palette.
- `--font-brand`: Brand font.
- `--brand-logo-url` and `--brand-name`: Logo and site name.

## Environment variables

Copy [./.env.example](.env.example) to `.env` and fill in values.

Client-side variables (exposed to the browser):

- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Supabase public anon key.
- `VITE_API_URL`: Optional base URL for external APIs.

Server-side variables (do not expose):

- `SUPABASE_SECRET_KEY`: Supabase service role key.
- `CARDANO_MERCHANT_SKEY`: Cardano signing key for server-side operations (used to sign the buy order transactions).
- `MERCHANT_ADDRESS`: Bech32 address of the merchant's backend signer wallet.

For the full list of variables used by the advanced on-chain features (escrow, badges,
oracle keeper), see [docs/advanced-onchain.md](advanced-onchain.md#required-environment)
and [docs/integration-escrow.md](integration-escrow.md#required-environment-variables).
The committed [.env.example](../.env.example) is the source of truth for variable names.

Supabase clients read these values from [src/lib/supabase.ts](src/lib/supabase.ts) and server functions (orders) use the secret key via [src/server-fns/orders.ts](src/server-fns/orders.ts).

## Advanced on-chain features

For on-chain advanced features (traceability, escrow, reputation), see [docs/advanced-onchain.md](advanced-onchain.md).

## Supabase setup

1. Create a Supabase project.
2. Apply database migrations from [supabase/migrations](supabase/migrations).
3. Optionally load seed data from [supabase/seed](supabase/seed).
4. Set the environment variables above locally and in your hosting provider.

## Vercel deployment

This project is ready for Vercel — no `vercel.json` is required. It is an SSR app built on
Nitro, which detects the Vercel environment and emits the correct server output automatically,
so Vercel deploys it zero-config once the environment variables are set.

1. Set up Supabase first (create the project and apply the migrations) — Vercel cannot
   provision your database. See [Supabase setup](#supabase-setup) above.
2. Import the repository in Vercel. It auto-detects TanStack Start.
3. Keep the defaults: install command `pnpm install`, build command `pnpm build`, and
   **leave the output directory on its default**. Do NOT set it to `dist` — this is an SSR
   build (Nitro writes the Vercel output), not a static site.
4. Set the environment variables listed above in the Vercel project settings.

The README has a one-click [Deploy to Vercel](../README.md#deploy-to-vercel) button that
pre-fills the required variables (Supabase must still be set up first).

## Where to customize behavior

- UI components: [src/components](src/components).
- Routes and pages: [src/routes](src/routes).
- Product and order logic: [src/lib](src/lib) and [src/server-fns](src/server-fns).
- Cart behavior and storage: [src/lib/cart-storage.ts](src/lib/cart-storage.ts) and [src/lib/cart-calculations.ts](src/lib/cart-calculations.ts).
