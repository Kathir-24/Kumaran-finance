# Web Portal Architecture — Foundation & Tooling

> **Module**: **Foundation, Design System & Client Infrastructure**  
> **Status**: **100% Complete & Verified**  
> **Target Audience**: Web Engineers, UI/UX Developers, Auditors  
> **Associated Tasks**: Task 1.1, Task 1.2, Task 1.3, Task 1.4

---

## 1. Overview & Objectives

The Foundation layer establishes the enterprise-grade foundation for the **Kumaran Chits** Web Portal (`apps/web`):
- Modern Next.js 15.2 (App Router) and React 19 architecture linked within the `pnpm` monorepo.
- High-density workstation design system using Tailwind CSS v4 and Radix UI accessible atoms.
- Bilingual localization framework via `next-intl` (Inter + Noto Sans Tamil typography).
- Zero-paise whole rupee financial formatting (`BigInt` math per Guardrail 2).
- Bank-grade TanStack Query v5 provider with mutex-locked refresh token rotation and Idempotency-Key injection.
- Client-side Zustand auth store and 20-minute inactivity guardian.

---

## 2. File & Component Catalog

```
apps/web/
├── src/
│   ├── app/
│   │   ├── globals.css                       # Tailwind v4 theme tokens, color scales & typography
│   │   ├── layout.tsx                        # RootLayout with fonts, QueryProvider & SessionInactivityGuard
│   │   ├── page.tsx                          # Smoke verification showcase page
│   │   └── providers.tsx                     # TanStack Query & NextIntl client wrappers
│   ├── components/
│   │   ├── security/
│   │   │   └── session-inactivity-guard.tsx  # 18m warning modal, 2m countdown, 20m auto-logout & auto-hydration
│   │   └── ui/
│   │       ├── alert.tsx                     # Alert banners with status variants
│   │       ├── badge.tsx                     # High-density status badges (paid, unpaid, overdue, pending)
│   │       ├── business-rule-banner.tsx      # In-page contextual business rule banners
│   │       ├── button.tsx                    # Workstation buttons with loading spinner states
│   │       ├── card.tsx                      # Structured card containers
│   │       ├── dialog.tsx                    # Accessible modal dialogs via Radix UI
│   │       ├── input.tsx                     # Sanitized input fields
│   │       ├── locale-switcher.tsx           # Bilingual English ↔ தமிழ் toggle pill
│   │       ├── table.tsx                     # Data grid tables for ledger rows
│   │       ├── tabs.tsx                      # Accessible navigation tabs
│   │       └── tooltip.tsx                   # Informational tooltips
│   ├── lib/
│   │   ├── api-client.ts                     # Kumaran API client singleton & unwrapApiResponse helper
│   │   ├── fonts.ts                          # Google Fonts: Inter (Latin) & Noto Sans Tamil (Tamil)
│   │   ├── query-client.ts                   # QueryClient factory with financial retry boundaries
│   │   ├── query-keys.ts                     # Deterministic query key factory
│   │   └── utils.ts                          # Class name merger (clsx + tailwind-merge)
│   └── stores/
│       └── auth-store.ts                     # Zustand store for user identity, branch context & tokens
├── messages/
│   ├── en.json                               # English dictionary (224 keys)
│   └── ta.json                               # Tamil dictionary (224 keys)
├── next.config.ts                            # Next.js configuration (standalone output)
├── package.json                              # Workspace dependencies (React 19, Next 15, TanStack Query)
└── tsconfig.json                             # Strict TypeScript configuration with @/* path aliases
```

---

## 3. Core Architectural Implementations

### 3.1 Whole Rupee Financial Invariant (Guardrail 2)
In accordance with **Guardrail 2**, all monetary amounts in the user interface strictly represent whole integer Rupees:
- Decimal fractions and paise (`.00`) are strictly eliminated.
- Handled via `formatRupee(val)` from `@kumaran/api-client`:
  $$\text{formatRupee}(100000n) \implies \text{"₹1,00,000"}$$
- Verified by 7 dedicated automated tests in `test/financial-guardrail2.spec.ts`.

### 3.2 Bank-Grade Server State Caching (`apps/web/src/providers/query-provider.tsx`)
Configured specifically for cashiers and accountants:
- **`staleTime: 60 * 1000` (1 minute)**: In-flight tab navigation reuses fresh cache.
- **`gcTime: 5 * 60 * 1000` (5 minutes)**: Inactive queries purged after 5 minutes.
- **`refetchOnWindowFocus: false`**: Eliminates unexpected form resets while cashiers enter customer payments.
- **`retry: false` for Mutations**: Payment, reversal, and disbursement mutations never auto-retry on failure to prevent duplicate financial processing.

