# Phase 3 Architecture: Dashboard Shell, RBAC & Operating Instructions

> **Subsystem**: Web Workstation Portal (`apps/web`)  
> **Status**: **Task 3.1 COMPLETED & VERIFIED** (51/51 passing unit tests, 0 TypeScript errors, clean production build)  
> **Applicable Architectural Guardrails**: Guardrail 1 (Single Company), Guardrail 2 (Whole Rupee Math), Guardrail 10 (Maker $\ne$ Checker), ADR-18 (Phone Identity).

---

## 1. Overview & Business Purpose

The authenticated desktop shell (`apps/web/src/app/(dashboard)/layout.tsx`) is the central nerve center for Kumaran Finance operations across the 4 Partners (Super Admin), Branch Manager, Desk Accountant, Field Collection Agents, and CA Auditor.

It delivers:
1. **Dynamic RBAC Sidebar Navigation**: Navigation links are dynamically filtered according to the authenticated user's real roles from `useAuthStore` (`user.roles`), strictly enforcing the RBAC permissions matrix.
2. **Real-Time Maker-Checker SSE Stream**: Subscribes to live Server-Sent Events stream (`GET /api/v1/reports/approvals-stream`) via `useApprovalsStream` hook to display real-time badges for pending cash handovers, prize disbursements, and payment reversals.
3. **Multi-Branch Context Switcher**: Fetches registered physical branches (`GET /api/v1/branches?activeOnly=true`) and updates `activeBranchId` in `useAuthStore`, automatically refreshing TanStack Query caches.
4. **Bilingual Toggle (English ↔ தமிழ்)**: 100% dictionary key parity across navigation items, topbar, and sidebar elements.
5. **Staff Profile & 2FA Security Menu**: Instant visibility into active role badges, Perundurai branch affiliation, and 1-click modal triggers for configuring or disabling Microsoft Authenticator RFC 6238 TOTP.

---

## 2. Dynamic RBAC Navigation Matrix

| Route Path | Translation Key | Icon | Super Admin | Accountant | Auditor | Branch Manager | Collection Agent |
|---|---|---|:---:|:---:|:---:|:---:|:---:|
| `/` | `nav.dashboard` | `LayoutDashboard` | Visible | Visible | Visible (Read-only) | Visible | Visible |
| `/schemes` | `nav.schemes` | `Landmark` | Visible | Visible | Visible (Read-only) | Visible | **Hidden** |
| `/schemes/onboard` | `nav.onboardGrid` | `BookOpen` | Visible | Visible (Maker) | **Hidden** | **Hidden** | **Hidden** |
| `/customers` | `nav.customers` | `Users` | Visible | Visible | Visible (Read-only) | Visible | Visible |
| `/auctions` | `nav.auctions` | `Gavel` | Visible | **Hidden** | Visible (Read-only) | Visible | **Hidden** |
| `/disbursements` | `nav.disbursements` | `Award` | Visible | Visible (Voucher) | **Hidden** | Visible | **Hidden** |
| `/collections` | `nav.collections` | `Receipt` | Visible | Visible | **Hidden** | Visible | Visible |
| `/collections/handover` | `nav.handover` | `Banknote` | Visible | Visible | **Hidden** | Visible | Visible |
| `/reversals` | `nav.reversals` | `RefreshCw` | Visible | Visible (Maker) | **Hidden** | Visible | **Hidden** |
| `/reports` | `nav.reports` | `FileSpreadsheet` | Visible | Visible | Visible (Ledgers) | Visible | **Hidden** |
| `/instructions` | `nav.instructions` | `BookCheck` | Visible | Visible | Visible | Visible | Visible |
| `/branches` | `nav.branches` | `Building2` | Visible | **Hidden** | **Hidden** | **Hidden** | **Hidden** |
| `/users` | `nav.users` | `UserCog` | Visible | **Hidden** | **Hidden** | **Hidden** | **Hidden** |

---

