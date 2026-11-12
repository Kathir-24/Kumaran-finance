# Kumaran Chits — Root Workspace Scripts

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Directory**: `scripts/`  
> **Scope**: Monorepo-wide code generators and live container penetration probes

---

## 1. Overview

This directory contains workspace-level developer tooling and standalone live container integration probes.

| Script / Directory | Category | Description | Execution Command |
|---|---|---|---|
| [`generate-dart-api.ts`](generate-dart-api.ts) | **Code Generator** | Parses [`docs/03-architecture/openapi-spec.json`](../docs/03-architecture/openapi-spec.json) and generates 149 strongly-typed Dart model classes in [`apps/mobile/lib/core/api/models/api_models.dart`](../apps/mobile/lib/core/api/models/api_models.dart). | `pnpm codegen:dart`<br>`pnpm codegen:all` |
| [`probes/`](probes/) | **Container Probes** | Suite of 9 standalone PowerShell live penetration, chaos, and row-locking concurrency probes against a running local Docker environment. | `powershell -File scripts/probes/<script>.ps1` |

---

## 2. Live Container Penetration Probes (`scripts/probes/`)

These probes query a live running server (`http://localhost:3000/api/v1`) and verify database row-level locking directly via `docker exec -i chitflow-db psql`:

1. [`verify-auth-session-lifecycle.ps1`](probes/verify-auth-session-lifecycle.ps1): Multi-tab session invalidation, token refresh rotation, and logout.
2. [`verify-branch-kyc-idor.ps1`](probes/verify-branch-kyc-idor.ps1): Anti-BOLA / IDOR cross-tenant inspection attacks.
3. [`verify-chaos-network-disconnect.ps1`](probes/verify-chaos-network-disconnect.ps1): Redis and network partition chaos simulation.
4. [`verify-extended-concurrency.ps1`](probes/verify-extended-concurrency.ps1): High-volume concurrent payment attempts against single dues.
5. [`verify-financial-boundary-fuzz.ps1`](probes/verify-financial-boundary-fuzz.ps1): Boundary checks on whole rupee math, auction discounts, and dividends.
6. [`verify-otp-cooldown-lockout.ps1`](probes/verify-otp-cooldown-lockout.ps1): 60s OTP cooldown, 3-attempt lockout, and anti-replay defense.
7. [`verify-postgres-row-locking.ps1`](probes/verify-postgres-row-locking.ps1): `SELECT ... FOR UPDATE` serialization under concurrent requests.
8. [`verify-reconciliation-atomicity.ps1`](probes/verify-reconciliation-atomicity.ps1): Daily payment reconciliation atomicity.
9. [`verify-state-matrix-sweep.ps1`](probes/verify-state-matrix-sweep.ps1): Comprehensive state machine lifecycle transitions.
