# E-commerce Cardano Platform - Design Document

## Overview

White-label e-commerce platform with Cardano blockchain payments (ADA and tokens). Built with TanStack Start, Supabase, and deployed on Vercel.

## Tech Stack

- **Framework**: TanStack Start + TypeScript
- **UI**: Tailwind CSS v4 + Shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Payments**: CIP-30 (Eternl, Lace wallets) - Native window.cardano implementation
- **Deployment**: Vercel
- **Styling**: CSS-first configuration with @theme directive

## Database Schema

### Supported Tokens
```sql
CREATE TABLE supported_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Products
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_lovelace BIGINT NOT NULL,
  stock INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Product Images
```sql
CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT,
  sort_order INTEGER DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Order Status Enum
```sql
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'refunded');
```

### Orders
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT,
  status order_status DEFAULT 'pending',
  total_lovelace BIGINT NOT NULL,
  wallet_address TEXT,
  transaction_hash TEXT,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Order Items
```sql
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price_lovelace BIGINT NOT NULL,
  token_policy_id TEXT,
  token_asset_name TEXT
);
```

## Soft Delete Strategy

All main tables include:
- `deleted_at TIMESTAMP NULL` for soft delete
- `created_at TIMESTAMP DEFAULT NOW()`
- `updated_at TIMESTAMP DEFAULT NOW()`

Automatic trigger for `updated_at`:
```sql
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## File Structure

```
project-root/
├── @types/               # Global type declarations (root level)
│   ├── index.d.ts        # Minimal reference file
│   ├── database.d.ts     # Database schema types
│   ├── cardano.d.ts      # Cardano/CIP-30 types
│   ├── brand.d.ts        # White-label configuration types
│   └── api.d.ts          # API response types
├── src/
│   ├── routes/                 # TanStack Start routes
│   │   ├── __root.tsx         # Root layout
│   │   ├── index.tsx          # Home page
│   │   ├── (shop)/            # Route group for shop
│   │   │   ├── products.tsx
│   │   │   ├── product.$tsx   # Dynamic route for product details
│   │   │   └── checkout.tsx
│   │   └── api/               # Server functions
│   │       ├── products.ts
│   │       └── orders.ts
│   ├── components/
│   │   ├── ui/               # Shadcn/ui components
│   │   ├── shop/
│   │   │   ├── ProductCard.tsx
│   │   │   ├── ProductList.tsx
│   │   │   └── CheckoutForm.tsx
│   │   ├── wallet/           # Cardano wallet integration
│   │   │   ├── WalletConnect.tsx
│   │   │   └── PaymentProcessor.tsx
│   │   └── brand/            # White-label components
│   │       └── BrandProvider.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── cardano.ts        # CIP-30 integration
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── use-wallet.ts
│   │   ├── use-products.ts
│   │   └── use-checkout.ts
│   ├── config/
│   │   └── brand.ts          # White-label configuration
│   ├── constants/            # Shared constants
│   │   └── index.ts
│   ├── validators/           # Input validation schemas
│   │   └── index.ts
│   └── styles/
│       └── brand.css         # CSS variables + @theme
├── tsconfig.json
├── package.json
└── README.md
```

## White-Label Configuration

### Brand Config (`src/config/brand.ts`)
```typescript
export const brandConfig = {
  seo: {
    title: "Mi E-commerce Cardano",
    description: "Compra productos con ADA y tokens de Cardano",
    ogImage: "/og-image.png",
    twitterHandle: "@miempresa",
    keywords: "e-commerce, cardano, ada, crypto, shopping"
  },
  contact: {
    email: "contacto@empresa.com",
    phone: "+54 9 11 1234-5678",
    whatsapp: "+5491112345678",
    social: {
      twitter: "https://twitter.com/miempresa",
      instagram: "https://instagram.com/miempresa",
      facebook: "https://facebook.com/miempresa"
    }
  },
  business: {
    name: "Mi Empresa",
    taxId: "CUIT XX-XXXXXXXX-X",
    address: "Av. Siempre Viva 1234, CABA, Argentina"
  },
  features: {
    enableGuestCheckout: true,
    enableUserRegistration: false,
    enableStockManagement: true,
    enableMultipleImages: true
  }
}
```

### CSS Configuration (`src/styles/brand.css`)
```css
@import "tailwindcss";

