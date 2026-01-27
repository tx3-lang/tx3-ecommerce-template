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
docs/architecture/
├── README.md              # This file - guide and overview
├── c4-styles.puml         # Reusable styles and definitions
├── context.puml           # Level 1: System Context
├── containers.puml        # Level 2: Container Diagram
├── components.puml        # Level 3: Component Diagram
└── database-schema.puml  # ER Diagram for Supabase
```

**Diagram Rendering:** All diagrams are embedded directly in this README file for easier maintenance and viewing. Styles are centrally managed in `c4-styles.puml` and referenced via GitHub raw URL to avoid duplication and ensure consistency across all diagrams.

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

[![Context diagram](https://www.plantuml.com/plantuml/svg/hLLRRwGs57xdLvpceMMbJcYrULgfqX9mDv5c00raetr21ZnWnTZ8brnQzR_tU239T3FRRTJaWTZ7v_ATxpid-MWirTQD8lW9Vll_FvWbEOD4ISlkBQISzfgEi5CQIAl6aUcMmVN0BHEqOG8AGIq-ZczMVCrkCUsl7w1yC9QDJqXMK0xgpe0T69ZvYHgWq0ZQta2Zxjy8GV03bwrm7OF1sibyY29DxqvxRWVNE8FjUppIdY8PqIIezColZEq4RwBaR5LuqzLc7OqKCMeqrKi7fnDwlYQxlN-_mcpz_i0UoLzXvrZNiaYpdOa6HZiJTQh5pwpLSgEwzIgrrcaMjMS8yK4mCuD0gYfk1Gki_xuGU_KTgJ6yODeeQOBaggpo3Tc6hJDMOSZFS98invDtGPnkBhEGTYEN-13xtznOJQt2LyopY6mWT8RB7in0DUkWOpjqj1mhm4wh4Vw9_rr0ado3LHCIFl5IpqE1PVuLF9OjhuhuF2v9QDn46seEGil5Wbv9l4tZB0zRgZigrRDFCXiWO_PEwHjqlOxNQrALuHqLWjbdp-lz7GgjRdc7XA7hPmzw7TvwUEBPy_F-FbEoHSJxrWS-lPgOgvAKzKLL5UM18aSuEjUuImn-XCdXd50yJbfrhhKUv2REua-aVDJj9KqRAcd_789fb5uQn77O8eGqhk8ZsdoRSKW4Pz9YXcAR9wGiwoB-iY5PTIJBDoL9BelL-r-yU7cMaQIgPsMEfFXQggV8b1Jh_0j9wpmx4lQrRXSA3nqeUO8NqY4dlplPxlNnqvzW8pCNCvSl4wHi4ke12HoLv7uhl8sQeL7Oqk6AGAESxAX-W5uhD_cPm766XbdBDDnouwX05Neg-H_xyGdckFfyYGkvt6bgh7RxFmdrOpxVl52kWyl3Tzm0-3C0-6-x0l2zkVuhU86d4QgzmTdZyX3B-PCLS8_dH0kMLsmam2js4h7vVpizarrGNkJNzPfy8baQ8liVqOPxzJS0 "Context diagram")](./context.puml)

### 2. Container Diagram (`containers.puml`)
**Purpose:** Shows the high-level technology building blocks and how they interact.

**Key Containers:**
- **Web Application** - TanStack Start/React frontend
- **Cart Service** - Local-first cart management
- **Payment Service** - Cardano CIP-30 integration
- **Database** - Supabase PostgreSQL

**Use Case:** Technical architecture discussions, development team onboarding.

[![Container diagram](https://www.plantuml.com/plantuml/svg/hLHHRzis47xNh-3oKXUeus7DKu41LMIj2M0xgcNNs9D0KHUB24KAv2cECUo_xoWgjk1c1OPL3nBloFlkxljE_EoGM-mQ5RrZl___Xr2I6vOOZLngi6mk-TxoXZqQor9XcWQi0BQh9OBY9IYMAOwqsVoqz0ju9jZVFhrHn9JbjJauXZMmMkxhgUhF8eXQ6sNsHrPsKbLIxrcfZ7XoFwcew1UfXUegoehOka-pcUM7wxt4kYixHunGfQ3nclYPjOfhByVKOQLaEKjkffbtRPUBMSCTWYLNSUhjkgMp_mKVNpvE2M_VB-1LaIb2GvaHPXOUtQm6NhbPPGIz0dU3nQtmqWdiBCp43HLvLE124KJMHgA22FtxJVf_F044a85rHhiesUQRXsMwdeZEeQ6G3-mg6PPNxwDulhnVJNZLI4qRiVzAXvQZyRk4anyTTSHkJQShRezHi8jNUt9gl2W75-7yiBghz-olYD7JlzwTstEzuu_rmsgJhkQJ0vG5Rrk2sq79uhPLKd2KHb-HQqaHZBeWaYt5CwaHx2EdZ9I2lVRgg0UFcSJhJP6dws_tIJeHt6BXm3vB0PuCCbaUJ8-yC8AhwQEq3fchJTlw8VOnhE6Qxw41ZGDi5l-vJ5Tdv9OVQNSCdWNF69_oLLoRy5-8slSnnB7M6W7EKS8XmJpUnBTndaugZhpapaFEXwN7oZq1piTLdK3tWHbRWQKlrzM91EQ32V1lBsVwWc0rLuEkBigtMKZXkhR7BLo_uz473yKIWVDuzJ0HeVZXpAYR5U31s2SwkeiNYtIJJmvSAS3poLrliyoQP-cB3EEr1jLhwchPkcYRftbnjzba-MXSptEmTU33AEOy71TgBdkDNE_s3As12-n735xmClODlO82hpjkB5Xodqq__dg9CL8cMM_dpBHWGqTN8mfPeYJXXU2B2HmXVEDAaWdC8Gt7kVwl7TZZ4FnTqPUQKDAoaSZGSksuEDLoUnguVqEwb8neqo0m-0CP9nAMyIh-akR3rJ5k8aZ0Xgiov2fkkNWQJV7tmtPdQ56ny7TdPEmjv5yNOKeMi0TTHVdTmwvOf5_yxK3-p-Jh6lKF "Container diagram")](./containers.puml)

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

[![Component diagram](https://www.plantuml.com/plantuml/png/hLLHRzis47xNh-3oKXMOwm79Ku41bMN5CMPBgYKdZm8jNMp2b2YGL1rls7_VKQ8grzOAR6qU7D_nxkFTn-_EdvIcKZSbTzwHtt_y3r7y1-ABiXOLL9hC6TrBMf9N8KcGYx84cGDvEJ0DdEw0avXJZOVbJxj-1LyGzlxZI14JaXp4IH5z0C8g3RAYdEHzc2BYbHpXZ9vAKrQ1L3-fAESNLkMyAO0SjAxLn-bKqjE7FTE7PjSeaEP2BE03bZAjEQtCSqoKBZZRJVs7IMnSs_LgMbAbGQ8hixrXJesn_mLVlzrF46_VVe7-HIOQIhnPmrJ2gveUW1PgMeWSFphkh4LbRfukrus4QVw0HPuvgAu892jbceEZpUSe_TzN00B4IBgebEDlapHQ1nitRvGMcF8hkVFjrxltZZTVBqEN5YMhyC0p_vdIacfXJeq6-oSaCz5K1PNdLe4li2DUNNEMKyr4vNmDo_emzmIxZDPrjhCEnB_AkdjF_d88_hKVxuP6LUk8Dz5ywwUPxwNUAbgujHH5a-iCaoaNUyIBEm_nEyyTkjQqedjGn0QJWYbyZZEXLK4K6DQnBuEUF4Lnl0mN2Bz9NNKGTSsgFO9BZJ29jOcFji5zGW2EkEQSY1fasu5gST5Io1fKELXm_odm_uYsQVQuYbxS_03vKJGwU-NYPFYtDdb4koswuPfD4A4cDJsNo82fFmUbB5wqcGURREs5tY9O1s7g2baWrsNRh8b7aCYuoFghom2dakR7hiZI4jDczhYpZHVECpyA7vSBToSnBaE9lp93xioOn6_DfclNG5xehPCK-xCz8-gC3PGM64cTUs6KBSCqM6oyT1c5Bb9Nq4faPc7iEq13HkSbI-ljhw6SWpORf8BSE4qJFJkc_B-DEkTKqnrLCCZKcQDQPbuIk8KzGx0-p00dA6sa0U497QH8J7Id-E3DxhEaRKWvoJRk45LJjp1Prwe1inxCj1ttNGunVOCXw9EGHmnzyLQh84tSKzkZZHnwHbL_OVQHi9uDy4vh1rOhPvi4IVQKfd5oCT6tap6Jk9wXFq2aySHhsNVg8SRwjvGRCUFGOjLuLuF3rN4ncZWYsMS6fq6GpiK6kEeQhTlnltZWpmt8yz3jjozZagyQlKXzffoX2GJhp8ycTGCqrwI5jDbNFL-pjW3TxGLcz3906572cnu76P-6k1lxNkW6or_6a_lVBCWDYPUj-9ljtD9vIy7LUDzAnYpci_b5Bx6rzk8a8SzKChhZe4P0heZuVn3NSle-nEY4ZcXbb5phl9pUNSaqqLYGedcBO6wSSHG2IfbLjk9HjElXzRjDPVtgcvVh5dTYVsU79ni6pYYbiah9PhYqtI7eTkqy2VnIa6vJncZi9IIVLnqxAzX3LJZu-_QIhO954CvTz7z2NrFoVm00 "Component diagram")](./components.puml)

### 4. Database Schema (`database-schema.puml`)
**Purpose:** Entity Relationship diagram showing the complete database structure.

**Key Tables:**
- **products** - Product catalog with pricing in lovelace
- **product_images** - Multiple images per product
- **orders** - Order management with Cardano wallet integration
- **order_items** - Line items with price snapshots
- **order_status** - Enum for order lifecycle

**Use Case:** Database documentation, data modeling, query optimization.

[![ER diagram](https://www.plantuml.com/plantuml/svg/pLVDRjl64x_hAGR-7-puNnbI73UkaHYHzO4QSHsdSjeU2X1ZxaXQUBdBxWvjAqM1lac07dheO_K9-WZbBhcIJ4YfWkPG0vR8cTzlE1ypg-4hnsYvo5Hh5rx--x_Iob2pv3byImfP6krcCeU1nAd532R6mZ0rMKOs9VX-9hb4tP22gn9SAhFFviK06M_G4OpJ6MK8RHWNUIMvCewdbiPlB-0pFQuqSorPKOlzvvfdVpHcJ-yNZaq6VQECTJvDIoD3HHbfTYrtAtMEFesfGkVWvnO0m1ccjrDh2Yq2-SMBQxnHT7eA_niUZfwE1kj1Grra7ZCw71wDZjPZlfDq7-mSZuw6nnN6M46s-Q3kLy-_73nj0fOFUNxM7VNMwEC33e-FXuVze1yPpKtpdS6pvxrkKnsDF-jrdnqtoGlJtREZuTDEwnUVOy-0wtbEhIf_mPN4CNBX81giibhUKdbBDhJmwMcGvQI5rDFg6kU-ACa4fI9HYsHzOKrApaMe7u2yngGconLnl4ETalByuDytA3M4g5tbeRSaYfGTn6n4z_RtfTZVFu6Ya0Bshbu_gQKQC_9ofWU6opVNSFdkugBM2NAfbRaFA49gJMvbIeaoTwGm3VmREPMQcnOSc_JMgqiTJSd2O3ZglRkuXavqoYMOihohR1YZ2FK2nBQW9Mv2o8KbiGuvGUKYDBM4J2913axBZ1nZblFx1LgR-xqOVv6BJq0BKhGM7VJjTlZw__dbOFX36RDuI68zwYWtwsDqlh2FIfd83AUqVK4ZRLKxMcY3iQImQbFDKN7YvOs22-boXVCaJC3cWcwV_KMOmUBsuTsZKiG92c79kKrHi65KM_KdSk6jF1xjY5hul5jFycwC4gr0RH9-I6RePeranL4dQurjwAHBV59CmV_KnvROpfFK59e_cd3KINKiR1YX_-HSL5LFgcfkqbRLQBHA8fcoxVibS9h3iDMe_5HWs4jManyROzjZyDE7OlVH6kHQYmDzfxjJ9X9sEWS7-plDm-44TcReVjHx_TwutniCd-ni8Yvp65YOvuJMWTIFo06rf7RNKLEZ6QL-_DJ8F3WuNHsfG2WSkHqVuQLXSe1QGDzennQbNrPqAGKsEPW9HETRFdjNCH9VyJBBfV3FNt-3Avzy1uwD9G5IGwm3x7MXD-Z1I-X-qUbq_Fz2zwGcZys4eUfQk9SyWsK7B-jJOtlXw8Q9L4ps11O_MV0oZ1VqBWUhzFDnA7qa5spQos4g6N8w9TiYBS17t5gDkqfP5VKRVzcCkL-TEr3DJTjlUmBSt35bDU9CcVGsdQ7Km1QrywwQS9tUIZs5EudGEBrYFgjJ2-hZ2MQeXVAKa9-LqoZwKkqY6EoZKkQU1DpCGT042yND26yCiybYa7KVBIE5St-_hiJWDEPkPXYG8Izi6PoZuEK2HOxi7JcOISUcvA02FvgbypNaGkhRnKyDcqL_DPrKDE7eOcpT5H_7GH3MmcL9wWMjue2I4qhdgOhEZQp9uXu8RE8-9usk0L_xD9EB-o7u_R2mjEhQBbpGjBnjgV0LKsdbTCR1k-RhGmKFBWPzV24u2QA_FdpulTuQeLtwRma4CbQQFq9qNZ6I3oJW3bL1BXfwJVFQoDLhQFlwP6ZdK8fBqSYBHiQId6elYgHpBUY1F2yMZAn_Y_7z0oPdcSdtk9AHjmMLDZ5DIP6j53vgLUMWzQhyB3BrDm00 "ER diagram")](./database-schema.puml)

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

## 🔄 Maintenance Guide

### 📝 Updating Diagrams

#### Adding New Components
1. **Edit Component Diagram**: Update `components.puml` with new component definitions
2. **Generate New URL**: Use PlantUML online editor to generate updated diagram URL
3. **Update README**: Replace the diagram URL in the appropriate section
4. **Add Component Definitions**: If reusable, add to `c4-styles.puml` under "Common Component Definitions"
5. **Test Rendering**: Verify diagram displays correctly in markdown viewers

#### Technology Stack Changes
1. **Update Container Descriptions**: Modify technology labels in `containers.puml`
2. **Update Component Details**: Edit component technologies in `components.puml`
3. **Refresh Diagrams**: Generate new URLs for affected diagrams
4. **Update Documentation**: Modify Technology Stack section if changes are significant
5. **Update Relationships**: Adjust technology labels in relationship definitions

#### Brand Customization
1. **Color Scheme**: Modify colors in `c4-styles.puml` (lines 8-13)
2. **Legend Updates**: Edit legend text in `c4-styles.puml` if needed
3. **Title Configuration**: Update title/version in `c4-styles.puml` (lines 23-26)
4. **Test All Diagrams**: Regenerate all diagram URLs to ensure consistency
5. **Cross-Platform Testing**: Verify rendering in GitHub, IDEs, and documentation tools

### 🛠️ Technical Workflow

#### Step-by-Step Diagram Update Process
1. **Edit Source File**: Modify the appropriate `.puml` file
2. **Local Testing**: Use PlantUML local tool/online editor to verify syntax
3. **Generate URL**: Create new PlantUML URL with updated code
4. **Update README**: Replace the specific diagram URL
5. **Commit Changes**: Save both `.puml` source and README updates
6. **Verify Rendering**: Check that images display correctly after commit

#### URL Generation
- Use PlantUML online editor: https://www.plantuml.com/plantuml/uml/
- Copy your `.puml` code and generate PNG/SVG URL
- For PNG: `https://www.plantuml.com/plantuml/png/[encoded_code]`
- For SVG: `https://www.plantuml.com/plantuml/svg/[encoded_code]`

### 🎯 Best Practices

#### Consistency Guidelines
- **Use Shared Styles**: Always reference `c4-styles.puml` via URL in all diagrams
- **Naming Convention**: Follow existing naming patterns for components/relationships
- **Version Control**: Update version number in `c4-styles.puml` when making major changes
- **Documentation**: Keep README descriptions in sync with diagram content

#### Quality Assurance
- **Syntax Validation**: Test PlantUML syntax before updating URLs
- **Visual Review**: Ensure diagrams are readable and well-organized
- **Link Testing**: Verify all diagram URLs render correctly
- **Cross-Reference**: Check that component descriptions match across diagrams

### 📁 File Dependencies

```
c4-styles.puml ← Referenced by all diagrams via GitHub raw URL
├── context.puml → README.md (diagram URL)
├── containers.puml → README.md (diagram URL)
├── components.puml → README.md (diagram URL)
└── database-schema.puml → README.md (diagram URL)
```

**Style Reference URL:** `https://raw.githubusercontent.com/tx3-lang/tx3-ecommerce-template/refs/heads/docs/diagrams/docs/architecture/c4-styles.puml`

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