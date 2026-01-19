# E-commerce Cardano - Supabase Integration Specification

## Overview

This document outlines the complete technical specification for integrating Supabase with the existing Cardano e-commerce application. The implementation focuses on a local-first cart strategy with Supabase for product catalog and order management.

## Design Decisions

### Timestamp Strategy: timestamptz vs timestamp

**Decision**: Using `timestamptz` (timezone-aware timestamps) instead of `timestamp`.

**Rationale**:
- **Global Payments**: Cardano transactions are timestamped in UTC, requiring timezone awareness
- **Multi-regional Users**: E-commerce serves customers across different timezones
- **Audit Trail**: Payment timeouts and order tracking need precise temporal accuracy
- **Blockchain Integration**: Consistency with Cardano's UTC-based block timestamps

**Evolution from previous spec**:
- Previous design (`000-ecommerce-cardano.md`) used simple `timestamp`
- This spec upgrades to `timestamptz` for production-grade e-commerce requirements
- Change documented here to maintain historical traceability

### Local-First Cart Architecture

**Decision**: Shopping cart persists in localStorage with React Query cache for stock validation.

**Benefits**:
- Offline capability and instant UX
- Reduced database load
- Better performance for high-traffic scenarios
- Graceful handling of network interruptions

## Architecture Decisions

### Core Principles
- **Local Cart**: Shopping cart persists in localStorage for offline support and instant UX
- **Stock Strategy**: Use React Query cache for stock validation, real-time validation only at checkout
- **Payment Flow**: Multi-step checkout process with wallet connection as a dedicated step
- **Type Safety**: PostgreSQL enums for order status
- **Timeout Handling**: 60-second timeout for Cardano payments (3 blocks)

### Technology Stack
- **Frontend**: TanStack Start + React Query (already configured)
- **Database**: Supabase with PostgreSQL
- **Payment**: Cardano CIP-30 wallet integration
- **Storage**: localStorage for cart persistence
- **Type Safety**: Generated types from Supabase schema

## Database Schema

### Migration Requirements

Create `supabase/migrations/20240114_setup.sql`:

```sql
-- Products table with pricing in lovelace (1 ADA = 1,000,000 lovelace)
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_lovelace bigint NOT NULL,
  stock integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Product images (multiple images per product)
CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text text,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Order status enum for type safety
CREATE TYPE order_status AS ENUM (
  'pending',
  'payment_failed', 
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled'
);

-- Orders table with wallet address and payment tracking
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  total_lovelace bigint NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  cardano_tx_hash text,
  payment_error text,
  is_timeout boolean DEFAULT false,
  retry_count integer DEFAULT 0,
  can_cancel boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Order items with price snapshot
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  price_lovelace bigint NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_products_active ON products(created_at) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_orders_wallet ON orders(wallet_address);
CREATE INDEX idx_orders_status ON orders(status);

-- Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Public access for products
CREATE POLICY "Products are viewable by everyone" ON products FOR SELECT 
USING (is_active = true AND deleted_at IS NULL);

-- Wallet-based access for orders
CREATE POLICY "Users can manage own orders" ON orders FOR ALL 
USING (wallet_address = current_setting('app.current_wallet', true));
```

## File Structure

### New Files to Create

```
src/
├── lib/
│   ├── cart-storage.ts          # localStorage cart management
│   ├── cardano-payment.ts       # Payment processing with timeout
│   └── ada-formatter.ts         # Lovelace ↔ ADA conversion utilities
├── hooks/
│   ├── use-cart.ts              # Enhanced cart hook with React Query integration
│   └── use-orders.ts            # Order management mutations
├── components/
│   ├── CheckoutFlow.tsx         # Multi-step checkout component
│   ├── CartDrawer.tsx           # Cart sidebar/drawer
│   ├── StepIndicator.tsx        # Progress indicator for checkout
│   └── PaymentError.tsx         # Payment error handling component
└── routes/
    └── order-confirmation.$orderId.tsx  # Order confirmation page

supabase/
└── migrations/
    └── 20240114_setup.sql       # Database schema migration
```

### Existing Files to Modify

```
src/
├── hooks/
│   └── use-products.ts          # Replace with React Query implementation
├── components/
│   ├── ProductCard.tsx          # Update interface and stock validation
│   └── Header.tsx               # Dynamic cart badge integration
└── routes/
    ├── product.$productId.tsx    # Real product data integration
    └── checkout.tsx              # Enhanced checkout page
```

## Component Specifications