@theme {
  /* Custom brand colors */
  --color-brand-primary: #3b82f6;
  --color-brand-secondary: #1e40af;
  --color-brand-accent: #f59e0b;
  
  /* Custom fonts */
  --font-brand: "Inter", sans-serif;
}

/* Additional CSS variables for white-label */
:root {
  --brand-logo-url: "/logo.png";
  --brand-name: "Mi E-commerce";
}
```

## Core Features

### Shopping Flow
1. **Product Catalog**: Browse products with images and descriptions
2. **Product Detail**: View detailed product information
3. **Shopping Cart**: Add/remove products, view totals
4. **Guest Checkout**: Complete purchase without registration
5. **Cardano Payment**: Connect wallet and pay with ADA/tokens

### Payment Integration
- **CIP-30 Support**: Eternl, Lace wallets
- **Multi-token**: Accept ADA and custom Cardano tokens
- **Price Conversion**: Dynamic conversion from lovelace to selected token
- **Transaction Verification**: On-chain payment confirmation

### White-Label Features
- **Brand Customization**: Logo, colors, texts via CSS/config
- **SEO Configuration**: Meta tags, Open Graph, Twitter Cards
- **Contact Information**: Email, phone, social media
- **Feature Toggles**: Enable/disable specific functionality

## Type Strategy

### Global Type Declarations (`@types/`)

All external and shared types are declared globally in `@types/` (root level) for automatic availability without imports. This approach follows TypeScript conventions and provides better IDE integration:

#### TypeScript Configuration (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "typeRoots": ["./node_modules/@types", "./@types"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

#### `@types/index.d.ts` - Reference File
```typescript
/// <reference path="./database.d.ts" />
/// <reference path="./cardano.d.ts" />
/// <reference path="./brand.d.ts" />
/// <reference path="./api.d.ts" />

// Future global extensions can be added here
// declare global { ... }
```

#### `@types/database.d.ts` - Database Schema Types
```typescript
// Database entities matching Supabase schema
export interface Product {
  id: string;
  name: string;
  description?: string;
  price_lovelace: number;
  stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  customer_email?: string;
  status: OrderStatus;
  total_lovelace: number;
  wallet_address?: string;
  transaction_hash?: string;
  created_at: string;
  updated_at: string;
}

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
```

#### `@types/cardano.d.ts` - Cardano Integration Types
```typescript
export interface CardanoWallet {
  name: string;
  icon: string;
  api: {
    getBalance(): Promise<string>;
    getUtxos(): Promise<any[]>;
    submitTx(tx: any): Promise<string>;
    signTx(tx: any): Promise<any>;
  };
}

export interface PaymentRequest {
  amount_lovelace: number;
  token_policy_id?: string;
  token_asset_name?: string;
  recipient_address: string;
}
```

#### `@types/brand.d.ts` - White-label Configuration Types
```typescript
export interface BrandConfig {
  seo: {
    title: string;
    description: string;
    ogImage?: string;
    twitterHandle?: string;
    keywords?: string[];
  };
  contact: {
    email: string;
    phone?: string;
    whatsapp?: string;
    social?: Record<string, string>;
  };
  business: {
    name: string;
    taxId?: string;
    address?: string;
  };
  features: {
    enableGuestCheckout: boolean;
    enableUserRegistration: boolean;
    enableStockManagement: boolean;
    enableMultipleImages: boolean;
  };
}
```

#### `@types/api.d.ts` - API Response Types
```typescript
export interface ApiResponse<T> {
  data: T;
  error?: string;
  message?: string;
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateOrderRequest {
  items: OrderItemRequest[];
  customer_email?: string;
}
```

### UI Types (Imported)

Component-specific types are defined locally and imported when needed:

```typescript
// Example: components/shop/ProductCard.tsx
interface ProductCardProps {
  product: Product;
  onAddToCart: (productId: string) => void;
  variant?: 'default' | 'compact';
}
```

### Type Benefits

1. **Auto-discovery**: Global types available without imports
2. **Clean Components**: UI components focus on props, not basic types
3. **Type Safety**: Consistent typing across entire application
4. **Scalability**: Easy to extend for multi-brand deployments
5. **IDE Support**: Full TypeScript intellisense globally
6. **Standard Convention**: Follows TypeScript best practices with `@types/` at root
7. **Simple Configuration**: Minimal tsconfig.json setup required
8. **Better Tooling**: Improved compatibility with TypeScript tools and linters

## Technical Implementation

### Key Dependencies
```json
{
  "dependencies": {
    "@tanstack/react-start": "^1.149.1",
    "@tanstack/react-query": "^5.90.16",
    "@supabase/supabase-js": "^2.90.1",
    "tailwindcss": "^4.1.18",
    "@radix-ui/react-*": "^1.0.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.4.0",
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "@tanstack/react-start": "^1.149.1",
    "@testing-library/react": "^16.3.1",
    "@testing-library/jest-dom": "^6.9.1",
    "vitest": "^4.0.17",
    "jsdom": "^27.4.0"
  }
}
```

### Vite Configuration
```typescript
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tanstackStart(),
    tailwindcss()
  ],
  server: {
    port: 3000
  },
  resolve: {
    alias: {
      '~': './src'
    }
  }
})
```

### TypeScript Configuration
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "typeRoots": ["./node_modules/@types", "./@types"]
  },
  "include": ["**/*.ts", "**/*.tsx", "**/*.d.ts"],
  "exclude": ["node_modules"]
}
```

