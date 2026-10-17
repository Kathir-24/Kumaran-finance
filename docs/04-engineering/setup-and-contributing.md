# Kumaran Chits — Developer Setup & Contributing Guide

> **Product**: **Kumaran Chits** (Kumaran Finance)

## 1. Prerequisites
- **Node.js**: v20 LTS or v22 LTS (Active LTS recommended for NestJS 12).
- **Docker & Docker Compose**: For local PostgreSQL 17 database.
- **Git**: Version control.
- **Flutter SDK**: v3.24+ (for Android mobile app development).
- **Editor**: VS Code / Antigravity with Prisma and Flutter extensions.

---

## 2. Repository Layout

```text
Kumaran-finance/
├── apps/
│   ├── api/                 # NestJS 12 Backend (Modular Monolith)
│   ├── mobile/              # Flutter Android-first application (To be initialized)
│   └── web/                 # React / Next.js Admin Dashboard (To be initialized)
├── infra/
│   └── docker/              # Docker Compose (PostgreSQL 17)
├── docs/                    # Complete Project Documentation Suite
├── .gitignore
├── LICENSE
└── README.md
```

---

## 3. Local Development Quickstart

### Step 1: Start PostgreSQL Database
```powershell
# Navigate to docker infra folder
cd infra\docker

# Copy environment variables template if not present
Copy-Item .env.example .env

# Start the PostgreSQL 17 container
docker compose up -d

# Verify container is running
docker compose ps
```
The database will be available at:
- **Host**: `127.0.0.1`
- **Port**: `5433` (mapped from container 5432)
- **Database**: `chitflow_dev`
- **User**: `chitflow`
- **Password**: `chitflow_dev_only`

---

### Step 2: Configure & Run NestJS API
```powershell
cd apps\api

# Install dependencies (if not already installed)
npm install

# Run Oxlint type-aware linter
npm run lint

# Run unit tests
npm test

# Run in watch mode for development
npm run start:dev
```
The API starts on `http://localhost:3000`.  
Health check endpoint: `http://localhost:3000/health`.

---

## 4. Git Branching & Commit Conventions

- **Default Branch**: `main` (production-ready or stable milestone code).
- **Feature Branches**: `feat/<module-name>` (e.g., `feat/company-branch`, `feat/auth-rbac`).
- **Fix Branches**: `fix/<bug-description>`.
- **Commit Messages**: Follow Conventional Commits format:
  - `feat(api): add company and branch schema with migration`
  - `test(api): add financial invariant tests for chit auction dividend`
  - `docs(business): update financial rules with approved 5% commission`

---

## 5. Security Checklist Before Committing
1. **Never commit secrets**: Check `.env` files and API keys are in `.gitignore`.
2. **Never commit real customer data**: Only synthetic test fixtures.
3. **Run linter and tests**: Ensure `npm run lint` and `npm test` exit with 0 errors before pushing.
