# Shopping Cart and Checkout Flow - Design Specification

## Overview

This document outlines the complete technical specification for implementing a comprehensive shopping cart and multi-step checkout flow for the Cardano e-commerce platform. The implementation focuses on enhancing the existing local-first cart architecture with a mini-cart dropdown, dedicated cart page, and streamlined checkout process while maintaining the current synchronization strategy.

## Design Decisions

### Dual Cart Interface Strategy
**Decision**: Implement both mini-cart dropdown in header and dedicated cart page (`/cart`).

**Rationale**:
- **Quick Access**: Mini-cart provides instant feedback and quick actions without page navigation
- **Complete Management**: Dedicated cart page allows for detailed item management and bulk operations
- **User Expectations**: Modern e-commerce users expect both quick view and detailed cart management
- **Mobile Optimization**: Mini-cart works well on mobile, while cart page provides tablet/desktop optimization

### Multi-Step Checkout Flow
**Decision**: Implement 4-step checkout process instead of single-page checkout.

**Rationale**:
- **Reduced Cognitive Load**: Breaking checkout into manageable steps reduces user anxiety
- **Better Error Handling**: Each step can be validated independently with clear feedback
- **Progressive Disclosure**: Users only see relevant information at each stage
- **Higher Conversion**: Step-by-step flow has proven higher conversion rates in e-commerce

### Maintain Current Synchronization Strategy
**Decision**: Keep existing localStorage + React Query synchronization without migrating to full React Query cart state.

**Rationale**:
- **Proven Reliability**: Current implementation already handles header synchronization correctly
- **Performance**: localStorage provides instant updates without network latency
- **Simplicity**: No additional complexity required for state management
- **Cross-tab Support**: Storage events already handle synchronization between browser tabs

## Architecture Decisions

### Core Principles
- **Local-First Cart**: Shopping cart persists in localStorage for instant UX and offline support
- **Progressive Enhancement**: Mini-cart for quick actions, cart page for detailed management
- **Step-Based Checkout**: Clear progression through checkout stages with validation
- **Type Safety**: Full TypeScript coverage with proper interface definitions
- **Responsive Design**: Mobile-first approach with adaptive layouts

### Technology Stack
- **Frontend**: TanStack Start + React Query (existing)
- **Cart Storage**: localStorage with React Query for product validation
- **UI Components**: Tailwind CSS + Shadcn/ui (existing)
- **State Management**: Custom hooks with localStorage persistence
- **Payment Integration**: Existing Cardano CIP-30 wallet integration

## Component Architecture

### New Components to Create

**Cart Components**:
- **MiniCart.tsx**: Header dropdown cart with quick actions
- **CartItem.tsx**: Individual cart item display with controls
- **CartSummary.tsx**: Order totals and checkout initiation
- **EmptyCart.tsx**: Empty cart state with call-to-action

**Checkout Components**:
- **CheckoutPage.tsx**: Multi-step checkout wrapper with state management
- **StepIndicator.tsx**: Visual progress indicator with navigation
- **ReviewStep.tsx**: Step 1 - Cart review and confirmation
- **ShippingStep.tsx**: Step 2 - Shipping information collection
- **PaymentStep.tsx**: Step 3 - Wallet connection and payment
- **ConfirmationStep.tsx**: Step 4 - Order confirmation and details

**UI Components**:
- **QuantitySelector.tsx**: Reusable quantity input with validation

### Existing Components to Modify

**Header Integration**:
- Add mini-cart dropdown functionality to existing header
- Integrate cart icon with real-time badge updates
- Handle dropdown state and user interactions

**Product Card Enhancement**:
- Add quantity selector option for adding multiple items
- Enhance add-to-cart functionality with stock validation
- Support quick-add from product listings

**Button Variants**:
- Create cart-related button styles and variants
- Add loading states and disabled styles
- Support different sizes and contexts

**Route Structure**:
- Create new cart page route with proper SEO
- Enhance existing checkout route with validation
- Implement route guards for cart access control

## Database Schema Considerations

### Current Schema Compatibility

**Products Table**: Already supports required functionality:
- Product information with pricing in lovelace
- Stock management for validation
- Product images and descriptions
- Active/inactive status handling

**Orders Table**: Already supports checkout flow:
- Order status tracking (pending, paid, failed, etc.)
- Wallet address and transaction hash storage
- Payment error handling and timeout tracking
- Created/updated timestamps for auditing

**Order Items Table**: Already supports cart functionality:
- Product references with price snapshots
- Quantity tracking and subtotals
- Proper relationships with orders and products

### Potential Future Enhancements