### 1. Cart Storage System (`src/lib/cart-storage.ts`)

**Interface Requirements:**
```typescript
interface CartItem {
  productId: string;
  quantity: number;
  addedAt: number; // For sorting and potential expiration
}

interface CartStorage {
  items: CartItem[];
  metadata: {
    version: string;
    lastUpdated: number;
  };
}
```

**Class Requirements:**
- `get(): CartStorage | null` - Retrieve cart from localStorage
- `save(cart: CartStorage): void` - Save cart to localStorage
- `clear(): void` - Clear cart from localStorage
- `getItemQuantity(productId: string): number` - Get quantity for specific product

**Implementation Notes:**
- Handle SSR (check for `typeof window !== 'undefined'`)
- Include error handling for localStorage operations
- Use consistent key: `'ecommerce-cart'`

### 2. Enhanced Cart Hook (`src/hooks/use-cart.ts`)

**Hook Requirements:**
- Use `useQueryClient` from React Query for product cache access
- Load cart from localStorage on mount
- Save to localStorage on every cart change
- Validate stock using React Query cache before adding items

**Core Functions:**
```typescript
interface CartHook {
  items: ExtendedCartItem[]; // CartItem + product data
  addItem(productId: string, quantity: number): void;
  removeItem(productId: string): void;
  updateQuantity(productId: string, quantity: number): void;
  clear(): void;
  total: number; // Total in lovelace
  itemCount: number; // Total items count
}
```

**Stock Validation Logic:**
1. Get product from React Query cache: `queryClient.getQueryData(['products'])`
2. Check existing quantity in cart for that product
3. Validate: `existingQuantity + newQuantity <= product.stock`
4. Throw error if insufficient stock

**Implementation Notes:**
- Use React Query for product data source of truth
- Provide clear error messages for stock validation
- Maintain localStorage persistence throughout

### 3. React Query Products Hook (`src/hooks/use-products.ts`)

**Replace existing implementation with:**
```typescript
// All products
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          product_images (image_url, alt_text, display_order)
        `)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000    // 10 minutes
  });
}

// Single product
export function useProduct(productId: string) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          product_images (image_url, alt_text, display_order)
        `)
        .eq('id', productId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000
  });
}
```

### 4. Enhanced Product Card (`src/components/ProductCard.tsx`)

**Interface Updates:**
```typescript
export interface Product {
  id: string;
  name: string;
  description: string;
  price_lovelace: number; // Changed from price
  stock: number;
  is_active: boolean;
  product_images?: Array<{
    image_url: string;
    alt_text?: string;
    display_order: number;
  }>;
  created_at: string;
  updated_at: string;
}
```

**Display Logic:**
- Convert `price_lovelace` to ADA: `price_lovelace / 1_000_000`
- Display with 6 decimal places for ADA
- Show first product image or fallback emoji
- Stock status: green for in stock, red for out of stock
- Disable add to cart button when stock is 0

### 5. Checkout Flow Component (`src/components/CheckoutFlow.tsx`)

**Step Management:**
```typescript
type CheckoutStep = 'review' | 'wallet' | 'payment' | 'result';
```

**Flow Logic:**
1. **Review Step**: Show cart summary, "Proceed to Payment" button
2. **Wallet Step**: Show wallet connection if not connected
3. **Payment Step**: Show payment processing and confirmation
4. **Result Step**: Show success/error result

**Component Structure:**
```typescript
export function CheckoutFlow() {
  const [step, setStep] = useState<CheckoutStep>('review');
  const { items, total, clear } = useCart();
  const { wallet } = useWallet();
  const createOrderMutation = useCreateOrder();
  
  // Handle checkout flow transitions
  // Handle order creation with stock validation
  // Handle payment processing
  // Handle error states and retries
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <StepIndicator current={step} steps={['review', 'wallet', 'payment', 'result']} />
      {/* Step components based on current step */}
    </div>
  );
}
```

### 6. Order Management (`src/hooks/use-orders.ts`)

**Create Order Mutation:**
```typescript
export function useCreateOrder() {
  return useMutation({
    mutationFn: async (data: CreateOrderData): Promise<Order> => {
      // 1. Real stock validation
      // 2. Create order with 'pending' status
      // 3. Insert order items with price snapshot
      // 4. Return created order
    },
    onSuccess: () => {
      // Invalidate products cache for stock updates
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });
}
```

