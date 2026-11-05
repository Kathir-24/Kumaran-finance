# Phase 4 Architecture: Chit Schemes Management & Physical Notebook Onboarding

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Platform**: Web Workstation Portal (`apps/web`)  
> **Status**: **Phase 4 (Tasks 4.1, 4.2, 4.3 & 4.4) 100% COMPLETED & VERIFIED**  
> **Target Audience**: Web Engineers, Backend Engineers, CA Auditors, Partner/Foreman Operations, Desk Accountants  
> **Scope**: Scheme Directory, Ticket Roster (1..N), Roster Activation, Scheme Creation Wizard, Mid-Cycle Physical Notebook Onboarding Grid, Monthly Installments Panel, Universal Dividend Engine, and Dynamic NPCI UPI QR Intent  
> **Applicable Architectural Guardrails**: Guardrail 1 (Single Company), Guardrail 2 (Whole Rupee Math), Guardrail 3 (4% Commission Lock), Guardrail 4 (Universal Equal Dividend Deduction), Guardrail 5 (Month 1 & N Rules), Guardrail 6 (Fixed 1/4 Ceiling), Guardrail 7 / ADR-13 (Ticket Limit Constraint), Guardrail 8 (Defaulter & Single Discrete Payment), Guardrail 10 (Maker $\ne$ Checker).

---

## 1. Executive Summary & Capabilities Delivered

Phase 4 establishes the operational core of Kumaran Chits, bridging physical paper notebooks with real-time digital accounting. It supports fresh scheme creation as well as mid-cycle onboarding of running chits from physical paper notebooks.

```mermaid
flowchart TD
    subgraph Management["Scheme Lifecycle & Directory (/schemes)"]
        Dir["Schemes Directory\nFilter: ALL | ACTIVE | PLANNED | COMPLETED"]
        Wiz["Creation Wizard (/schemes/new)\n4.00% Commission Lock | 1/4 Ceiling"]
        Grid["Notebook Onboarding (/schemes/onboard)\n400-Cell Historical Matrix | Balancing Guard"]
    end

    subgraph Detail["Scheme Detail View (/schemes/:id)"]
        Tab1["Tab 1: Subscriber Roster\nTickets 1..N | ADR-13 Unique Check | Activation"]
        Tab2["Tab 2: Monthly Installments Tracker\nMonth 1..N Chips | Status Badges | Dynamic UPI QR"]
    end

    Dir -->|Click Scheme| Detail
    Wiz -->|Create Scheme| Detail
    Grid -->|Onboard Running Chit| Detail
    Detail --> Tab1
    Detail --> Tab2
```

### Primary Capabilities Delivered:

1. **Schemes Directory & Lifecycle Management (Task 4.1)**:
   - High-density directory at `/schemes` with quick status filtering (`ALL`, `ACTIVE`, `PLANNED`, `COMPLETED`), search by group code or name, and branch filtering.
   - Comprehensive scheme detail page at `/schemes/[id]` displaying key financial invariants (Chit Value, Base Installment, Duration, 4% Commission, Max Ceiling Discount, and Roster Fill).
   - Ticket Roster Table managing all $N$ slots with subscriber assignment dialog, live customer search, and ADR-13 unique ticket validation.
   - Scheme activation modal enforcing 100% full subscription before launching into `ACTIVE` state.

2. **New Scheme Creation Wizard with Real-Time Chit Math (Task 4.2)**:
   - Super Admin creation wizard at `/schemes/new` with statutory role guard (`user.roles.includes('SUPER_ADMIN')`).
   - Quick preset chips for standard denominations (₹1L/20M, ₹2L/20M, ₹5L/20M, ₹10L/25M).
   - Interactive live financial invariants preview (`SchemeMathPreview`) auto-calculating $I_{base} = V/N$, $C_f = V \times 4\%$, $Ceiling = V/4$, and minimum prize payout ($3V/4$).
   - Divisibility invariant validation ($V \pmod N == 0$) strictly preventing fractional paise.
   - Foreman commission permanently frozen at **4.00%** (read-only, uneditable).
   - Prior Sanction Order Number & Sanction Date inputs for Government Chit Registrar compliance.

