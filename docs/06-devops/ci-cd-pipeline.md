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
    Build --> Deploy["5. CD Deployment\nAWS Staging / Production"]
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
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
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

      - name: Run Unit & Financial Invariant Tests (278 tests)
        working-directory: apps/api
        env:
          DATABASE_URL: postgresql://chitflow_test:chitflow_test_password@localhost:5432/chitflow_test_db?schema=public
        run: pnpm test

      - name: Run End-to-End (E2E) Integration Tests (82 tests)
        working-directory: apps/api
        env:
          DATABASE_URL: postgresql://chitflow_test:chitflow_test_password@localhost:5432/chitflow_test_db?schema=public
          REDIS_HOST: localhost
          REDIS_PORT: 6379
        run: pnpm run test:e2e

      - name: Compile NestJS Application
        run: pnpm --filter api run build

  build-and-deploy:
    name: Build Docker Container & Deploy to AWS
    needs: code-quality-and-tests
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-south-1

      - name: Log in to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, Tag & Push Docker Image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: kumaran-chits-api
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG -t $ECR_REGISTRY/$ECR_REPOSITORY:latest -f apps/api/Dockerfile apps/api
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
```

---

## 2. Branch Protection Rules for `main`

The repository must enforce the following GitHub branch protections:
1. **Require status checks to pass before merging**:
   - `Lint, Test & Validate` job must be green (enforces 100% pass across all **360 tests: 278 Unit + 82 E2E**, with zero oxlint warnings).
2. **Require linear history**: Fast-forward merges or squashed commits only.
3. **No direct pushes**: All changes must arrive via reviewed pull requests.