**Update Order Status Mutation:**
```typescript
export function useUpdateOrderStatus() {
  return useMutation({
    mutationFn: async ({
      orderId, 
      status, 
      txHash = null, 
      error = null
    }: {
      orderId: string; 
      status: OrderStatus; // Type-safe enum
      txHash?: string | null; 
      error?: string | null;
    }) => {
      return supabase
        .from('orders')
        .update({
          status,
          cardano_tx_hash: txHash,
          payment_error: error,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);
    }
  });
}
```

### 7. Payment Processing (`src/lib/cardano-payment.ts`)

**Timeout Configuration:**
```typescript
const CARDANO_PAYMENT_TIMEOUT = 60000; // 60 seconds = 3 Cardano blocks
```

**Payment Function:**
```typescript
export async function processCardanoPayment(
  wallet: CardanoWallet,
  order: Order
): Promise<PaymentResult> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Payment timeout')), CARDANO_PAYMENT_TIMEOUT)
    );
    
    const paymentPromise = wallet.submitPayment({
      amount: order.total_lovelace,
      recipient: MERCHANT_ADDRESS,
      metadata: { orderId: order.id }
    });
    
    const txHash = await Promise.race([paymentPromise, timeoutPromise]);
    return { success: true, txHash };
    
  } catch (error) {
    return { 
      success: false, 
      error: error.message || 'Payment failed',
      isTimeout: error.message === 'Payment timeout'
    };
  }
}
```

## Implementation Steps

### Phase 1: Database Setup (2 hours)
1. Create migration file with schema
2. Run migration in Supabase
3. Verify RLS policies work correctly

### Phase 2: Cart System (3 hours)
1. Implement cart storage system
2. Create enhanced useCart hook
3. Integrate with React Query for stock validation
4. Test localStorage persistence

### Phase 3: Product Integration (3 hours)
1. Replace useProducts with React Query
2. Update ProductCard interface
3. Implement image handling
4. Update product detail pages

### Phase 4: Checkout Flow (4 hours)
1. Create CheckoutFlow component with steps
2. Implement order management mutations
3. Integrate wallet connection
4. Handle payment processing with timeout

### Phase 5: UI Polish (2 hours)
1. Update Header with dynamic cart badge
2. Create order confirmation page
3. Implement error handling components
4. Add loading states and transitions

## Key Considerations

### Stock Management Strategy
- **Adding to Cart**: Use React Query cache (5-minute stale time)
- **Checkout**: Real-time validation against database
- **Order Creation**: Double-check stock before order creation
- **Cache Invalidation**: Update products cache after successful orders

### Error Handling
- **Payment Timeout**: Mark order as `payment_failed` with `is_timeout: true`
- **Stock Mismatch**: Show error message with available quantity
- **Network Issues**: Maintain cart state, allow retry
- **Wallet Errors**: Clear instructions for user action

### Type Safety
- Use generated Supabase types for all database operations
- Leverage PostgreSQL enum for order status
- Ensure all mutations are properly typed
- Validate input schemas with Zod if needed

### Performance
- React Query provides efficient caching and background refetching
- localStorage ensures instant cart operations
- Minimal database calls (only for checkout and catalog)
- Optimistic updates where appropriate

## Testing Requirements

### Unit Tests
- Cart storage operations
- Stock validation logic
- Price conversion utilities
- Type safety verification

### Integration Tests
- Complete checkout flow
- Payment timeout scenarios
- Stock validation edge cases
- Error recovery procedures

### Manual Testing
- Multi-tab cart synchronization
- Network failure scenarios
- Wallet connection flows
- Order confirmation page accuracy

## Deployment Notes

### Environment Variables
Ensure these are properly configured:
```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Migration
Run migration in this order:
1. Development: `supabase db push`
2. Staging: `supabase db push --remote staging`
3. Production: `supabase db push --remote production`

## Future Enhancements

### Potential Additions
- Guest user cart persistence across devices
- Advanced inventory management
- Order history and tracking
- Email notifications (requires auth)
- Admin dashboard for order management

### Performance Optimizations
- Server-side rendering for product pages
- Image optimization with CDN
- Advanced caching strategies
- Database query optimization

---

## Version History

- **v1.0** (2024-01-14): Initial specification with timestamptz timestamp strategy
- **Evolved from**: `000-ecommerce-cardano.md` - Enhanced with local-first cart, payment timeouts, and production-grade timestamp handling

This specification provides a comprehensive foundation for implementing Supabase integration with best practices in type safety, performance, and user experience. The local-first cart strategy ensures excellent UX while maintaining data consistency through React Query and proper stock validation.