**Shipping Cost Integration**:
- Add shipping cost calculation based on item count or weight
- Support multiple shipping methods with different pricing
- Enable location-based shipping rates

**Discount System**:
- Support promotional codes with percentage or fixed discounts
- Implement usage limits and expiration dates
- Enable minimum order requirements for discounts
- Track discount usage for analytics

## Component Specifications

### 1. MiniCart Component (`src/components/cart/MiniCart.tsx`)

**Primary Goal**: Provide instant cart access and quick actions without page navigation.

**Core Requirements**:
- **Dropdown Interface**: Slide-down animation from header cart icon
- **Item Limit**: Display maximum 5 most recent items with "View all" link
- **Quick Actions**: Direct checkout and view full cart buttons
- **Real-time Data**: Sync with useCart hook for live updates
- **Empty State**: Clear messaging when cart is empty

**Key Behaviors**:
- Open/close on cart icon click
- Close on click outside or escape key
- Show item count, subtotal, and quick action buttons
- Display product images, names, quantities, and prices
- Handle loading states during cart operations

**Technical Constraints**:
- Position relative to header cart icon
- Responsive design for mobile (full-width on small screens)
- Smooth animations with proper z-index layering
- Accessibility with proper ARIA labels and keyboard navigation

### 2. Cart Page Route (`src/routes/(shop)/cart.tsx`)

**Primary Goal**: Provide comprehensive cart management with detailed item control.

**Core Requirements**:
- **Responsive Layout**: 2/3 items section, 1/3 summary on desktop
- **Item Management**: Quantity adjustment, item removal, stock validation
- **Order Summary**: Real-time calculation of subtotal, shipping, and total
- **Empty State**: Clear call-to-action to continue shopping
- **Navigation**: Seamless flow to checkout and back to products

**Key Behaviors**:
- Display all cart items with full product details
- Allow quantity changes with stock validation
- Show individual item subtotals and cart total
- Provide clear remove item functionality
- Handle cart persistence during navigation

**Technical Constraints**:
- Mobile-first responsive design
- Grid layout that adapts to screen size
- Integration with useCart hook for state management
- Proper loading states and error handling
- SEO-friendly with proper meta tags
- Direct route implementation (no separate component file)

### 3. Cart Item Component (`src/components/cart/CartItem.tsx`)

**Primary Goal**: Display individual cart items with management controls.

**Core Requirements**:
- **Product Display**: Image, name, description, price per unit
- **Quantity Control**: Integration with QuantitySelector component
- **Stock Validation**: Real-time stock checking with visual indicators
- **Price Calculation**: Display per-item price and subtotal
- **Removal Functionality**: Clear remove button with confirmation

**Key Behaviors**:
- Show product image with fallback to placeholder
- Display product name and brief description
- Allow quantity adjustment within stock limits
- Show low stock warnings (≤5 items)
- Calculate and display item subtotal
- Handle removal with smooth animation

**Technical Constraints**:
- Flexible layout that works in list and grid contexts
- Proper image handling with aspect ratio maintenance
- Loading states during quantity updates
- Accessibility with proper labels and keyboard support
- Error handling for stock validation failures

### 4. Quantity Selector Component (`src/components/ui/QuantitySelector.tsx`)

**Primary Goal**: Provide reusable quantity input with validation.

**Core Requirements**:
- **Increment/Decrement**: Plus/minus buttons with keyboard support
- **Direct Input**: Number input field for manual entry
- **Validation**: Enforce min/max constraints with visual feedback
- **Size Variants**: Support different sizes (sm, md, lg) for various contexts
- **Disabled States**: Proper handling when operations are not allowed

**Key Behaviors**:
- Handle button clicks and keyboard input
- Validate input against min/max constraints
- Show disabled states for boundary conditions
- Maintain focus management and accessibility
- Provide immediate visual feedback

**Technical Constraints**:
- Flexible sizing for different use cases
- Proper form validation integration
- Keyboard accessibility (tab, arrows, enter)
- Touch-friendly button sizes for mobile
- Consistent styling with design system

### 5. Checkout Page Component (`src/components/checkout/CheckoutPage.tsx`)

**Primary Goal**: Guide users through multi-step checkout process with clear progression.

**Core Requirements**:
- **Step Management**: Navigate between review, shipping, payment, and confirmation
- **Data Persistence**: Maintain order data across all steps
- **Progress Indication**: Clear visual feedback on checkout progress
- **Validation**: Step-by-step validation before allowing progression
- **Error Handling**: Graceful recovery with clear error messages

