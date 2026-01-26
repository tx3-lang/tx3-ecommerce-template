# C4 Architecture Diagrams - Ecommerce Whitelabel Platform

This directory contains the C4 model architecture diagrams for the whitelabel ecommerce platform built with Cardano blockchain payments.

> **Note:** PlantUML diagrams are embedded directly in this README file using markdown code blocks. Most modern markdown viewers (including GitHub) can render these diagrams automatically. For local viewing, use a PlantUML renderer or IDE extension.

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
├── README.md              # This file - guide and overview with inline diagrams
└── c4-styles.puml         # Shared styles and definitions (referenced via GitHub URL)
```

**Diagram Rendering:** All diagrams are embedded directly in this README file for easier maintenance and viewing. Styles are centrally managed in `c4-styles.puml` and referenced via GitHub raw URL to avoid duplication and ensure consistency across all diagrams.

## 🎨 Diagram Descriptions

### 1. Context Diagram
**Purpose:** Shows the system as a black box and its interactions with external entities.

**Key Elements:**
- **Customer** - End users who purchase products
- **Administrator** - Staff managing products/orders via Supabase
- **Ecommerce Whitelabel** - The main system
- **Supabase** - Database and backend services
- **Cardano Network** - Blockchain payment processing
- **Wallet Providers** - Eternl, Lace wallet integration

**Use Case:** High-level stakeholder presentations, system overview documentation.

[![Context diagram](https://www.plantuml.com/plantuml/png/hLDTQzim57tthz3wCW_cUgDzAWogAQ8jn1z43c5FHhRLM5IsWdJTfFz-rt6QbZNR66i8ZdNlFKVdd4kkFKW7GsU2Z-JR_t-GXLqIPdjGEo0pBTTETkJUEi9hstNArOgiMWtAo4ePaXi9sEpUxVAvUaJQhrT4F7bGtL59H4Hhjvv0guYVMj8JIIeZwmTIsTqxAGW-wBusGwD82x3nLt7ivFPyhQ4Tgi6Z_L5F3-SOHhmniX-JZpmqHbSnkupoiRHCvd4dKQF3KdbmSBx1oNzXXzr5X6ph_Ojw3Zz2vtWlgDYfUn-tIZO-RcoDZsbNXrDzYLyKzcIKdwx6W0eDHWKmFj-iEFhBWX6UA-TjxmEs54MMy4LO3nuiGZwJCtPuFViKq5bobuQowNIF3Jh-QWzEWiKkyXnMwmFEiWHf60-FziffjuWxfGRXOfdJxrJmq0yRMKd_2Y4E5PnYT36ZQHRMqZMojoypR2gGLC7MkWSSNT7vd1SYt4fZ5BnChlPdaZlxg1iqFabVe13G64AhDpvO2YxAswB8nQieJdXPUZNY4vhI6owUetdh896zNEz7CU05SizeGK-4yqVl-I9ZN8WofpyIdXOduBzDXTtbqSMNCRyiJJahoYcS4nI_fdL4xl_2QzKtWRZDLkMSt_1q5e8R5FQkiJvqvYS0 "Context diagram")](./context.puml)

### 2. Container Diagram
**Purpose:** Shows the high-level technology building blocks and how they interact.

**Key Containers:**
- **Web Application** - TanStack Start/React frontend
- **Cart Service** - Local-first cart management
- **Payment Service** - Cardano CIP-30 integration
- **Database** - Supabase PostgreSQL

**Use Case:** Technical architecture discussions, development team onboarding.

[![Container diagram](https://www.plantuml.com/plantuml/png/hLHHRzis47xNh-3yKXUeus7DKu41LMIj2M0xgcNNs9D0KHU924KAv2cECUo_xoWfjk1a1OR5C2JUaVVTtVUT-DKXjzZMAlZ0Vl__FqA9hbbaD7AfmRA5vANbDNimbiN2r3LO0MnVIGJ5Sr0iKHnfitwtz4ju8jZVlhnHn8obbJauXXMmIfRLJ7Ld4KIbZJBbaUMjL8NK9SkL4O_kdOeAVf5QgBQWh8YD-pAVMtwuAYLMRTuwi88g1OrNnC-yKLnxEMOE2oNpUNGzIxnhjrhEQ-uGBBcoKszN3PtzB_Zu_7b6U6MtW1T5PWWrPKQOMtXmymfuuUQ54VJekHiiSKr_AksemFMfYQAjH0K1-kURfFzSTm98m3gZNH3jqktzAjvCHUlGKCWdDec6vUHZ42vMT-ifBsgfQIFqR-dGSZIqwt7IewC-s8rfTS7jCUZjxCMUdjhDyi55E3-jRlAH_HKm-dMF3-VsNEVuOtE_tiRhnVG0USQRXk3saBEmQPGK7ANH4tAjA89H5qIjfNWcDO9zu0Awh-AbLqSzUCmet6opDDxyk8lYgU0MCmVsIGhmP939qjxqo4iZk9ezIEkGkSeqZHzT7yDghda9DMWSO9FmprMyFYCt_4YxO_2azupnAL_1jUc_1b7vFeOurbWZm3bAE2HOXDlm9apZQS6HvznvoCMmz5Yf9y3vkA8Lw3unOmkmzEQwE970V301_ktbZ9yHhEPgqDK5wIxfKxYswN0pr-ruzC53iKJW8bpVJqLV_71crCqQy63i8ntTXyjbl4sd1wuKuFdalhDPOisJz4NsuxK1rMdgAjcuO9V6QNQxtIRfQ5pFSx1puCCevZmS5sgkEerSv_OCRO0Bx4OCdl4ozWszUWLUTjnOiEWkcNt-zH9Zf4oqsIsOQS3s7Kr65B98ISBhWoycS8JmWoj99Z27D1pd-h-tO8z3yAkYNscIjdajaQ7bsd5ngkNcD73_XdGf6T6cGU3Wxq1E9Ap2TVWjJeUhOzn4Bm4RBiW-LtR3nUDeYbyFswsXHS7whpiXexIGVb_sKxA44dGHfBVt-smPV_Et0_c_ag-jrJy0 "Container diagram")](./containers.puml)

### 3. Component Diagram
**Purpose:** Shows the internal components of the Web Application container.

**Key Components:**
- **Product Catalog** - Product management and display
- **Shopping Cart** - Cart operations and persistence
- **Checkout Flow** - Multi-step payment process
- **Order Management** - Order tracking and management
- **Brand Configuration** - Whitelabel customization
- **Cardano Integration** - Wallet connection and payments

**Use Case:** Detailed technical documentation, component-level development planning.

[![Component diagram](https://www.plantuml.com/plantuml/png/hLNHZzgu4txFN-7VlZILVfIJTfygdTGGie0EI4h2xcDaabbYhHD7jbEMEzt_VkF4sL38gRgxeeeouvdFCv-_cVsYD9MwARdpWVpwtp-8uZyGNvIrgA3IPCxeKTAIl0X9WaoK9SWCo7F1D71w04uYJZKUbZ_j-ZLyGzZxpoD5J4XSY9CYkW32AWsoefnaVPWYueMymXazbQQi0gb-Kb7E_rYLyIO7KcXTgy_JgQIdJqUcY-RGA93cGYpW4vOohJcjp7DCbCuvEqpzXqbaNFlDUbfIXKMZAttlxLEDiVy4Nx_TJn3lsFw0_aKc6agyMSDKmekQ5a1pDSr5XbyTTzRA7l0VbdRceBghaQA4QGwEDjzZfF_WtH4WGgf5fHn_7oVX9jYvMQEqm9J_aplV_hpxw7ZppMhhqhna5Hvuvd-cjAHQc5EZlFxXo4mqLKxbkTNTCno8LzUSPLGpKJdlOMaVvfxWaDAwJW_MWVXNMNSVoHyEmK_xzM5eLBMEQ1VEztwI-bxYhSE5MqkHDvbECPboSKIygFCGl_FSeMj3Ate4HMmmoPd2HpWJMkL40PLPWNqPz7WPHj5gkq3uNUAgGjGrguu8BZN2nDOcFje6Tua0777DEH4roBO3rUAYfP0rg3AmuFuoy7yBzqdwk0wVtQo0x5KqEdtXucJujpPvHBijkk6QJH2X9ZKzbyY0gJy3fInUk9i7ktJZRRr5i0csYIjaZboNRRCc7a52uoARTvS1JYJDNhiYIqjCczdZpdRUTfxwuVPnjN0F4kDI5FOBC-JEZ4dyrcowTWtaXTuwIR7VspEYpjX0QO6HrBct3TFLDWaMEozPXLiNgSjf9LAp9euTe26Zyv9LxxNNKCv1cxrHGMQSfecU7LF-dqQTSwhfWIeOPEhCKIqpBmxSt9uXM1zcW6EKDYY2y8GEKYGckbDyy6QtMDmsf9nu7tM8ggbRcBHhrO1P3sRQZlik-vYXmIteav2l6FhihTT14hkdjaSREVICglx6x2DXFJlWdTOALYjd7mTnkaoIABwOwDl9c4bSoj0V8D9uuhNiE_KGO_rToesOSMYnQhohmU7gk1XD797i4uFJ84ZdOWDSTOtMxVXVFF3N1kHvwFRxbp79LurUf3vHpj04WdLchoPr1pJJf8MqsLSzNxEs0Dtj1MRqCa0OKSAR7WSPduQe6_jUw0RBNqMJ-ryio0s9bwtuk_tSqdbBmTLutqh6BEOpqGMKs5fxSHoJ9oePFN1Geo3NHFmBY2jMVWnnEw4ZMXabzsOou-PGCaqq5gHerYAO6sSSXO1IPfMjU1JjUdZzRbDPl_hkvRh57Tk_iyEJ3GDdb59PfQGpNDhk47IxTfO2V-IasvGH6aS9yTTrnyuQZb3bJhmCdzDri0YsSnVzNz3NbFml "Component diagram")](./components.puml)

### 4. Database Schema
**Purpose:** Entity Relationship diagram showing the complete database structure.

**Key Tables:**
- **products** - Product catalog with pricing in lovelace
- **product_images** - Multiple images per product
- **orders** - Order management with Cardano wallet integration
- **order_items** - Line items with price snapshots
- **order_status** - Enum for order lifecycle

**Use Case:** Database documentation, data modeling, query optimization.

[![ER diagram](https://www.plantuml.com/plantuml/png/pLVDRjl64x_hAGR-7-puNnbI73UkaHYHzO4QSHsdSjeU2X1ZxaXQUBdBxWvjAqM1lac07dheO_K9-WZbBhcIJ4YfWkPG0vR8cTzlE1ypg-4hnsYvo5Hh5rx--x_Iob2pv3byImfP6krcCeU1nAd532R6mZ0rMKOs9VX-9hb4tP22gn9SAhFFviK06M_G4OpJ6MK8RHWNUIMvCewdbiPlB-0pFQuqSorPKOlzvvfdVpHcJ-yNZaq6VQECTJvDIoD3HHbfTYrtAtMEFesfGkVWvnO0m1ccjrDh2Yq2-SMBQxnHT7eA_niUZfwE1kj1Grra7ZCw71wDZjPZlfDq7-mSZuw6nnN6M46s-Q3kLy-_73nj0fOFUNxM7VNMwEC33e-FXuVze1yPpKtpdS6pvxrkKnsDF-jrdnqtoGlJtREZuTDEwnUVOy-0wtbEhIf_mPN4CNBX81giibhUKdbBDhJmwMcGvQI5rDFg6kU-ACa4fI9HYsHzOKrApaMe7u2yngGconLnl4ETalByuDytA3M4g5tbeRSaYfGTn6n4z_RtfTZVFu6Ya0Bshbu_gQKQC_9ofWU6opVNSFdkugBM2NAfbRaFA49gJMvbIeaoTwGm3VmREPMQcnOSc_JMgqiTJSd2O3ZglRkuXavqoYMOihohR1YZ2FK2nBQW9Mv2o8KbiGuvGUKYDBM4J2913axBZ1nZblFx1LgR-xqOVv6BJq0BKhGM7VJjTlZw__dbOFX36RDuI68zwYWtwsDqlh2FIfd83AUqVK4ZRLKxMcY3iQImQbFDKN7YvOs22-boXVCaJC3cWcwV_KMOmUBsuTsZKiG92c79kKrHi65KM_KdSk6jF1xjY5hul5jFycwC4gr0RH9-I6RePeranL4dQurjwAHBV59CmV_KnvROpfFK59e_cd3KINKiR1YX_-HSL5LFgcfkqbRLQBHA8fcoxVibS9h3iDMe_5HWs4jManyROzjZyDE7OlVH6kHQYmDzfxjJ9X9sEWS7-plDm-44TcReVjHx_TwutniCd-ni8Yvp65YOvuJMWTIFo06rf7RNKLEZ6QL-_DJ8F3WuNHsfG2WSkHqVuQLXSe1QGDzennQbNrPqAGKsEPW9HETRFdjNCH9VyJBBfV3FNt-3Avzy1uwD9G5IGwm3x7MXD-Z1I-X-qUbq_Fz2zwGcZys4eUfQk9SyWsK7B-jJOtlXw8Q9L4ps11O_MV0oZ1VqBWUhzFDnA7qa5spQos4g6N8w9TiYBS17t5gDkqfP5VKRVzcCkL-TEr3DJTjlUmBSt35bDU9CcVGsdQ7Km1QrywwQS9tUIZs5EudGEBrYFgjJ2-hZ2MQeXVAKa9-LqoZwKkqY6EoZKkQU1DpCGT042yND26yCiybYa7KVBIE5St-_hiJWDEPkPXYG8Izi6PoZuEK2HOxi7JcOISUcvA02FvgbypNaGkhRnKyDcqL_DPrKDE7eOcpT5H_7GH3MmcL9wWMjue2I4qhdgOhEZQp9uXu8RE8-9usk0L_xD9EB-o7u_R2mjEhQBbpGjBnjgV0LKsdbTCR1k-RhGmKFBWPzV24u2QA_FdpulTuQeLtwRma4CbQQFq9qNZ6I3oJW3bL1BXfwJVFQoDLhQFlwP6ZdK8fBqSYBHiQId6elYgHpBUY1F2yMZAn_Y_7z0oPdcSdtk9AHjmMLDZ5DIP6j53vgLUMWzQhyB3BrDm00 "ER diagram")](./database-schema.puml)

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
1. Update component diagram section in this README with new component definitions
2. Add relationships to existing components
3. Update `c4-styles.puml` if new shared styles are needed

### Technology Changes
1. Update container/component descriptions in respective diagram sections
2. Modify technology labels in relationships within the inline diagrams
3. Update the Technology Stack section below if changes are significant

### Brand Customization
1. Modify colors in `c4-styles.puml` (changes apply to all diagrams automatically)
2. Update legend and title configurations directly in the PlantUML code blocks
3. Test rendering across different platforms (GitHub, IDEs, markdown viewers)

### Diagram Updates
- All diagrams are embedded in this README file but reference shared styles
- Edit's the corresponding ```plantuml code block to make changes
- Shared styles in `c4-styles.puml` are loaded via GitHub raw URL
- Use PlantUML syntax and C4-PlantUML library functions for consistency

### Style Management
- `c4-styles.puml` contains centralized styling for all diagrams
- Changes to styles propagate automatically to all diagrams
- Referenced via: `https://raw.githubusercontent.com/tx3-lang/tx3-ecommerce-template/refs/heads/docs/diagrams/docs/c4/c4-styles.puml`

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