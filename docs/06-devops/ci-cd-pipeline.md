# Kumaran Chits — CI/CD Pipeline Specification

> **Platform**: GitHub Actions  
> **Repository**: `https://github.com/Kumaran-finance/chitflow` (or `kumaran-chits`)  
> **Mandate**: No pull request may be merged into `main` without 100% automated test pass rate and zero linter warnings.

---

## 1. Continuous Integration (CI) Workflow

```mermaid
flowchart LR
    Push["Push / Pull Request to main"] --> Lint["1. Oxlint & Prettier\nCode Quality & Style"]
    Lint --> Validate["2. Prisma Schema Validate\nDB Schema Integrity"]
    Validate --> Test["3. Jest Automated Tests\nUnit & Financial Invariant Tests"]
    Test --> Build["4. Docker Build & Scan\nContainer Image Creation"]
    Build --> Deploy["5. CD Deployment\nLinux VPS / Cloud Production"]
```

### 1.1 GitHub Actions Workflow YAML (`.github/workflows/ci.yml`)

```yaml
name: Kumaran Chits CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  code-quality-and-tests:
    name: Lint, Test & Validate
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: chitflow_test
          POSTGRES_PASSWORD: chitflow_test_password
          POSTGRES_DB: chitflow_test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout Source Code
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 12

      - name: Setup Node.js 24 LTS
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'pnpm'

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Oxlint (Fast Linter)
        run: pnpm --filter api run lint

      - name: Validate Prisma Schema & Generate Client
        working-directory: apps/api
        env:
          DATABASE_URL: postgresql://chitflow_test:chitflow_test_password@localhost:5432/chitflow_test_db?schema=public
        run: |
          pnpm exec prisma validate
          pnpm exec prisma generate
          pnpm exec prisma migrate deploy
          pnpm exec prisma db seed

      - name: Run Monorepo Automated Tests (1,196 tests: 843 API + 353 Web)
        working-directory: apps/api
        env:
          DATABASE_URL: postgresql://chitflow_test:chitflow_test_password@localhost:5432/chitflow_test_db?schema=public
        run: pnpm test

      - name: Compile NestJS Application
        run: pnpm --filter api run build

  # Note: Staged for automated deployment to any standard Linux VPS via SSH (Hostinger, DigitalOcean, Hetzner, Linode, Vultr, etc.)
  deploy-to-vps:
    name: Deploy to Production Linux VPS
    needs: code-quality-and-tests
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Deploy to Linux VPS via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/kumaran-chits
            git pull origin main
            docker compose -f infra/docker/docker-compose.fullstack.yml up -d --build
```

---

## 2. Branch Protection Rules for `main`

The repository must enforce the following GitHub branch protections:
1. **Require status checks to pass before merging**:
   - `Lint, Test & Validate` job must be green (enforces 100% pass across all **1,196 automated tests: 843 API + 353 Web**, with zero oxlint/ESLint warnings).
2. **Require linear history**: Fast-forward merges or squashed commits only.
3. **No direct pushes**: All changes must arrive via reviewed pull requests.