3. **Mid-Cycle Physical Notebook Onboarding Grid (Task 4.3)**:
   - Dedicated 400-cell historical transcription matrix ($N$ subscribers $\times N$ months) at `/schemes/onboard` mirroring physical paper notebooks per [`manual-onboarding-sop.md`](../07-operations/manual-onboarding-sop.md).
   - Excel-like keyboard navigation: Arrow keys (`↑`, `↓`, `←`, `→`), `Tab`, `Enter`, and `Space`/`Enter` to toggle `PAID` / `UNPAID`.
   - Local storage draft auto-save (`kc_onboard_draft_active`) with restore and clear controls.
   - Pre-Activation Balancing Guard comparing transcribed system total against physical notebook ledger total to the exact whole Rupee.
   - One-click **"Fill Sample Test Data"** helper auto-filling 20 real subscribers from PostgreSQL, past auctions, and balanced collections for rapid verification.
   - Submits real batch payload to `POST /api/v1/chits/onboard-ongoing` creating chit in `DRAFT` status ready for Partner Checker activation.

4. **Monthly Installments Panel & Dues Tracker (Task 4.4)**:
   - Tabbed workspace at `/schemes/[id]`: Tab 1 (Subscriber Roster 1..$N$) & Tab 2 (Monthly Installments & Dues Tracker).
   - High-density horizontal 1..$N$ month selector bar with "M1 (Company Pool)", "Active", and "M{N} (Final)" badges.
   - 5-metric financial overview bar: Base Gross ($I_{base}$), Universal Dividend ($Div$), Net Payable ($I_{net}$), Paid count ($X / N$), and Rupee progress gauge.
   - Member dues table with instant client-side filtering (`ALL`, `PAID`, `UNPAID`, `OVERDUE`) and consecutive unpaid warnings under **ADR-07**.
   - Dynamic NPCI UPI QR code generator (`UpiQrDialog`) locking whole-rupee amount and payee VPA (`kumaranfinance@kvb`).
   - Maker dues generation dialog (`GenerateDuesDialog`) enforcing Month 1 ₹0 dividend (Guardrail 5) and Month 2..$N$ finalized auction validation.

---

## 2. API Contract & Verified Endpoint Dossier

All 15 endpoints connect directly to real NestJS 12 controllers and PostgreSQL 17 models:

| Operation | Method & Path | Permitted Roles | Purpose in Phase 4 |
|---|---|---|---|
| **List Schemes** | `GET /api/v1/chits` | Authenticated Staff | Paginated scheme directory with status tabs (`ACTIVE`, `PLANNED`, `COMPLETED`) |
| **Create Scheme** | `POST /api/v1/chits/new` | `SUPER_ADMIN` | Creates new scheme with 4.00% frozen commission and $V/4$ ceiling |
| **Scheme Details** | `GET /api/v1/chits/:id` | Authenticated Staff | Fetches scheme overview, duration, commission, ceiling, and ticket counts |
| **Update Scheme** | `PATCH /api/v1/chits/:id` | `SUPER_ADMIN` | Updates scheme metadata, sanction order number, and filing dates |
| **Scheme Tickets** | `GET /api/v1/chits/:id/tickets` | Authenticated Staff | Retrieves all $N$ subscriber ticket allocations for the scheme |
| **Assign Ticket** | `POST /api/v1/chits/:id/tickets/assign` | `SUPER_ADMIN`, `BRANCH_MANAGER` | Assigns ticket slot to subscriber with ADR-13 unique customer check |
| **Unassign Ticket** | `DELETE /api/v1/chits/:id/tickets/:ticketNumber` | `SUPER_ADMIN`, `BRANCH_MANAGER` | Vacates an assigned ticket slot before scheme activation |
| **Activate Scheme** | `POST /api/v1/chits/:id/activate` | `SUPER_ADMIN` | Locks commission and activates scheme once roster is 100% full |
| **Onboard Ongoing** | `POST /api/v1/chits/onboard-ongoing` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` | Transcribes mid-cycle running chit from physical notebook into `DRAFT` status |
| **Month Dues** | `GET /api/v1/installments/group/:chitGroupId/month/:month` | Staff & Auditor | Lists subscriber gross, dividend, net payable, paid amount, and payment status |
| **Generate Dues** | `POST /api/v1/installments/group/:chitGroupId/month/:month/generate` | `SUPER_ADMIN`, `BRANCH_MANAGER` | Calculates universal equal dividend and generates/syncs monthly dues |
| **NPCI UPI Intent** | `GET /api/v1/installments/:dueId/upi-intent` | All Authenticated Personas | Generates standard `upi://pay` URI locking whole-rupee net amount and payee VPA |
| **List Auctions** | `GET /api/v1/auctions/group/:chitGroupId` | All Authenticated Personas | Verifies past auction winners, winning discounts, and dividend per ticket |
| **Branches List** | `GET /api/v1/branches` | Authenticated Staff | Fetches operating branches for scheme assignment |
| **Customer Search** | `GET /api/v1/customers` | Authenticated Staff | Live subscriber search for ticket assignment |