**Key Behaviors**:
- Display current step with proper context
- Allow navigation between completed steps
- Validate each step before progression
- Handle wallet connection for payment
- Show order confirmation on completion
- Clear cart on successful order completion

**Technical Constraints**:
- Mobile-responsive step navigation
- Proper form validation and error handling
- Integration with existing wallet system
- Loading states during payment processing
- Accessibility with proper focus management

### 6. Step Indicator Component (`src/components/checkout/StepIndicator.tsx`)

**Primary Goal**: Visualize checkout progress and allow step navigation.

**Core Requirements**:
- **Progress Display**: Clear indication of completed, active, and pending steps
- **Interactive Navigation**: Click to navigate between completed steps
- **Status Icons**: Checkmarks for completed steps, numbers for pending
- **Responsive Design**: Adapt layout for mobile and desktop
- **Accessibility**: Proper ARIA labels and keyboard navigation

**Key Behaviors**:
- Show step status with appropriate styling
- Allow clicking on completed steps to navigate back
- Display step titles and connection lines
- Handle mobile layout with vertical orientation
- Provide clear visual hierarchy

**Technical Constraints**:
- Flexible layout that works on all screen sizes
- Proper color coding for different step states
- Smooth transitions between state changes
- Keyboard navigation support
- Consistent styling with brand guidelines

### 7. Cart Summary Component (`src/components/cart/CartSummary.tsx`)

**Primary Goal**: Display order totals and checkout initiation.

**Core Requirements**:
- **Price Breakdown**: Subtotal, shipping estimate, taxes, total
- **Checkout Button**: Clear call-to-action to proceed to checkout
- **Shipping Info**: Basic shipping cost estimation
- **Mobile Optimization**: Sticky positioning on mobile devices
- **Empty State**: Proper handling when cart is empty

**Key Behaviors**:
- Calculate and display all cost components
- Show shipping estimate based on item count
- Provide prominent checkout button
- Handle cart empty state appropriately
- Maintain visibility during page scroll

**Technical Constraints**:
- Responsive design for mobile and desktop
- Proper price formatting with currency display
- Loading states during calculation updates
- Accessibility with proper labels and descriptions
- Integration with routing for checkout navigation

### 8. Empty Cart Component (`src/components/cart/EmptyCart.tsx`)

**Primary Goal**: Provide clear messaging and call-to-action when cart is empty.

**Core Requirements**:
- **Clear Messaging**: Inform user cart is empty
- **Call-to-Action**: Prominent button to continue shopping
- **Visual Design**: Engaging empty state illustration or icon
- **Navigation**: Direct link to products page
- **Accessibility**: Proper screen reader support

**Key Behaviors**:
- Display empty cart message with friendly tone
- Show clear continue shopping button
- Provide visual interest with illustrations
- Handle navigation to products page
- Maintain consistent styling with brand

**Technical Constraints**:
- Responsive design for all screen sizes
- Proper button sizing and touch targets
- Accessibility with proper ARIA labels
- Consistent styling with design system
- Fast loading and minimal resource usage

## Hook Specifications

### Enhanced useCart Hook

**Primary Goal**: Extend existing cart functionality with utility methods and enhanced item management.

**Core Requirements**:
- **Utility Functions**: Calculate totals, item counts, and shipping estimates
- **Enhanced Item Management**: Async operations with user feedback
- **Stock Validation**: Real-time stock checking and availability
- **Error Handling**: Graceful error recovery with user notifications
- **Performance**: Optimized calculations and localStorage operations

**Key Behaviors**:
- Calculate subtotal, shipping costs, and total order amount
- Provide item count and empty cart status
- Handle quantity updates with stock validation
- Manage item removal with confirmation feedback
- Show success/error notifications for cart operations
- Maintain cross-tab synchronization with storage events

**Technical Constraints**:
- Maintain existing localStorage persistence strategy
- Integrate with React Query for product data validation
- Provide TypeScript interfaces for all return values
- Handle SSR scenarios with proper window checks
- Support optimistic updates with rollback capability

### New useCheckout Hook

**Primary Goal**: Manage multi-step checkout process with order creation and payment integration.

**Core Requirements**:
- **Order Data Management**: Persist checkout data across steps
- **Order Creation**: Handle real-time stock validation and order processing
- **Payment Integration**: Connect with existing Cardano wallet system
- **Error Handling**: Comprehensive error recovery and user feedback
- **State Management**: Track checkout progress and loading states

**Key Behaviors**:
- Maintain order data throughout checkout steps
- Validate stock in real-time before order creation
- Create orders with proper status tracking
- Handle wallet connection for payment processing
- Clear cart on successful order completion
- Provide loading states and error messages

