# Scentxury OMNI-PWA — Backend API

> TypeScript/Express.js backend powering a premium fragrance e-commerce PWA for **Chi Fragrance**, Nigeria's leading cosmetic vendor.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ (Alpine) |
| Language | TypeScript 5.9+ (strict) |
| Framework | Express.js 5.x |
| Database | MongoDB 7.0 (Mongoose 9.x) |
| Cache / Sessions | Redis 7.x (ioredis) |
| Job Queues | BullMQ 5.x |
| Real-time | Socket.io 4.x |
| Auth | Passport.js — Google OAuth 2.0 + Apple Sign-In + JWT |
| Validation | Zod |
| Payments | Paystack (NGN) + Stripe (USD) |
| Storage | Cloudinary |
| Delivery | Mapbox (ETA & routing) |
| Notifications | OneSignal |
| Monitoring | Sentry |
| Testing | Vitest |

---

## Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local dev without Docker)
- Git

---

## Quick Start

### 1. Clone & configure

```bash
git clone <repository-url>
cd scentxury_backend

# Create your env file from the template
cp env.template .env
# Fill in all required values in .env
```

### 2. Start with Docker (recommended)

```bash
# API + MongoDB + Redis
npm run docker:dev

# Add Mongo Express (:8082) and Redis Commander (:8081)
npm run docker:dev:tools
```

### 3. Verify

```bash
curl http://localhost:5000/health
```

---

## Project Structure

```
src/
├── config/              # DB, Redis, Cloudinary, Passport, Stripe
├── controllers/         # Route handlers (thin — delegate to services)
├── middleware/          # Auth, admin RBAC, Zod validation, rate limiting, errors
├── models/              # Mongoose schemas: User, Product, Order, Survey, Referral, Settings
├── queues/              # BullMQ queues & workers (payment, notification, receipt)
├── routes/              # Express routers
├── services/            # All business logic
│   ├── auth.service.ts
│   ├── product.service.ts
│   ├── order.service.ts
│   ├── cart.service.ts
│   ├── payment.service.ts
│   ├── delivery.service.ts
│   ├── inventory.service.ts
│   ├── recommendation.service.ts
│   ├── chatbot.service.ts       # "Angelina" AI assistant
│   ├── coupon.service.ts
│   ├── wishlist.service.ts
│   ├── analytics.service.ts
│   ├── notification.service.ts
│   ├── receipt.service.ts
│   ├── export.service.ts        # Google Sheets sync
│   ├── socket.service.ts
│   └── admin.service.ts
├── types/               # TypeScript interfaces & Express extensions
├── utils/               # Response helpers, logger, currency, QR code
├── validators/          # Zod schemas for all request types
└── index.ts             # App entry point
```

---

## API Reference

All endpoints are prefixed `/api/v1` unless noted.

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Full system health (DB + Redis) |
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe |

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register with email/password |
| POST | `/api/v1/auth/login` | Login, returns JWT pair |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Invalidate refresh token |
| GET | `/api/v1/auth/google` | Google OAuth 2.0 |
| GET | `/api/v1/auth/apple` | Apple Sign-In |

### Products

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/products` | List products (paginated, filterable) |
| GET | `/api/v1/products/:id` | Get product detail |
| POST | `/api/v1/products` | Create product (admin) |
| PATCH | `/api/v1/products/:id` | Update product (admin) |
| DELETE | `/api/v1/products/:id` | Delete product (admin) |

Query params: `?page=1&limit=20&category=male&sort=-createdAt&search=oud`

### Orders

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/orders` | Place order |
| GET | `/api/v1/orders` | List user orders |
| GET | `/api/v1/orders/:id` | Order detail |
| PATCH | `/api/v1/orders/:id/status` | Update status (admin) |
| POST | `/api/v1/orders/:id/cancel` | Cancel order |

### Cart

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/cart` | Get cart |
| POST | `/api/v1/cart/items` | Add item |
| PATCH | `/api/v1/cart/items/:itemId` | Update quantity |
| DELETE | `/api/v1/cart/items/:itemId` | Remove item |
| DELETE | `/api/v1/cart` | Clear cart |

### Payments

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/payments/paystack/initialize` | Init Paystack payment (NGN) |
| POST | `/api/v1/payments/paystack/verify` | Verify Paystack payment |
| POST | `/api/v1/payments/paystack/webhook` | Paystack webhook |
| POST | `/api/v1/payments/stripe/initialize` | Init Stripe payment intent (USD) |
| POST | `/api/v1/payments/stripe/webhook` | Stripe webhook |

### Surveys & Recommendations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/surveys` | Submit scent preference survey |
| GET | `/api/v1/surveys/:id` | Get survey result |
| GET | `/api/v1/recommendations` | Get AI recommendations |

### Wishlist & Coupons

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/wishlist` | Get wishlist |
| POST | `/api/v1/wishlist/:productId` | Add to wishlist |
| DELETE | `/api/v1/wishlist/:productId` | Remove from wishlist |
| POST | `/api/v1/coupons/validate` | Validate coupon code |

### Chatbot ("Angelina")

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/chatbot/message` | Send message to Angelina |
| GET | `/api/v1/chatbot/history` | Chat history |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/dashboard` | BI dashboard stats |
| GET | `/api/v1/admin/orders` | All orders |
| GET | `/api/v1/admin/users` | All users |
| POST | `/api/v1/admin/export` | Export to Google Sheets |

---

## Docker Services

| Service | Port | Container |
|---------|------|-----------|
| API | 5000 | `scentxury_api` |
| MongoDB | 27017 | `scentxury_mongo` |
| Redis | 6379 | `scentxury_redis` |
| Mongo Express | 8082 | `scentxury_mongo_ui` (dev-tools) |
| Redis Commander | 8081 | `scentxury_redis_ui` (dev-tools) |

---

## Scripts

```bash
# Development
npm run dev               # Hot-reload dev server
npm run docker:dev        # Docker dev environment
npm run docker:dev:tools  # Docker + DB/Redis UIs

# Quality
npm run typecheck         # TypeScript type check
npm run lint              # ESLint
npm run lint:fix          # ESLint with auto-fix

# Testing
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report

# Build & Production
npm run build             # Compile TypeScript
npm run start:prod        # Production start

# Docker management
npm run docker:down       # Stop containers
npm run docker:clean      # Remove containers + volumes
npm run docker:logs       # Stream API logs
npm run docker:shell      # Shell into API container

# Database
npm run db:seed           # Seed sample data
npm run db:migrate        # Run migrations
```

---

## Environment Variables

Copy `env.template` to `.env` and fill in all values. Key groups:

| Group | Variables |
|-------|-----------|
| App | `NODE_ENV`, `PORT`, `CORS_ORIGINS` |
| MongoDB | `MONGO_URI` |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| JWT | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` |
| Paystack | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| Apple Sign-In | `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Mapbox | `MAPBOX_ACCESS_TOKEN` |
| OneSignal | `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` |
| Sentry | `SENTRY_DSN` |
| Google Sheets | `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID` |

---

## Security

- All inputs validated with Zod schemas
- Rate limiting on all public endpoints
- JWT access + refresh token rotation
- Passwords hashed with bcryptjs (cost factor 12)
- Webhook signatures verified (Paystack HMAC-SHA512, Stripe)
- Parameterized queries throughout (Mongoose)
- CORS explicit origin whitelist
- `httpOnly`, `secure`, `sameSite` cookies

---

## License

ISC © Chi Fragrance