## Future Considerations

### Planned Features (Not in MVP)
- **Categories**: Product categorization system
- **User Reviews**: Product rating and review system
- **Discount System**: Promotional codes and discounts
- **User Registration**: Account creation and order history

### Scalability
- **Multi-brand**: Support for multiple brands from single codebase
- **Advanced Analytics**: Sales and user behavior tracking
- **Inventory Management**: Advanced stock control
- **Shipping Integration**: Multiple shipping providers

## Security Considerations

- **Wallet Security**: Proper CIP-30 implementation
- **Data Validation**: Input sanitization and validation
- **Transaction Verification**: On-chain payment confirmation
- **Rate Limiting**: API endpoint protection
- **CORS Configuration**: Proper cross-origin setup

## Deployment Strategy

### Vercel Configuration
- **Environment Variables**: Supabase URL, keys, and configuration
- **Build Optimization**: Proper asset bundling and caching
- **Domain Configuration**: Custom domain per brand
- **SSL/TLS**: Automatic HTTPS configuration

### Database Management
- **Migrations**: Supabase migration system
- **Backups**: Automated database backups
- **Monitoring**: Performance and error tracking
- **Scaling**: Horizontal scaling capability

## Testing Strategy

### Unit Tests
- Component testing with React Testing Library
- Utility function testing
- Database query testing

### Integration Tests
- Payment flow testing
- Wallet connection testing
- API endpoint testing

### E2E Tests
- Complete shopping flow
- Payment processing
- Cross-browser compatibility

---

## Implementation Steps

1. **Initialize Project Structure**
   - Run: `➜ pnpm create @tanstack/start@latest ecommerce-cardano --tailwind --add-ons shadcn --toolchain biome --package-manager pnpm --deployment nitro --no-git --target-dir .`
   - Setup custom folder structure (routes/, components/, lib/, etc.)
   - Create `@types/` directory at root level with global type declarations
   - Update `tsconfig.json` with proper typeRoots configuration
   - Create placeholder files for white-label

2. **Setup Type System**
   - Create `@types/index.d.ts` with reference directives
   - Create `@types/database.d.ts` with schema types
   - Create `@types/cardano.d.ts` with wallet types
   - Create `@types/brand.d.ts` with configuration types
   - Create `@types/api.d.ts` with response types
   - Configure `tsconfig.json` to include `@types/` in typeRoots

3. **Setup White-Label Configuration**
   - Create `src/config/brand.ts` with basic structure
   - Setup `src/styles/brand.css` with @theme directive
   - Create brand-specific CSS variables

4. **Database Foundation**
   - Create Supabase project
   - Execute schema migrations (empty tables)
   - Setup basic Supabase client connection

5. **Base Routing Structure**
   - Create route files in `src/routes/`
   - Setup placeholder components for shop flow
   - Create basic layout structure

6. **Cardano Integration Foundation**
   - Install wallet-specific dependencies
   - Create `src/lib/cardano.ts` placeholder
   - Setup basic wallet connection structure

## Tooling Configuration

The project uses **Biome** as the toolchain for linting and formatting, automatically configured by the CLI command:

- **Code Style**: 2 spaces indentation, 120 character line width, single quotes
- **Formatting**: Automatic semicolons, organized imports, sorted classes  
- **Linting**: Recommended rules with TypeScript strict mode
- **TanStack Start Optimization**: Configured for route naming conventions

---

*This document serves as complete technical specification for the e-commerce Cardano platform implementation.*