## 3. Real-Time Stream Architecture & Dual-Control

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Authenticated Staff / Partner
    participant Layout as (dashboard)/layout.tsx
    participant Store as useAuthStore (Zustand)
    participant Topbar as topbar.tsx
    participant Sidebar as sidebar.tsx
    participant Hook as useApprovalsStream
    participant API as NestJS 12 API

    Staff->>Layout: Opens Web Portal (e.g. / or /schemes)
    Layout->>Store: Check isAuthenticated
    alt Not Authenticated
        Layout->>Staff: Redirect to /login?reason=unauthenticated
    else Authenticated
        Layout->>Sidebar: Render with user.roles & active pathname
        Sidebar->>Sidebar: Filter nav items matching user.roles
        Layout->>Topbar: Render Topbar with activeBranchId
        Topbar->>API: GET /api/v1/branches?activeOnly=true
        API-->>Topbar: 200 OK [Branches List]
        Topbar->>Hook: Initialize useApprovalsStream()
        Hook->>API: GET /api/v1/reports/approvals-stream (Bearer Token)
        API-->>Hook: SSE Event: APPROVALS_UPDATE { summary }
        Hook->>Topbar: Update live badge count (e.g. 3 Pending)
    end
```

---

## 4. Components & File Registry

| File | Subsystem / Role | Key Responsibilities |
|---|---|---|
| `apps/web/src/components/layout/nav-items.ts` | Navigation Descriptor | Master definition of 13 navigation items with strongly-typed `allowedRoles` and `filterNavItemsByRoles()`. |
| `apps/web/src/components/layout/sidebar.tsx` | Responsive Sidebar | Desktop collapsible sidebar (260px $\leftrightarrow$ 72px) with tooltips, active emerald indicator bar, and mobile drawer. |
| `apps/web/src/components/layout/topbar.tsx` | Topbar Header | Active Branch dropdown, Maker-Checker Pending Approvals pill badge, bilingual locale toggle, and staff user profile menu. |
| `apps/web/src/components/ui/dropdown-menu.tsx` | Radix Dropdown Atom | Accessible, dark-themed workstation dropdown primitive wrapping `@radix-ui/react-dropdown-menu`. |
| `apps/web/src/stores/approvals-store.ts` | Approvals State | Zustand store tracking `totalPendingCount`, `cashHandoversCount`, `disbursementAuthorizationsCount`, `paymentReversalsCount`. |
| `apps/web/src/hooks/use-approvals-stream.ts` | SSE Client Hook | Streaming client connecting to `GET /api/v1/reports/approvals-stream` with chunk decoding, reconnect backoff, and TanStack Query fallback. |
| `apps/web/src/app/(dashboard)/layout.tsx` | Authenticated Shell | Layout wrapper with session hydration, unauthenticated route redirection guard, and skeleton loading state. |
| `apps/web/src/app/(dashboard)/page.tsx` | Dashboard Root (`/`) | Executive welcome header, Perundurai badge, quick launch tiles, and Guardrail 1 banner. |
| `apps/web/test/app-shell-rbac.spec.ts` | Automated Tests | 9 unit test suites verifying RBAC filtering, Approvals store, branch switcher, and bilingual key parity. |

---

## 5. Automated Verification & Test Proofs

- **Unit Test Suite**: 51/51 passing tests (`node --experimental-strip-types --test apps/web/test/*.spec.ts`) in ~450ms.
- **TypeScript Typecheck**: `pnpm --filter web typecheck` passed with 0 errors.
- **Production Next.js Build**: `pnpm --filter web build` succeeded in 8.7s with code 0:
  ```text
  Route (app)                                 Size  First Load JS
  ┌ ƒ /                                    3.33 kB         163 kB
  ├ ƒ /_not-found                            985 B         103 kB
  ├ ƒ /2fa                                  3.2 kB         139 kB
  └ ƒ /login                               28.8 kB         165 kB
  + First Load JS shared by all             102 kB
  ```