**Technical Constraints**:
- Integrate with existing useCart hook for item data
- Connect with Cardano wallet payment system
- Use React Query for order mutations and caching
- Handle network failures and payment timeouts
- Maintain data consistency across checkout steps

## Route Specifications

### Cart Route (`/cart`)

**Primary Goal**: Provide dedicated cart page with comprehensive item management.

**Core Requirements**:
- **Page Implementation**: Render cart page with full functionality directly in route
- **Meta Tags**: Proper SEO with title and description
- **Navigation**: Seamless integration with existing routing system
- **Authentication**: Support for both guest and authenticated users
- **Error Handling**: Graceful handling of empty cart states

**Key Behaviors**:
- Display cart page with all items and controls
- Handle navigation from product pages and header
- Provide proper meta tags for SEO optimization
- Support direct URL access and browser navigation
- Handle empty cart state with clear messaging

**Technical Constraints**:
- Integrate with TanStack Start routing system
- Use proper route groups for shop functionality
- Support server-side rendering with proper data loading
- Handle browser history and back navigation
- Maintain cart state during route transitions

### Checkout Route (`/checkout`)

**Primary Goal**: Provide multi-step checkout process with validation and payment integration.

**Core Requirements**:
- **Page Component**: Render CheckoutPage with step management
- **Cart Validation**: Redirect to cart if empty before checkout
- **Meta Tags**: SEO optimization for checkout page
- **Security**: Proper validation and error handling
- **Payment Integration**: Connect with Cardano wallet system

**Key Behaviors**:
- Validate cart has items before allowing checkout
- Display multi-step checkout process
- Handle navigation between checkout steps
- Integrate with wallet connection for payment
- Provide proper error handling and user feedback

**Technical Constraints**:
- Implement beforeLoad guard for cart validation
- Use proper route protection and validation
- Handle payment processing with timeout management
- Support browser navigation and history
- Maintain security best practices for payment processing

## Integration Specifications

### Route Structure

**Primary Goal**: Define new routes for cart and checkout functionality within existing routing system.

**Cart Route Requirements**:
- **URL Path**: `/cart` accessible from any page
- **Route Group**: Part of `(shop)` route group for consistent layout
- **Component Integration**: Connect with CartPage component
- **SEO Optimization**: Proper meta tags for search engines
- **Navigation**: Seamless integration with existing navigation system

**Checkout Route Requirements**:
- **URL Path**: `/checkout` with cart validation guard
- **Route Group**: Part of `(shop)` route group
- **Component Integration**: Connect with CheckoutPage component
- **Access Control**: Redirect to cart if cart is empty
- **Security**: Proper validation before checkout access

**Technical Constraints**:
- Use TanStack Start routing system
- Implement proper route groups for shared layout
- Handle server-side rendering with proper data loading
- Support browser history and back navigation
- Implement route guards for checkout protection

### Header Integration

**Primary Goal**: Enhance existing header with mini-cart dropdown functionality.

**Core Requirements**:
- **Cart Icon State**: Track dropdown open/close state
- **Badge Integration**: Display real-time item count
- **Click Handling**: Toggle mini-cart dropdown on icon click
- **Outside Click**: Close dropdown when clicking outside
- **Keyboard Support**: Handle escape key to close dropdown

**MiniCart Integration**:
- **Positioning**: Absolute positioning relative to cart icon
- **Animation**: Smooth slide-down with backdrop overlay
- **Navigation**: Provide checkout and full cart navigation options
- **Responsive**: Handle mobile display appropriately
- **Accessibility**: Proper ARIA labels and focus management

**Technical Constraints**:
- Maintain existing header structure and styling
- Use proper z-index layering for dropdown
- Handle click outside detection with event listeners
- Support touch interactions on mobile devices
- Maintain performance with efficient event handling

## Implementation Steps

### Phase 1: Foundation Components (4 hours)
1. **Create QuantitySelector** component with full validation
2. **Create CartItem** component with product integration
3. **Create EmptyCart** component with call-to-action
4. **Create CartSummary** component with calculations
5. **Test components in isolation**

### Phase 2: MiniCart Implementation (3 hours)
1. **Create MiniCart** component with dropdown functionality
2. **Integrate with Header** component
3. **Add click outside handling** and escape key support
4. **Implement animations** and transitions
5. **Test responsive behavior** on mobile devices

### Phase 3: Cart Page Implementation (4 hours)
1. **Implement cart page** directly in route file with responsive layout
2. **Implement item management** functionality
3. **Add stock validation** and error handling
4. **Configure cart route** with proper meta tags
5. **Test empty cart states** and navigation flows

