# 🌸 Scentxury OMNI-PWA Backend

> Premium Fragrance E-commerce Platform for Chi Fragrance - Nigeria's Leading Cosmetic Vendor

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Git

### 1. Clone and Setup
```bash
# Clone the repository
git clone <repository-url>
cd scentxury_backend

# Copy environment file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

### 2. Start with Docker (Recommended)
```bash
# Start all services (API, MongoDB, Redis)
npm run docker:dev

# With development tools (Redis Commander, Mongo Express)
npm run docker:dev:tools
```

### 3. Verify Installation
```bash
# Check health endpoint
curl http://localhost:5000/health
```

## 📁 Project Structure

```
scentxury_backend/
├── src/
│   ├── config/          # Database, Redis, external services config
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Auth, validation, error handling
│   ├── models/          # Mongoose schemas
│   ├── routes/          # API route definitions
│   ├── services/        # Business logic
│   ├── types/           # TypeScript interfaces
│   ├── utils/           # Helper functions
│   ├── validators/      # Zod schemas
│   └── index.ts         # Application entry point
├── docker-compose.yml   # Container orchestration
├── Dockerfile           # API container build
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies & scripts
```

## 🔧 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to JavaScript |
| `npm run start` | Start production server |
| `npm run docker:dev` | Start Docker containers |
| `npm run docker:dev:tools` | Start with MongoDB/Redis UI tools |
| `npm run docker:down` | Stop all containers |
| `npm run docker:clean` | Remove containers and volumes |
| `npm run docker:logs` | View API logs |

## 🌐 API Endpoints

### Health Checks
- `GET /health` - Full system health status
- `GET /health/live` - Liveness probe (Kubernetes)
- `GET /health/ready` - Readiness probe (Kubernetes)

### API v1 (Coming Soon)
- `POST /api/v1/auth/*` - Authentication
- `GET /api/v1/products/*` - Product catalog
- `POST /api/v1/orders/*` - Order management
- `GET /api/v1/admin/*` - Admin dashboard

## 🐳 Docker Services

| Service | Port | Description |
|---------|------|-------------|
| API | 5000 | Node.js/Express backend |
| MongoDB | 27017 | Database |
| Redis | 6379 | Cache & queues |
| Mongo Express | 8082 | MongoDB UI (dev-tools profile) |
| Redis Commander | 8081 | Redis UI (dev-tools profile) |

## 📅 Development Roadmap

- [x] **Day 1**: Infrastructure & Docker
- [ ] **Day 2**: Multi-Variant Database Schema
- [ ] **Day 3**: Recommendation Survey & Logic
- [ ] **Day 4**: AI Bot Integration ("Angelina")
- [ ] **Day 5**: 3D Story Canvas & Image Export
- [ ] **Day 6**: Payments & Logistics Locking
- [ ] **Day 7**: Testing & PWA Deployment

## 📝 License

ISC © Chi Fragrance