### 3.3 Mutex-Locked Token Refresh & Idempotency Header (`apps/web/src/lib/api-client.ts`)
- **Mutex Lock**: When an access token expires (401), pending concurrent requests wait on a single `refreshPromise`, preventing the RFC 6819 Token Reuse Trap.
- **Automatic Retries**: Failed requests retry automatically once a new access token is acquired.
- **Idempotency-Key**: Mutation endpoints automatically receive a unique UUIDv4 `Idempotency-Key` header.

### 3.4 20-Minute Inactivity Guardian (`apps/web/src/components/security/session-inactivity-guard.tsx`)
- **Activity Listeners**: Throttled (500ms) event listeners on `mousemove`, `mousedown`, `keydown`, `scroll`, and `touchstart`.
- **18-Minute Warning**: Triggers amber warning modal with live seconds countdown.
- **Auto-Logout on 20-Minute Idle**: Purges BFF HttpOnly session cookies via `logout('timeout')` and navigates to `/login?reason=timeout`.
- **Client Boot Auto-Hydration**: Calls `useAuthStore.getState().hydrate()` on mount to check session state via `GET /api/auth/session` without triggering redundant logout broadcasts when unauthenticated.

---

## 4. Verification Proofs & Test Results

```
✔ ApiClient: getApiBaseUrl falls back to localhost when env is unset (3.44ms)
✔ ApiClient: Token storage bridge enforces zero secret tokens in client storage under BFF architecture (1.18ms)
✔ ApiClient: Token storage bridge operates correctly when window/localStorage are present (1.00ms)
✔ ApiClient: unwrapApiResponse successfully unwraps standard NestJS data envelopes (3.11ms)
✔ ApiClient: unwrapApiResponse transforms 401 error into KumaranApiError (2.77ms)
✔ ApiClient: unwrapApiResponse transforms 403 Maker-Checker violation into KumaranApiError (1.14ms)
✔ ApiClient: unwrapApiResponse transforms 409 Conflict into KumaranApiError (1.21ms)
✔ QueryKeys: Registry guarantees deterministic keys matching cache invalidation graph (3.46ms)
✔ AuthStore: Initial state is unauthenticated with null user (4.07ms)
✔ AuthStore: setAuth correctly establishes session with user and tokens (3.47ms)
✔ AuthStore: updateUser mutates partial profile without overwriting existing fields (0.55ms)
✔ AuthStore: setActiveBranchId switches current workstation branch context (0.37ms)
✔ AuthStore: recordActivity updates timestamp (0.61ms)
✔ AuthStore: logout purges user and tokens, resetting auth state (99.64ms)
✔ AuthStore: hydrate gracefully handles absent tokens (1.09ms)
✔ Guardrail 2: formatRupee correctly formats whole rupees without decimals (64.92ms)
✔ Guardrail 2: formatRupeeAmount produces comma-grouped whole integer strings (1.53ms)
✔ Guardrail 2: parseWholeRupees converts inputs to integer rupees, stripping decimals (0.81ms)
✔ Guardrail 2: assertWholeRupee rejects negative numbers, fractions, and paise (2.53ms)
✔ Guardrail 2: sanitizeWholeRupeeInput strips non-digits and leading zeros (0.93ms)
✔ Guardrail 2: isValidWholeRupeeInput validates whole integer strings (0.85ms)
✔ Guardrail 2: formatRupeeWords converts integer amounts to Indian denominations (1.21ms)
✔ InactivityGuard: Active state when idle time is under 18 minutes (3.17ms)
✔ InactivityGuard: Warning state triggers at exactly 18 minutes (1,080,000 ms) (0.53ms)
✔ InactivityGuard: Timeout triggers at 20 minutes (1,200,000 ms) (0.61ms)
✔ InactivityGuard: Reset action restores status to ACTIVE and clears countdown (0.55ms)
✔ InactivityGuard: Custom threshold configuration operates accurately (0.60ms)
-----------------------------------------------------------------------------------------
Foundation Tests: 26 passing, 0 failing
TypeScript:       tsc --noEmit passed with 0 errors
Next.js Build:    next build compiled successfully
```