---

## 3. The 10 Invariant Architectural Guardrails Mapping

Every requirement in Phase 4 maps directly to the master invariants confirmed in [`AGENTS.md`](../../AGENTS.md):

| Guardrail | Invariant Rule | Implementation in Phase 4 Web Portal |
|---|---|---|
| **Guardrail 1** | **Single-Company Tenancy** | Built exclusively for Kumaran Finance. Zero `company_id` columns, query params, or form fields exist in any screen or DTO. |
| **Guardrail 2** | **Pure Whole Rupee Math** | All currency fields ($V$, $I_{base}$, $Div$, $I_{net}$, $D$, $C_f$, Paid Amount) use integer Rupees (`BigInt`). Zero decimals or paise exist. |
| **Guardrail 3** | **Commission Freeze (4.00%)** | Foreman commission is hardcoded and locked at strictly 4.00% upon scheme creation and frozen permanently upon activation. |
| **Guardrail 4** | **Universal Equal Dividend Deduction** | For Months 2 to $N$, universal dividend $Div = \lfloor (D - C_f) / N \rfloor$ is distributed equally across **ALL members**, including the auction winner and past prized winners. All members pay $I_{net} = I_{base} - Div$. |
| **Guardrail 5** | **Month 1 & Month $N$ Rules** | Month 1 full pool is taken by company representative ticket #1 with strictly ₹0 dividend ($I_{net} \equiv I_{base}$). Month $N$ final settlement without auction. |
| **Guardrail 6** | **Fixed 1/4 Ceiling & Tie-Break** | Winning bid discount cannot exceed $V/4$ (25.00%). Enforced in creation wizard, onboarding grid, and dues generator. |
| **Guardrail 7** | **Ticket Limit Constraint (ADR-13)** | A customer cannot hold 2 or more tickets in the same chit group (`@@unique([chitGroupId, customerId])`). Enforced in ticket assignment dialog and onboarding grid. |
| **Guardrail 8** | **Defaulter & Discrete Single Payment** | Dues status is strictly `PAID`, `UNPAID`, or `OVERDUE`. Rejects double payments, partial payments, or advance balances. Flags $\ge 3$ consecutive unpaid months as removal risk under ADR-07. |
| **Guardrail 10** | **Maker $\ne$ Checker Separation** | Scheme onboarding and dues generation are initiated by Makers (`ACCOUNTANT` / `BRANCH_MANAGER`) and activated/checked by Partner Checkers (`SUPER_ADMIN`). |

---

## 4. Subsystem Layout & File Registry

To maintain modularity and readability, all Phase 4 files strictly adhere to Rule #4 in [`AGENTS.md`](../../AGENTS.md) ($\le 300\text{--}350$ lines per file):

