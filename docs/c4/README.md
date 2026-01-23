# C4 Architecture Diagrams - Ecommerce Whitelabel Platform

This directory contains the C4 model architecture diagrams for the whitelabel ecommerce platform built with Cardano blockchain payments.

## 📋 Overview

The C4 model is a simple and effective way to visualize software architecture. It consists of 4 levels of diagrams:

1. **Context** - System as a black box with external interactions
2. **Containers** - High-level technology building blocks  
3. **Components** - Internal components of key containers
4. **Code** - (Optional) Implementation details

**Additional Diagrams:**
5. **Database Schema** - Entity relationships and data structure

## 📁 File Structure

```
docs/c4/
├── README.md              # This file - guide and overview
├── c4-styles.puml         # Reusable styles and definitions
├── context.puml           # Level 1: System Context
├── containers.puml        # Level 2: Container Diagram
├── components.puml        # Level 3: Component Diagram
└── database-schema.puml  # ER Diagram for Supabase
```

## 🎨 Diagram Descriptions

### 1. Context Diagram (`context.puml`)
**Purpose:** Shows the system as a black box and its interactions with external entities.

**Key Elements:**
- **Customer** - End users who purchase products
- **Administrator** - Staff managing products/orders via Supabase
- **Ecommerce Whitelabel** - The main system
- **Supabase** - Database and backend services
- **Cardano Network** - Blockchain payment processing
- **Wallet Providers** - Eternl, Lace wallet integration

**Use Case:** High-level stakeholder presentations, system overview documentation.

### 2. Container Diagram (`containers.puml`)
**Purpose:** Shows the high-level technology building blocks and how they interact.

**Key Containers:**
- **Web Application** - TanStack Start/React frontend
- **Cart Service** - Local-first cart management
- **Payment Service** - Cardano CIP-30 integration
- **Database** - Supabase PostgreSQL

**Use Case:** Technical architecture discussions, development team onboarding.

### 3. Component Diagram (`components.puml`)
**Purpose:** Shows the internal components of the Web Application container.

**Key Components:**
- **Product Catalog** - Product management and display
- **Shopping Cart** - Cart operations and persistence
- **Checkout Flow** - Multi-step payment process
- **Order Management** - Order tracking and management
- **Brand Configuration** - Whitelabel customization
- **Cardano Integration** - Wallet connection and payments

**Use Case:** Detailed technical documentation, component-level development planning.

### 4. Database Schema (`database-schema.puml`)
**Purpose:** Entity Relationship diagram showing the complete database structure.

**Key Tables:**
- **products** - Product catalog with pricing in lovelace
- **product_images** - Multiple images per product
- **orders** - Order management with Cardano wallet integration
- **order_items** - Line items with price snapshots
- **order_status** - Enum for order lifecycle

**Use Case:** Database documentation, data modeling, query optimization.

## 🛠️ Technology Stack

### Frontend
- **Framework:** TanStack Start (React-based)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **State:** React Query + React Context

### Backend/Database
- **Database:** Supabase PostgreSQL
- **API:** Server functions (TanStack Start)
- **Auth:** Row Level Security (RLS)
- **Hosting:** Vercel Edge Platform

### Blockchain
- **Network:** Cardano
- **Standard:** CIP-30 wallet integration
- **Wallets:** Eternl, Lace
- **Payments:** Native ADA + tokens

### Infrastructure
- **Frontend Hosting:** Vercel Cloud
- **Database Hosting:** Supabase Cloud
- **Blockchain:** Cardano Mainnet
- **Wallets:** Browser Extensions

## 🎯 Key Features Illustrated

### Whitelabel Architecture
- **Brand Configuration** component for customization
- **CSS Variables** for theming
- **Configurable business information**

### Local-First Cart
- **localStorage** persistence
- **React Context** state management
- **Cross-tab synchronization**

### Cardano Integration
- **CIP-30** wallet connection
- **Multi-token** payment support
- **On-chain transaction** verification

### Real-Time Features
- **React Query** caching
- **Supabase subscriptions**
- **Stock validation** at checkout

### Database Design
- **Soft Deletes** - Preserve data with deleted_at timestamps
- **Price Snapshots** - Historical pricing in order_items
- **Cardano Integration** - Wallet addresses and transaction hashes
- **Row Level Security** - User-restricted data access
- **Optimized Indexes** - Performance for active/featured products

## 🔄 Maintenance

### Adding New Components
1. Update `components.puml` with new component definitions
2. Add relationships to existing components
3. Update `c4-styles.puml` if new styles needed

### Technology Changes
1. Update container/component descriptions in respective files
2. Modify technology labels in relationships
3. Update this README if stack changes significantly

### Brand Customization
1. Modify colors in `c4-styles.puml`
2. Update legend and title configurations
3. Test rendering across different platforms

## 📚 References

- [C4 Model Official Site](https://c4model.com/)
- [PlantUML C4 Documentation](https://plantuml.com/c4)
- [C4-PlantUML GitHub](https://github.com/plantuml-stdlib/C4-PlantUML)
- [TanStack Start Documentation](https://tanstack.com/start/latest)
- [Supabase Documentation](https://supabase.com/docs)
- [Cardano CIP-30 Standard](https://cips.cardano.org/cips/cip30/)

---

**Last Updated:** January 2026  
**Version:** 1.0.0  
**Platform:** Ecommerce Whitelabel with Cardano Payments