### Phase 4: Checkout Flow Implementation (6 hours)
1. **Create StepIndicator** component with navigation
2. **Implement ReviewStep** with cart summary
3. **Create ShippingStep** with form validation
4. **Implement PaymentStep** with wallet integration
5. **Create ConfirmationStep** with order details
6. **Build CheckoutPage** wrapper with step management
7. **Create checkout route** with cart validation

### Phase 5: Hook Enhancements (3 hours)
1. **Extend useCart hook** with new utility functions
2. **Create useCheckout hook** with order management
3. **Add error handling** and user feedback
4. **Implement toast notifications** for cart actions
5. **Test cross-tab synchronization**

### Phase 6: Integration and Polish (4 hours)
1. **Update ProductCard** with quantity selector option
2. **Add loading states** and skeleton screens
3. **Implement error boundaries** for graceful failures
4. **Add accessibility features** and ARIA labels
5. **Test complete user flows** from product to order

### Phase 7: Testing and Optimization (3 hours)
1. **Unit tests** for all utility functions
2. **Integration tests** for cart operations
3. **E2E tests** for complete checkout flow
4. **Performance optimization** for large carts
5. **Cross-browser compatibility** testing

## Key Considerations

### User Experience
- **Progressive Enhancement**: Mini-cart for quick actions, cart page for detailed management
- **Clear Feedback**: Toast notifications for all cart actions
- **Error Recovery**: Graceful handling of stock issues and network errors
- **Mobile Optimization**: Touch-friendly interfaces with proper sizing

### Performance
- **Lazy Loading**: Load cart components only when needed
- **Debounced Updates**: Debounce quantity changes to reduce localStorage writes
- **Optimistic Updates**: Show immediate feedback while persisting changes
- **Memory Management**: Proper cleanup of event listeners and timers

### Accessibility
- **Keyboard Navigation**: Full keyboard support for all cart operations
- **Screen Reader Support**: Proper ARIA labels and announcements
- **Focus Management**: Logical focus flow through checkout steps
- **Color Contrast**: Ensure proper contrast ratios for all UI elements

### Security
- **Input Validation**: Sanitize all user inputs in forms
- **Stock Validation**: Real-time stock checking to prevent overselling
- **Data Persistence**: Secure localStorage handling with error boundaries
- **Payment Security**: Maintain existing wallet security standards

### Type Safety
- **Interface Coverage**: Full TypeScript coverage for all components
- **Generated Types**: Use Supabase generated types for database operations
- **Error Types**: Proper error type definitions for handling
- **Generic Components**: Reusable components with proper generic constraints

## Testing Requirements

### Unit Tests
- **Cart Storage Operations**: localStorage read/write/clear operations
- **Hook Functions**: All utility functions in useCart and useCheckout
- **Component Rendering**: Individual component rendering with props
- **Utility Functions**: Price formatting, stock validation, calculations

### Integration Tests
- **Cart Operations**: Add/remove/update items with stock validation
- **Header Integration**: MiniCart dropdown functionality
- **Route Navigation**: Cart and checkout route behavior
- **Cross-tab Sync**: Storage event handling between tabs

### E2E Tests
- **Complete Shopping Flow**: Product → Cart → Checkout → Order
- **Error Scenarios**: Stock issues, network failures, payment errors
- **Mobile Experience**: Touch interactions and responsive layouts
- **Accessibility**: Keyboard navigation and screen reader support

### Performance Tests
- **Large Cart Handling**: Performance with 50+ items in cart
- **Memory Usage**: Component cleanup and memory management
- **Network Latency**: Behavior under slow network conditions
- **LocalStorage Limits**: Handling of localStorage quota exceeded

## Future Enhancements

### Potential Additions
- **Wishlist Integration**: Save items for later with cart import
- **Discount Codes**: Promotional code system with validation
- **Guest Cart Persistence**: Cross-device cart synchronization
- **Order History**: User account integration with order tracking
- **Advanced Shipping**: Multiple shipping options with real-time calculation

### Performance Optimizations
- **Server-Side Rendering**: SSR for cart and checkout pages
- **Image Optimization**: CDN integration for product images
- **Caching Strategy**: Advanced React Query caching configurations
- **Bundle Optimization**: Code splitting for cart/checkout components

### Feature Expansions
- **Multi-Currency Support**: Price display in different currencies
- **Product Recommendations**: AI-powered suggestions in cart
- **Abandoned Cart Recovery**: Email reminders for incomplete orders
- **Express Checkout**: One-click checkout for returning customers