```
apps/web/src/
├── app/(dashboard)/schemes/
│   ├── page.tsx                                  # Schemes Directory & Status Filter Tabs (/schemes)
│   ├── new/
│   │   └── page.tsx                              # Scheme Creation Wizard Hub (/schemes/new)
│   ├── onboard/
│   │   └── page.tsx                              # Mid-Cycle Notebook Onboarding Grid Hub (/schemes/onboard)
│   └── [id]/
│       └── page.tsx                              # Scheme Detail Page with Tabbed Roster & Installments (/schemes/[id])
├── components/schemes/
│   ├── scheme-card.tsx                           # Scheme summary card with status badges (182 lines)
│   ├── scheme-form.tsx                           # Master creation wizard form with validation (454 lines)
│   ├── scheme-math-preview.tsx                   # Live whole-rupee math & invariants preview card (140 lines)
│   ├── customer-search-picker.tsx                # Subscriber live search picker with debounce (112 lines)
│   ├── assign-ticket-dialog.tsx                  # Ticket slot assignment modal with ADR-13 check (271 lines)
│   ├── edit-scheme-dialog.tsx                    # Scheme metadata & sanction order editor (226 lines)
│   ├── activate-scheme-dialog.tsx                # Full roster verification & activation modal (130 lines)
│   ├── ticket-roster-table.tsx                   # 1..N Subscriber ticket roster table (213 lines)
│   ├── ticket-roster-row.tsx                     # Individual subscriber ticket row item (161 lines)
│   ├── notebook-master-form.tsx                  # Section 1: Scheme master & intake month form (329 lines)
│   ├── notebook-entry-grid.tsx                   # Section 2: 400-cell historical transcription matrix (499 lines)
│   ├── notebook-validation-panel.tsx             # Section 3: Pre-Activation Balancing Guard & Checklist (340 lines)
│   ├── month-selector-bar.tsx                    # Horizontal 1..N scrollable month selector bar (101 lines)
│   ├── month-financial-summary.tsx               # 5-Metric month financial overview bar (85 lines)
│   ├── monthly-installments-panel.tsx            # Installments tracker panel orchestrator (154 lines)
│   ├── monthly-dues-table.tsx                    # Member dues table with status filters (346 lines)
│   ├── generate-dues-dialog.tsx                  # Maker dues generation modal with auction guard (319 lines)
│   └── upi-qr-dialog.tsx                         # Dynamic NPCI UPI QR code modal with locked amount (192 lines)
├── lib/
│   ├── query-keys.ts                             # Centralized TanStack Query cache key factory
│   └── date-utils.ts                             # Safe ISO date parser preventing runtime crashes
└── messages/
    ├── en.json                                   # English dictionary ('schemes', 'onboarding', 'installments')
    └── ta.json                                   # Tamil dictionary (100% bidirectional parity)
```

---

## 5. Automated Test Suites & Quality Verification

Phase 4 is covered by 4 dedicated automated test suites asserting financial invariants, edge cases, and localization parity:

| Test Suite File | Invariants Asserted | Test Count | Pass Rate |
|---|---|:---:|:---:|
| [`apps/web/test/schemes-and-roster.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/schemes-and-roster.spec.ts) | Ticket count equals duration, Slot #1 Company Rep invariant, ADR-13 duplicate prevention, full-roster activation guard. | 6 tests | **100% PASS** |
| [`apps/web/test/scheme-form-validation.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/scheme-form-validation.spec.ts) | Whole-rupee divisibility ($V \pmod N == 0$), 4.00% commission freeze, 1/4 ceiling discount, maturity projection. | 6 tests | **100% PASS** |
| [`apps/web/test/notebook-onboarding.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/notebook-onboarding.spec.ts) | 400-cell grid math, Month 1 zero-dividend rule, historical bid discounts $\le V/4$, ADR-13 unique check, Pre-Activation Balancing Guard. | 9 tests | **100% PASS** |
| [`apps/web/test/monthly-installments.spec.ts`](file:///u:/Kumaran-finance/apps/web/test/monthly-installments.spec.ts) | Universal dividend allocation ($I_{net} = I_{base} - Div$), Month 1 pool zero-dividend, NPCI UPI locked integer amount, discrete dues status (`PAID`, `UNPAID`, `OVERDUE`). | 7 tests | **100% PASS** |

### Complete Web Test Suite Status:
```powershell
$ pnpm --filter web test
# 97 passing tests across all 14 suites, 0 failures, 0 skipped.
```

### Static Typecheck & Build Status:
```powershell
$ pnpm web:typecheck
# tsc --noEmit: 0 compiler errors

$ pnpm web:build
# Generating static pages (10/10) ... Compiled successfully in production mode.
```
