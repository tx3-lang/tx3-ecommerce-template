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

[![Context diagram](https://www.plantuml.com/plantuml/svg/hLNVRwD647xdhvZceUMaEhIwF9rKwGZGIoGRa24NtHDQO0EhBBjeVzXng_xldJMExPvzlLgD7-nbTdvyytqpvgCsH1axSEyd-Et_Vp1BT0EH58Q-68WPwHGPu4agI1ev35Gr51vxPYWdDUMGSsBmSdYpudEwmhI_Ve1YemqTzaXcKFHohS7q5FHqHJGGg3bfdg6MBs-4mFk1YORRba9lpAW_184Yw-kEcTxMLcFx3eymrqX6C78Y7FCpRLhEwY2wcUNEzB2O1mD1Z0fDrQw3wn4zBybkNjxFC5ktFT1NycVOETOr52im4RIoqG5HZLEaCLRHeBb1E1jEzLGGQIcPuTGpxlj4sDbtPCNmd2ejXVQYXwBC5idIRwms4aD-XgjeTxnwvuNnuZxrIJimWHUX-sNQA68atcAUdQ0QVAkPw43tHD4MMlg4ZePX1NXISe1_ud_d9L6smAfHukyvgAO1m3B_2XxB5WzvU1iMYQ_jI6gYZqABdGMzed0PXsdcDqIrHCY3JpGP8ALcBTKpkZw6ytbI5lwQS4xDmVDn-movaYlM8c7e-jc1dlih1uyVF3zldoTAbeXusthFnek9UIYIehehoxmuKkGCHxSAzuR2Zp1Qd1E2nr79rZR6WLo4QVWfALvrEwLfGGJf3Y6OHgfTWpWEIuGGXsLuHfjlCmuHPrGOp90lioWfYYeFlooIj3oJvPkIHFVvxFqlJhmiJPEeh2PbpgJuMgfzP9pay-nB4bTPUYRiQztk91vQaEBApLsBdFnkHRFLnqr_X8rCN4nSdYQ8wSZb1WaSf61kAvoDwBwMsDBnYa0jhMY9sa2df1tTJE0uGqsDeGfMJ5l2KOME2FR7TdoyAQwwtSNvJ3mfeesosx-4wZMVQvvBsyBzyJrk0Fpf0VotNG7utbp_vPtWgRbidd7sc3Z6Shkt0kxnb6Y7vOAD1BXW9n6RUyLqLBHUSPSzLlFaKvB6FhB_4MsuLty3 "Context diagram")](./context.puml)

### 2. Container Diagram (`containers.puml`)
**Purpose:** Shows the high-level technology building blocks and how they interact.

**Key Containers:**
- **Web Application** - TanStack Start/React frontend
- **Cart Service** - Local-first cart management
- **Payment Service** - Cardano CIP-30 integration
- **Database** - Supabase PostgreSQL

**Use Case:** Technical architecture discussions, development team onboarding.

[![Container diagram](https://www.plantuml.com/plantuml/svg/hLHHRwCu47xdL_Zoibbfqvnk-xJIIKi9jwsKf6n8DhedPCmKh1eRsKFJw7J__SP04vJsLZfTUG3FsFFDD_CD_kgGMsnh5NnWl___Xr2YQnOPZLngi6mXUMbvpHwCPR4mTGrM0DjN4a7n71HB54VQhDyj_HAU2FQtBs-GcB6qCWV7i09MoRAQgUuiWgYqKQOyihoLgf2wPBaouj6z4wdW5wc5QWlAYjYuB_EvvOUhKcBLvgq3AuWfQBoY_imRnRMNO-QmK3AVHzUpnBjsg-MyvWx1aYixrNRLqDd_We_FdsU4LtOBU55aXb1JPWJA8VMyCCBDkHLU9e6jXRcu9a971QvFI8tPIbGGe7-_sUgVgqq02LXdj0kYNRgzNyMRgMWT6Whvn2RHi9ny3CB5wcuzvKKjDMs4_YiTMex6xn9EUdJ4djsOLXVS7eFUpbxiwQd8B1zSXFDJTfEFxA-0qTEzFfpBSvtZZytzUXkl5zC3v1bl6eBRGyx2fb5IS9H6JyYreWZcY2KyM8fdKYFO1owW-nTUQdLKWyUCmiqsI-FDZxiedWfkCNDWdwG0tmmoMTgR7dbf15Up1saTCbUPfl43wsDOpJKleGQD0smI_hcArsVaXXzfTmoUz9unFkKhk3RzFo0gNySGnnfh13X72OS4Yt0RteHfF2quyfmx3xaObXuhzGrmFgve1RfFpDW2B7svBavDO3wO0F_sSiRF25PpDUZgWdINz2bSstIucUjsFFhWeLXgu29Stqz5JtuuCwfc3NWmzf6ExiFbCjwcqmDN2l1ySj_PBB7cINgI_NXjG7MQkaesBjYbSPhTRhT9EXhNynpi7FWmYZaFnuMQgquZrxbzXpR01NOZ1izu6Vk6Nhq2BpjkB5Xqbym-_tg9CL8cskmMp3HW-uecenQoI4dG0u6B2HmX_E1AaWb-iiNZcV_t5knn27v5-fKcQPlN4XbQhXqN9outfu7xDwHBoQXj6WGE_Wxar8HLk0w_nMb_TOoB62HWmxNOvyfkk7WSJV7hORirj2XO_tSdP9GMqk_BVagMK88kWlJsVfyjus_-TY3_L_ArjVe7 "Container diagram")](./containers.puml)

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

[![Component diagram](https://www.plantuml.com/plantuml/svg/hLLHZzeu47xFh_3jIrFfA2UrJvLEQWXP5XsGb8JTnyWais2jOqUsKvOxtN-_SU8q5D9ArNKVM6OyytdcypV39sseCat5lJVap___XoZX1nBAgfO2X25pHW-ALkHPAX8Ligf05K2UZim0ftlW9E7Ku67rowvVmHU4VVznf8W9IO_of8av0c72W1AKaw8FqqG-anSueqSOoWGe_OkAydvZek1D2UHeJAq_JgUAdjuTc3as-qQ3iXU2CE-mb6dDgR3FCT6cv6m_3JzC4klQhLVJYce32bsvwmrpQepz6Npp-dw2U8Vs2_GlCZ5GuSq6y0ucfgKiz9IgmZvJOHe5q-835dJceBiBaPYC6GwUiP-ZLF_ujH4WGOAbq5wuIxDu7Mtzej56Oihlv2vqN-_UUi5ylTpujAoOm8F0_cVQA6gaFRLwwv-Bp6GZIghEhTgUO4-2kkQie8P9uNqDo_im_mJxdDPrldSEnB_AkdjB_l48_hKVRuP6TUj8jl5y5sPv66J1AbxujP9bKvWSaocN1yHBEWy9EyyTkjPKq0Deue99oJHIVoPKb4I3PHtxikZfGvmaoyq2uRUPhu-ohfau8BWo29CwcuHeMzm71E28Qy-9h46r7UWM5osDh84em8673r7uLxpByljL_EGNHoXUP6FoPovFbdzdatkqsw8RRjW44MfIqtE53DZw2z3QuSNRURJDry4cM4JhQ9FvKfN8TTKsQ-CH9BOkilxgii2PeiLBLsJbY6apUzpPDjZCyp3Ut2yN_bvXN8voVcQMt9arITYQJTUkXRpGMoSfzdTxHlGP6wWSC98w3pPnljnaqM8RPCjuuoDr9HKojylXq05QCZelMVPUTmtb78pT5W8AwxHDzEpOyl-rwfnJG_TKmo1JRuvgcGLfv9Vk3C7wC0kSehIH1eGdT90YiT6TugDNjxlIjY7jfRkaGzHDtSBaNQiMp7amqtNSTpd4z0rkm9oaUi7Gfs2rYhBKFxKzkiYXPrJr5-OU2UlP0k-qTcIrzdPfbEOFMPQa5nDzEnapXQiO-WD46a-ybdsd7cAjxwNSY1c7beF1kneShewBqSGHoJuoE0s2z2usm5NNQDsE_yK3Vsv0dOTkltqPctpLw4Ng8-KCJI1OP_5YKxT02qDQI9TzrVCrQmimtLvWLYy3X1Kbl9fnaF5fIBgnxuLkiS9bCdd_XmEv9V6YbN2xcpiwRocu6kzRoTZ5VBQ_tXMsrbwSfkIHAaRt7FG8o2qHFmzn8wSVGunEw8XMHiczcSoqsLVC48C5QLgq2FR66KSXe9IPmEk-YtOzl66tgPnVV_DotU9EtU_iy6J3m5cb2AUKV8PBsn-2RjVEWyGl9UasPOB6GK7wUTMniu83YDB3txUdV1KjeitSH_ydz3KL_my0 "Component diagram")](./components.puml)

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