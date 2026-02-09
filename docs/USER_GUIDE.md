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
- `VITE_MERCHANT_ADDRESS`: Cardano merchant address.

Server-side variables (do not expose):

- `SUPABASE_SECRET_KEY`: Supabase service role key.
- `CARDANO_MERCHANT_SKEY`: Cardano signing key for server-side operations (used to sign the buy order transactions)

Supabase clients read these values from [src/lib/supabase.ts](src/lib/supabase.ts) and server functions (orders) use the secret key via [src/server-fns/orders.ts](src/server-fns/orders.ts).

## Supabase setup

1. Create a Supabase project.
2. Apply database migrations from [supabase/migrations](supabase/migrations).
3. Optionally load seed data from [supabase/seed](supabase/seed).
4. Set the environment variables above locally and in your hosting provider.

## Vercel deployment

This project is ready for Vercel.

1. Import the repository in Vercel.
2. Set the environment variables listed above in the Vercel project settings.
3. Use `pnpm install` as the install command and `pnpm build` as the build command.
4. The default Vite output directory is `dist` (Vercel detects it automatically).

## Where to customize behavior

- UI components: [src/components](src/components).
- Routes and pages: [src/routes](src/routes).
- Product and order logic: [src/lib](src/lib) and [src/server-fns](src/server-fns).
- Cart behavior and storage: [src/lib/cart-storage.ts](src/lib/cart-storage.ts) and [src/lib/cart-calculations.ts](src/lib/cart-calculations.ts).
